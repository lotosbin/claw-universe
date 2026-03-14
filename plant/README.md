# Godot Plant Demo

一个分布式游戏主机的最小原型。

## 项目结构

```
godot-plant/
├── project.godot
├── main.tscn
├── main.gd
├── plant/
│   ├── plant.gd           # Plant 核心逻辑
│   ├── universe_client.gd # Universe 注册/发现
│   └── webrtc_server.gd  # P2P WebRTC 服务器
├── game/
│   ├── game_world.gd      # 游戏世界
│   └── player.gd         # 玩家数据
└── shared/
    └── protocol.gd       # 协议定义
```

## 1. project.godot

```godot
; Engine configuration file.
; It's best edited using the editor UI and not directly,
; since the parameters that go here are not all obvious.
;
; Format:
;   [section] ; section goes between []
;   param=value ; assign values to parameters

config_version=5

[application]

config/name="Plant Demo"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.2", "Forward Plus")
config/icon="res://icon.svg"

[display]

window/size/viewport_width=1280
window/size/viewport_height=720

[network]

limits/websocket/client/max_packet_size=32768

[rendering]

renderer/rendering_method="gl_compatibility"
```

## 2. main.tscn

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Node3D name="Main" unique_name_in_scene="true" xmlns:xi="http://www.ns3.org/2001/XInclude">
	<xi:include href="res://plant/plant.tscn" parse="xml"/>
</Node3D>
```

## 3. main.gd

```gdscript
extends Node3D

@onready var plant: Plant = $Plant

func _ready():
	print("=== Plant Demo Starting ===")
	
	# 配置 Universe 服务器
	plant.universe_url = "http://localhost:8080"
	
	# 配置 Plant 信息
	plant.game_type = "arena"
	plant.max_players = 8
	plant.region = "cn-east"
	
	# 启动 Plant
	await plant.start()
	
	print("=== Plant Running ===")
	print("Plant ID: ", plant.plant_id)
	print("Ready for players...")
```

## 4. plant/plant.gd

```gdscript
extends Node3D
class_name Plant

## Plant 核心逻辑

# Universe 配置
var universe_url: String = "http://localhost:8080"
var plant_id: String = ""
var registration_id: String = ""

# Plant 配置
var game_type: String = "arena"
var max_players: int = 8
var current_players: int = 0
var region: String = "cn-east"
var version: String = "1.0.0"

# 网络
var http_server: HTTPServer
var webrtc_server: WebRTCMultiplayerPeer
var connected_players: Dictionary = {}  # peer_id -> PlayerData
var registered_peers: Array = []

# 游戏世界
var game_world: GameWorld

# 信号
signal player_connected(peer_id: int, player_data: Dictionary)
signal player_disconnected(peer_id: int)
signal game_state_updated(state: Dictionary)

func _ready():
	# 生成唯一 Plant ID
	plant_id = _generate_plant_id()
	game_world = GameWorld.new()
	add_child(game_world)

func _process(delta):
	# 更新游戏世界
	if game_world:
		game_world.update_game(delta)
	
	# 广播游戏状态给所有玩家
	if not connected_players.is_empty():
		_broadcast_game_state()

func _exit_tree():
	# 清理
	unregister_from_universe()

# ============ 启动流程 ============

func start() -> void:
	# 1. 启动 WebRTC 服务器
	_start_webrtc_server()
	
	# 2. 注册到 Universe
	_register_to_universe()
	
	# 3. 启动心跳
	_start_heartbeat()

# ============ Universe 注册 ============

func _register_to_universe() -> void:
	var ip = _get_public_ip()
	var port = 3478  # WebRTC 端口
	
	var payload = JSON.stringify({
		"plant_id": plant_id,
		"host": ip,
		"port": port,
		"game_type": game_type,
		"max_players": max_players,
		"current_players": 0,
		"region": region,
		"version": version
	})
	
	var url = universe_url + "/api/plant/register"
	var result = await _http_post(url, payload)
	
	if result and result.get("code") == 0:
		registration_id = result.get("registration_id", "")
		print("Registered to Universe: ", registration_id)
	else:
		push_error("Failed to register to Universe: ", result)

func unregister_from_universe() -> void:
	if registration_id.is_empty():
		return
	
	var url = universe_url + "/api/plant/unregister"
	var payload = JSON.stringify({"registration_id": registration_id})
	_http_post(url, payload)

