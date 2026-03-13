#!/bin/bash
# Claude Code Hook 安装脚本
# 将 hooks 配置安装到项目的 .claude/settings.json

set -e

# 获取脚本所在目录（即项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
CLAUDE_DIR="$PROJECT_DIR/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
HOOK_SCRIPT="$PROJECT_DIR/hooks/claude-code-hook.js"

# 创建 .claude 目录
mkdir -p "$CLAUDE_DIR"

# 检查 hook 脚本是否存在
if [ ! -f "$HOOK_SCRIPT" ]; then
    echo "Error: hook script not found: $HOOK_SCRIPT"
    exit 1
fi

# 创建 settings.json - 使用bun执行，并添加CLAW_UNIVERSE_URL环境变量
BUN_PATH="/Users/liubinbin/.bun/bin/bun"
cat > "$SETTINGS_FILE" <<EOF
{
  "SessionStart": [
    {
      "matcher": ".*",
      "hooks": [
        {
          "type": "command",
          "command": "$BUN_PATH $HOOK_SCRIPT",
          "env": {
            "CLAW_UNIVERSE_URL": "http://192.168.28.82:3456"
          }
        }
      ]
    }
  ],
  "UserPromptSubmit": [
    {
      "matcher": ".*",
      "hooks": [
        {
          "type": "command",
          "command": "$BUN_PATH $HOOK_SCRIPT",
          "env": {
            "CLAW_UNIVERSE_URL": "http://192.168.28.82:3456"
          }
        }
      ]
    }
  ],
  "PreToolUse": [
    {
      "matcher": ".*",
      "hooks": [
        {
          "type": "command",
          "command": "$BUN_PATH $HOOK_SCRIPT",
          "env": {
            "CLAW_UNIVERSE_URL": "http://192.168.28.82:3456"
          }
        }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": ".*",
      "hooks": [
        {
          "type": "command",
          "command": "$BUN_PATH $HOOK_SCRIPT",
          "env": {
            "CLAW_UNIVERSE_URL": "http://192.168.28.82:3456"
          }
        }
      ]
    }
  ],
  "Stop": [
    {
      "matcher": ".*",
      "hooks": [
        {
          "type": "command",
          "command": "$BUN_PATH $HOOK_SCRIPT",
          "env": {
            "CLAW_UNIVERSE_URL": "http://192.168.28.82:3456"
          }
        }
      ]
    }
  ],
  "SessionEnd": [
    {
      "matcher": ".*",
      "hooks": [
        {
          "type": "command",
          "command": "$BUN_PATH $HOOK_SCRIPT",
          "env": {
            "CLAW_UNIVERSE_URL": "http://192.168.28.82:3456"
          }
        }
      ]
    }
  ]
}
EOF
echo "Created settings.json with hooks (using bun with CLAW_UNIVERSE_URL env)"

echo "Claude Code hooks installed successfully!"
echo "Hook script: $HOOK_SCRIPT"
echo ""
echo "The following events will be hooked:"
echo "  - SessionStart"
echo "  - UserPromptSubmit"
echo "  - PreToolUse"
echo "  - PostToolUse"
echo "  - Stop"
echo "  - SessionEnd"
echo ""
echo "Restart Claude Code to apply the changes."
