#!/usr/bin/env node
// OpenClaw Hook - 发送状态到桌面宠物
// 可被 OpenClaw hooks 或定时任务调用

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
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
      agent: 'openclaw',
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
          console.log(`[OpenClaw-Hook] 通知成功: ${event} - ${status}`);
          resolve({ success: true });
        } else {
          console.error(`[OpenClaw-Hook] 通知失败: HTTP ${res.statusCode}`);
          resolve({ success: false });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[OpenClaw-Hook] 连接失败: ${err.message}`);
      resolve({ success: false });
    });
    
    req.write(payload);
    req.end();
  });
}

// 获取 OpenClaw 状态
function getOpenClawStatus() {
  try {
    // 尝试获取 openclaw status 输出
    const statusOutput = execSync('openclaw status --json 2>/dev/null', { 
      encoding: 'utf-8',
      timeout: 5000,
      maxBuffer: 1024 * 1024
    });
    
    return JSON.parse(statusOutput);
  } catch (e) {
    // 如果无法获取状态，返回基本信息
    return null;
  }
}

// 获取活跃会话信息
function getActiveSessions() {
  try {
    // 检查 sessions 目录
    const sessionsDir = path.join(os.homedir(), '.openclaw', 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      return files.filter(f => f.endsWith('.json')).length;
    }
  } catch (e) {
    // 忽略错误
  }
  return 0;
}

// 获取 Cron 任务状态
function getCronStatus() {
  try {
    const cronDir = path.join(os.homedir(), '.openclaw', 'cron');
    if (fs.existsSync(cronDir)) {
      const files = fs.readdirSync(cronDir);
      return {
        totalJobs: files.length,
        jobs: files.slice(0, 5) // 只返回前5个
      };
    }
  } catch (e) {
    // 忽略
  }
  return { totalJobs: 0, jobs: [] };
}

// 事件处理器
const eventHandlers = {
  // Gateway 启动
  'gateway:startup': async () => {
    await notifyDesktopPet('gateway:startup', 'active', 'OpenClaw Gateway 已启动', {
      timestamp: Date.now()
    });
  },

  // 新会话开始
  'session:new': async (data) => {
    const sessionKey = data?.sessionKey || 'unknown';
    await notifyDesktopPet('session:new', 'active', `新会话: ${sessionKey}`, {
      sessionKey,
      cwd: data?.cwd
    });
  },

  // 会话结束
  'session:end': async (data) => {
    const sessionKey = data?.sessionKey || 'unknown';
    await notifyDesktopPet('session:end', 'idle', `会话结束: ${sessionKey}`, {
      sessionKey
    });
  },

  // 命令执行
  'command:new': async (data) => {
    const command = data?.command || '/new';
    await notifyDesktopPet('command:new', 'thinking', `执行命令: ${command}`, {
      command
    });
  },

  // 心跳检测
  'heartbeat': async () => {
    const status = getOpenClawStatus();
    const activeSessions = getActiveSessions();
    const cronStatus = getCronStatus();
    
    const details = {
      activeSessions,
      ...(status?.metrics ? { metrics: status.metrics } : {}),
      cronJobs: cronStatus.totalJobs
    };
    
    // 根据活跃会话数确定状态
    const petStatus = activeSessions > 0 ? 'active' : 'idle';
    const message = activeSessions > 0 
      ? `OpenClaw 运行中 (${activeSessions} 个活跃会话)`
      : 'OpenClaw 空闲中';
    
    await notifyDesktopPet('heartbeat', petStatus, message, details);
  },

  // Agent 状态变化
  'agent:status': async (data) => {
    const agentStatus = data?.status || 'unknown';
    const agentName = data?.agent || 'main';
    await notifyDesktopPet('agent:status', agentStatus, `Agent [${agentName}]: ${agentStatus}`, {
      agent: agentName,
      status: agentStatus
    });
  },

  // 错误通知
  'error': async (data) => {
    const errorMsg = data?.message || '未知错误';
    await notifyDesktopPet('error', 'error', `错误: ${errorMsg}`, {
      error: errorMsg,
      stack: data?.stack
    });
  }
};

// 默认处理器 - 心跳
async function defaultHandler() {
  await eventHandlers.heartbeat();
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const eventName = args[0] || 'heartbeat';
  const eventData = args[1] ? JSON.parse(args[1]) : {};

  console.log(`[OpenClaw-Hook] 收到事件: ${eventName}`);

  const handler = eventHandlers[eventName];
  
  if (handler) {
    try {
      await handler(eventData);
    } catch (e) {
      console.error(`[OpenClaw-Hook] 处理错误: ${e.message}`);
      // 发送错误通知
      await notifyDesktopPet('error', 'error', `Hook 错误: ${e.message}`, {
        event: eventName,
        error: e.message
      });
    }
  } else {
    // 默认处理
    console.log(`[OpenClaw-Hook] 未知事件 ${eventName}，执行默认处理`);
    await defaultHandler();
  }

  process.exit(0);
}

main().catch(e => {
  console.error(`[OpenClaw-Hook] 致命错误: ${e.message}`);
  process.exit(1);
});