func _start_heartbeat() -> void:
	var timer = Timer.new()
	timer.wait_time = 30  # 30秒心跳
	timer.autostart = true
	timer.timeout.connect(_send_heartbeat)
	add_child(timer)

func _send_heartbeat() -> void:
	if registration_id.is_empty():
		return
	
	var url = universe_url + "/api/plant/heartbeat"
	var payload = JSON.stringify({
		"registration_id": registration_id,
		"current_players": connected_players.size()
	})
	_http_post(url, payload)

# ============ WebRTC P2P 服务器 ============

func _start_webrtc_server() -> void:
	webrtc_server = WebRTCMultiplayerPeer.new()
	
	# 创建信号中继服务器（简化版）
	# 生产环境需要实现完整的 WebRTC signaling
	var signal_server = WebSocketServer.new()
	signal_server.listen(3478, [])
	signal_server_peer_connected.connect(_on_signal_peer_connected)
	signal_server_peer_disconnected.connect(_on_signal_peer_disconnected)
	signal_server_message_received.connect(_on_signal_message_received)
	
	print("WebRTC Signaling Server started on port 3478")

func _on_signal_peer_connected(peer_id: int) -> void:
	print("Peer connected: ", peer_id)
	# 后续 WebRTC 握手逻辑

func _on_signal_peer_disconnected(peer_id: int) -> void:
	print("Peer disconnected: ", peer_id)
	_remove_player(peer_id)

func _on_signal_message_received(peer_id: int, message: String) -> void:
	_handle_player_message(peer_id, message)

# ============ 玩家管理 ============

func _handle_player_message(peer_id: int, message: String) -> void:
	var data = JSON.parse_string(message)
	if not data:
		return
	
	match data.get("type"):
		"join":
			_handle_player_join(peer_id, data)
		"input":
			_handle_player_input(peer_id, data)
		"chat":
			_handle_player_chat(peer_id, data)
		"leave":
			_remove_player(peer_id)

func _handle_player_join(peer_id: int, data: Dictionary) -> void:
	var player_data = {
		"peer_id": peer_id,
		"name": data.get("name", "Player" + str(peer_id)),
		"ready": true
	}
	
	connected_players[peer_id] = player_data
	current_players = connected_players.size()
	
	# 发送欢迎消息
	var welcome = {
		"type": "welcome",
		"player_id": peer_id,
		"game_state": game_world.get_state()
	}
	_send_to_peer(peer_id, welcome)
	
	player_connected.emit(peer_id, player_data)
	print("Player joined: ", player_data)

func _handle_player_input(peer_id: int, data: Dictionary) -> void:
	# 处理玩家输入，更新游戏状态
	if game_world:
		game_world.handle_player_input(peer_id, data.get("input", {}))

func _handle_player_chat(peer_id: int, data: Dictionary) -> void:
	var chat_msg = {
		"type": "chat",
		"peer_id": peer_id,
		"message": data.get("message", ""),
		"timestamp": Time.get_unix_time_from_system()
	}
	_broadcast(chat_msg)

func _remove_player(peer_id: int) -> void:
	if connected_players.has(peer_id):
		connected_players.erase(peer_id)
		current_players = connected_players.size()
		player_disconnected.emit(peer_id)
		print("Player left: ", peer_id)

# ============ 游戏状态广播 ============

func _broadcast_game_state() -> void:
	var state = game_world.get_state()
	var packet = {
		"type": "game_state",
		"state": state,
		"timestamp": Time.get_unix_time_from_system()
	}
	_broadcast(packet)

func _broadcast(message: Dictionary) -> void:
	var json = JSON.stringify(message)
	# 实际通过 WebRTC 发送
	pass

func _send_to_peer(peer_id: int, message: Dictionary) -> void:
	var json = JSON.stringify(message)
	# 实际通过 WebRTC 发送
	pass

# ============ 工具函数 ============

func _generate_plant_id() -> String:
	return "plant_" + str(Time.get_unix_time_from_system()) + "_" + str(randi() % 10000)

func _get_public_ip() -> String:
	# 简化：返回本机 IP
	# 生产环境需要通过 STUN 或 API 获取公网 IP
	var ip = IP.resolve_hostname(String(".").split(".").[0])
	return "127.0.0.1"  # TODO: 替换为实际公网 IP

