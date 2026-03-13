---
name: desktop-pet-notify
description: 主动通知桌面宠物应用 Agent 状态变化
metadata:
  openclaw:
    emoji: 🐱
    requires:
      bins: ["curl"]
    install: []
---

# Desktop Pet Notify Skill

当 Agent 状态变化时，发送通知到桌面宠物应用。

## 触发场景

当以下情况发生时自动通知:
- Agent 开始执行任务 (状态: 工作中)
- Agent 完成思考/任务 (状态: 空闲)
- Agent 遇到错误 (状态: 错误)
- 子 Agent 启动/完成

## 配置

在环境变量中设置:
- `DESKTOP_PET_URL`: 桌面宠物服务地址 (默认 http://localhost:3456)
- `DESKTOP_PET_TOKEN`: 可选的认证 Token

## 使用方式

```bash
# 手动触发通知
使用 curl 发送通知到桌面宠物

# 通知格式
curl -X POST $DESKTOP_PET_URL/notify \
  -H "Content-Type: application/json" \
  -d '{
    "event": "status-change",
    "agent": "当前 Agent 名称",
    "status": "active|idle|thinking|error",
    "message": "状态描述",
    "timestamp": 1234567890
  }'
```

## 事件类型

| 事件 | 说明 | 数据 |
|------|------|------|
| `status-change` | Agent 状态变化 | status, message |
| `task-start` | 任务开始 | taskName, taskId |
| `task-complete` | 任务完成 | taskName, taskId, result |
| `error` | 执行错误 | error, message |
| `heartbeat` | 心跳 | agents[], metrics |

## 实现逻辑

当 Agent 状态发生变化时:

1. 构建通知 Payload
2. 发送到桌面宠物 HTTP 端点
3. 根据状态更新宠物动画/状态

## 示例通知

```json
{
  "event": "status-change",
  "agent": "main",
  "status": "thinking",
  "message": "正在分析任务: 研究视频爆款趋势",
  "timestamp": 1234567890,
  "details": {
    "runId": "abc123",
    "model": "minimax/MiniMax-M2.5"
  }
}
```
