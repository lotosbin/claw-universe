#!/usr/bin/env node
// Claude Code Hook - 发送状态到桌面宠物
// 将 Claude Code 的事件转发到桌面宠物服务端

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 配置
const PET_URL = process.env.DESKTOP_PET_URL || 'http://localhost:3456';
const PET_TOKEN = process.env.DESKTOP_PET_TOKEN || '';

// 发送通知到桌面宠物
function notifyDesktopPet(event, status, message, details = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      event,
      agent: 'claude-code',
      status,
      message,
      timestamp: Date.now(),
      details
    });

    const url = new URL(PET_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: '/notify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    if (PET_TOKEN) {
      options.headers['Authorization'] = `Bearer ${PET_TOKEN}`;
    }

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true });
        } else {
          console.error(`[ClaudeCode-Hook] 通知失败: HTTP ${res.statusCode}`);
          resolve({ success: false });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[ClaudeCode-Hook] 连接失败: ${err.message}`);
      resolve({ success: false });
    });
    
    req.write(payload);
    req.end();
  });
}

// 状态映射 - 将 Claude Code 状态映射到宠物状态
function mapStatus(hookEvent, data) {
  switch (hookEvent) {
    case 'SessionStart':
      return { status: 'idle', message: '会话启动' };
    case 'UserPromptSubmit':
      return { status: 'thinking', message: data.title || '处理中...' };
    case 'PreToolUse':
      return { status: 'active', message: `使用工具: ${data.toolDetails || data.tool_name}` };
    case 'PostToolUse':
      return { status: 'active', message: '工具执行完成' };
    case 'Stop':
      return { status: 'idle', message: '执行完成' };
    case 'SessionEnd':
      return { status: 'idle', message: '会话结束' };
    default:
      return { status: 'idle', message: hookEvent };
  }
}

// 主函数
async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  // 无输入则静默退出
  if (!input.trim()) {
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    process.exit(0);
  }

  const {
    session_id,
    cwd,
    hook_event_name,
    tool_name,
    tool_input,
    prompt,
    source,
    reason
  } = data;

  // 没有 session_id 则跳过
  if (!session_id) {
    process.exit(0);
  }

  const now = Date.now();
  let message = '';
  let details = {};

  // 处理不同事件
  switch (hook_event_name) {
    case 'SessionStart':
      message = 'Claude Code 会话启动';
      details = { cwd, session_id };
      break;

    case 'UserPromptSubmit':
      // 提取用户提示
      let title = undefined;
      if (prompt) {
        let cleanPrompt = String(prompt);
        cleanPrompt = cleanPrompt.replace(/<system[-_]?(?:instruction|reminder)[^>]*>[\s\S]*?<\/system[-_]?(?:instruction|reminder)>/gi, '');
        cleanPrompt = cleanPrompt.replace(/^[\s\n]*<[^>]+>[\s\S]*?<\/[^>]+>[\s\n]*/gi, '');
        cleanPrompt = cleanPrompt.trim();
        if (cleanPrompt) {
          title = cleanPrompt.slice(0, 100).split('\n')[0].trim();
        }
      }
      message = title || '收到新任务';
      details = { cwd, session_id, title };
      break;

    case 'PreToolUse':
      // 提取工具详情
      let toolDetails = tool_name || 'unknown';
      if (tool_input) {
        if (tool_input.command) {
          toolDetails = `命令: ${String(tool_input.command).slice(0, 50)}`;
        } else if (tool_input.file_path) {
          toolDetails = `文件: ${path.basename(String(tool_input.file_path))}`;
        } else if (tool_input.pattern) {
          toolDetails = `搜索: ${String(tool_input.pattern).slice(0, 30)}`;
        } else if (tool_input.url) {
          toolDetails = `访问: ${String(tool_input.url).slice(0, 50)}`;
        } else if (tool_input.query) {
          toolDetails = `搜索: ${String(tool_input.query).slice(0, 50)}`;
        } else if (tool_input.prompt) {
          toolDetails = `任务: ${String(tool_input.prompt).slice(0, 50)}`;
        }
      }
      message = toolDetails;
      details = { tool_name, toolDetails, cwd, session_id };
      break;

    case 'PostToolUse':
      message = '工具执行完成';
      details = { tool_name, cwd, session_id };
      break;

    case 'Stop':
      message = '执行完成';
      details = { cwd, session_id };
      break;

    case 'SessionEnd':
      message = reason ? `会话结束: ${reason}` : '会话结束';
      details = { reason, cwd, session_id };
      break;

    default:
      // 未知事件，静默跳过
      process.exit(0);
  }

  // 映射状态
  const { status, message: defaultMessage } = mapStatus(hook_event_name, { ...data, title: details.title, toolDetails: details.toolDetails });
  const finalMessage = message || defaultMessage;

  // 发送通知
  await notifyDesktopPet(hook_event_name, status, finalMessage, details);
  
  // 静默退出
  process.exit(0);
}

main().catch(() => process.exit(0));
