#!/bin/bash
# Desktop Pet Notify - 发送状态通知到桌面宠物应用
# 用法: ./notify.sh <event> <status> <message> [json_data]

EVENT=${1:-"status-change"}
STATUS=${2:-"idle"}
MESSAGE=${3:-""}
EXTRA_DATA=${4:-"{}"}

PET_URL="${DESKTOP_PET_URL:-http://localhost:3456}"
PET_TOKEN="${DESKTOP_PET_TOKEN:-}"

# 构建通知 payload
TIMESTAMP=$(date +%s)
AGENT_NAME="${OPENCLAW_AGENT_NAME:-main}"

PAYLOAD=$(cat <<EOF
{
  "event": "$EVENT",
  "agent": "$AGENT_NAME",
  "status": "$STATUS",
  "message": "$MESSAGE",
  "timestamp": $TIMESTAMP,
  "details": $EXTRA_DATA
}
EOF
)

# 发送通知
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

echo "通知已发送: $EVENT - $STATUS"