func _http_post(url: String, body: String) -> Dictionary:
	# 简化实现，实际使用 HTTPClient 或 HTTPRequest
	var client = HTTPClient.new()
	var err = client.connect_to_host(url.get_slice("/", 2), 80)
	
	if err != OK:
		return {}
	
	while client.get_status() == HTTPClient.STATUS_CONNECTING:
		client.poll()
	
	if client.get_status() != HTTPClient.STATUS_CONNECTED:
		return {}
	
	var headers = ["Content-Type: application/json"]
	client.request(HTTPClient.METHOD_POST, url, headers, body)
	
	while client.get_status() == HTTPClient.STATUS_REQUESTING:
		client.poll()
	
	if client.get_status() != HTTPClient.STATUS_BODY_READY:
		return {}
	
	var response = client.read_response_body()
	var text = response.get_string_from_utf8()
	
	var json = JSON.new()
	var result = json.parse(text)
	if result == OK:
		return json.get_data()
	
	return {}
```

## 5. game/game_world.gd

```gdscript
extends Node3D
class_name GameWorld

## 简化版游戏世界

var players: Dictionary = {}  # peer_id -> PlayerState
var game_time: float = 0.0

signal state_changed(state: Dictionary)

func update_game(delta: float) -> void:
	game_time += delta
	
	# 更新所有玩家状态
	for peer_id in players:
		var player = players[peer_id]
		# 物理更新、动画更新等
		player.update(delta)

func handle_player_input(peer_id: int, input: Dictionary) -> void:
	if not players.has(peer_id):
		# 新玩家创建默认状态
		players[peer_id] = PlayerState.new()
	
	var player = players[peer_id]
	
	# 处理移动输入
	if input.has("move"):
		var dir = input["move"]
		player.position += Vector3(dir.x, 0, dir.y) * 5.0 * get_last_delta()
	
	# 处理动作输入
	if input.has("action"):
		_handle_action(peer_id, input["action"])

func _handle_action(peer_id: int, action: String) -> void:
	match action:
		"jump":
			players[peer_id].velocity.y = 10.0
		"attack":
			# 攻击逻辑
			pass

func get_state() -> Dictionary:
	var player_states = {}
	for peer_id in players:
		player_states[str(peer_id)] = players[peer_id].serialize()
	
	return {
		"game_time": game_time,
		"players": player_states,
		"world_time": Time.get_unix_time_from_system()
	}

var _last_delta: float = 0.0
func get_last_delta() -> float:
	return _last_delta

func _physics_process(delta: float) -> _last_delta = delta
```

## 6. game/player.gd

```gdscript
class_name PlayerState

extends RefCounted

var peer_id: int
var name: String = "Player"
var position: Vector3 = Vector3.ZERO
var rotation: float = 0.0
var velocity: Vector3 = Vector3.ZERO
var health: float = 100.0
var animation_state: String = "idle"

func _init() -> void:
	pass

func update(delta: float) -> void:
	# 应用速度
	position += velocity * delta
	# 重力
	velocity.y -= 20.0 * delta
	# 地面检测
	if position.y < 0:
		position.y = 0
		velocity.y = 0

func serialize() -> Dictionary:
	return {
		"peer_id": peer_id,
		"name": name,
		"x": position.x,
		"y": position.y,
		"z": position.z,
		"rotation": rotation,
		"health": health,
		"animation": animation_state
	}

func deserialize(data: Dictionary) -> void:
	peer_id = data.get("peer_id", 0)
	name = data.get("name", "Player")
	position = Vector3(data.get("x", 0), data.get("y", 0), data.get("z", 0))
	rotation = data.get("rotation", 0.0)
	health = data.get("health", 100.0)
	animation_state = data.get("animation", "idle")
```

## 7. 使用方法

### 启动 Universe 服务

```bash
# 方式1: 使用 claw-universe
cd claw-universe
./universe-server --port 8080
```

### 启动 Plant

```bash
# 使用 Godot headless 模式
godot4 --headless --path godot-plant
```

### 玩家连接

```gdscript
# Player 端连接代码示例
var ws = WebSocketPeer.new()
func connect_to_plant(host: String, port: int):
	ws.connect_to_url("ws://%s:%d" % [host, port])
```

## 8. 下一步

1. **完善 WebRTC 握手** - 实现完整的 ICE/STUN/TURN 流程
2. **添加 Universe HTTP API** - 为 claw-universe 添加 plant 注册接口
3. **Client 端实现** - Player 端的输入发送和状态渲染

需要我继续完善哪部分？
