#!/bin/bash
# 定时通知桌面宠物当前 Agent 状态
# 可通过 OpenClaw Cron Job 调用

PET_URL="${DESKTOP_PET_URL:-http://localhost:3456}"
PET_TOKEN="${DESKTOP_PET_TOKEN:-}"

# 获取当前会话状态
STATUS_OUTPUT=$(openclaw status 2>/dev/null || echo '{"sessions":[]}')

# 解析活跃会话数
ACTIVE_COUNT=$(echo "$STATUS_OUTPUT" | grep -o '"active":[0-9]*' | grep -o '[0-9]*' | head -1)
TOTAL_COUNT=$(echo "$STATUS_OUTPUT" | grep -o '"total":[0-9]*' | grep -o '[0-9]*' | head -1)

# 构建 payload
PAYLOAD=$(cat <<EOF
{
  "event": "heartbeat",
  "status": "online",
  "message": "OpenClaw 运行中",
  "timestamp": $(date +%s),
  "details": {
    "activeSessions": ${ACTIVE_COUNT:-0},
    "totalSessions": ${TOTAL_COUNT:-0}
  }
}
EOF
)

# 发送心跳
if [ -n "$PET_TOKEN" ]; then
  curl -s -X POST "$PET_URL/notify" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $PET_TOKEN" \
    -d "$PAYLOAD" 2>/dev/null
else
  curl -s -X POST "$PET_URL/notify" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" 2>/dev/null
fi

echo "心跳已发送"
