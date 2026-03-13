---
name: openclaw-pet-hook
description: 发送 OpenClaw 状态到桌面宠物应用
metadata:
  openclaw:
    emoji: 🐱
    events:
      - heartbeat
      - session:new
      - session:end
      - command:new
      - gateway:startup
    requires:
      bins: ["node"]
---

# OpenClaw Pet Hook

当 OpenClaw 发生特定事件时，发送通知到桌面宠物应用。

## 事件

- `heartbeat`: 定时心跳
- `session:new`: 新会话开始
- `session:end`: 会话结束
- `command:new`: 新命令
- `gateway:startup`: Gateway 启动

## 配置

设置环境变量:
- `DESKTOP_PET_URL`: 桌面宠物服务地址 (默认 http://localhost:3456)
- `DESKTOP_PET_TOKEN`: 可选认证 Token

## 使用

```bash
# 发送心跳
node handler.js heartbeat

# 发送新会话事件
node handler.js session:new '{"sessionKey":"main"}'
```
