# 分布式游戏架构设计 - Plant Universe

## 核心理念

**去中心化 P2P + 轻量级 Universe 发现服务**

服务器仅做"黄页"（ Plant 注册/发现），游戏数据传输全部 P2P 直连。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Universe Server                        │
│                  (仅负责注册/发现/心跳)                       │
│                    低成本/无状态/静默                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
    ┌─────▼─────┐           ┌─────▼─────┐
    │  Plant A  │◄──────────►│  Plant B  │
    │ (游戏服务端)│   P2P     │ (游戏服务端)│
    └─────┬─────┘           └─────┬─────┘
          │                        │
    ┌─────▼─────┐           ┌─────▼─────┐
    │ Player 1 │           │ Player 2  │
    └──────────┘           └──────────┘
```

---

## 组件设计

### 1. Universe Server (发现服务)

**职责:**
- Plant 注册（IP + Port + GameInfo）
- Plant 心跳维护（超时剔除）
- Player 查询可用 Plants

**技术选型:**
- 轻量 HTTP API + WebSocket 推送
- 可用现有 claw-universe 或自建（Go/Rust 单二进制）
- 推荐方案: 复用 claw-universe + 自定义 plugin

**成本:** ~$0-5/月（1核1G小鸡足以支持万级 Plant）

---

### 2. Plant (游戏服务端/宿主)

**职责:**
- 启动时向 Universe 注册
- 维护游戏世界逻辑（物理、AI、状态）
- 渲染游戏画面（可选： streaming 到 Player）
- 接受 Player P2P 连接

**技术选型:**
- Godot 4.x (Server 模式 headless)
- WebRTC 或 UDP NAT traversal
- gdtemplate (https://github.com/bitbeans/gdwebrtc)

**注册信息:**
```json
{
  "plant_id": "uuid-v4",
  "host": "1.2.3.4",
  "port": 3478,
  "game_type": "survival_arena",
  "max_players": 8,
  "current_players": 3,
  "region": "cn-east",
  "version": "1.0.0"
}
```

---

### 3. Player (游戏客户端)

**职责:**
- 从 Universe 发现可用 Plants
- 与目标 Plant 建立 P2P 连接
- 发送输入指令（移动、攻击、技能）
- 接收游戏状态/渲染画面

**技术选型:**
- Godot 4.x 完整客户端
- 可选: 纯输入接收，Plant 端渲染 + 视频流
- 推荐: 状态同步 + 客户端预测渲染

---

## P2P 通信方案

### 方案 A: WebRTC (推荐)

- 内置 NAT 穿透 (ICE/STUN/TURN)
- 跨平台兼容好
- 库: godot-webrtc, gdwebrtc

### 方案 B: UDP + NAT Punch

- 更低延迟，适合实时动作游戏
- 需要 TURN 中继作为 fallback
- 复杂度稍高

---

## 通信协议

### Player ↔ Plant 消息格式

```protobuf
message GamePacket {
  enum Type {
    INPUT = 1;        // 玩家输入
    STATE = 2;       // 游戏状态同步
    CHAT = 3;        // 聊天
    HEARTBEAT = 4;   // 连接保活
  }
  Type type = 1;
  uint64 seq = 2;
  bytes payload = 3;
}
```

---

## 部署流程

### Step 1: 启动 Universe Server

```bash
# 方式1: 复用 claw-universe
cd claw-universe
./universe-server --port 8080

# 方式2: 自建轻量发现服务
git clone github.com/your/universe-discovery
cd universe-discovery
docker run -p 8080:8080 your/discovery:latest
```

### Step 2: Plant 启动

```gdscript
# Godot Plant 启动脚本
func _ready():
    var universe_url = "http://your-universe-server:8080"
    var plant_info = {
        "host": get_public_ip(),
        "port": 3478,
        "game_type": "arena",
        "max_players": 8
    }
    register_to_universe(universe_url, plant_info)
    start_webrtc_server(3478)
```

### Step 3: Player 加入

```gdscript
# Player 发现并连接
func join_game():
    var plants = fetch_available_plants("http://your-universe-server:8080")
    var target = plants[0]
    connect_to_plant(target.host, target.port)
```

---

## 成本估算

| 组件 | 规格 | 月成本 |
|------|------|--------|
| Universe Server | 1核1G (Hertz/阿里云) | ¥10-30 |
| Plant 节点 | 玩家闲置电脑/云机器 | ¥0 (用户设备) |
| TURN Server (可选) | 按流量付费 | ¥0-50 |

**总计: ¥10-80/月** (取决于规模)

---

## 扩展思路

1. **Plant 激励机制** - 植物主可获得代币/积分
2. **跨区域匹配** - Universe 按 region 过滤最近 Plant
3. **Plant 评级** - 玩家评价系统，可靠的 Plant 排名靠前
4. **观战模式** - 通过 Universe 发现游戏，旁观 P2P 观看

---

## 下一步

1. 先用 Godot + WebRTC 搭最小原型
2. 复用 claw-universe 做发现服务
3. 测试 P2P 连接稳定性

需要我先写个 Godot Plant 端的 demo 代码吗？
