#!/usr/bin/env node
/**
 * OpenClaw Hook - 发送状态到桌面宠物
 * 特性：完全异步，不阻塞 OpenClaw 主流程
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 配置
const PET_URL = process.env.DESKTOP_PET_URL || 'http://localhost:3456';
const PET_TOKEN = process.env.DESKTOP_PET_TOKEN || '';

// 静默发送通知（不等待结果，避免阻塞）
function notifyDesktopPet(event, status, message, details = {}) {
  setImmediate(() => {
    try {
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
      const req = client.request(options, () => {});
      req.on('error', () => {});
      req.write(payload);
      req.end();
    } catch (e) {
      // 静默忽略
    }
  });
}

// 安全获取 OpenClaw 状态
function getOpenClawStatus() {
  try {
    const statusOutput = execSync('openclaw status --json 2>/dev/null', { 
      encoding: 'utf-8',
      timeout: 5000,
      maxBuffer: 1024 * 1024
    });
    return JSON.parse(statusOutput);
  } catch (e) {
    return null;
  }
}

// 安全获取活跃会话数
function getActiveSessions() {
  try {
    const sessionsDir = path.join(os.homedir(), '.openclaw', 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      return files.filter(f => f.endsWith('.jsonl')).length;
    }
  } catch (e) {}
  return 0;
}

// 安全获取 Cron 任务数
function getCronJobs() {
  try {
    const cronDir = path.join(os.homedir(), '.openclaw', 'cron');
    if (fs.existsSync(cronDir)) {
      return fs.readdirSync(cronDir).length;
    }
  } catch (e) {}
  return 0;
}

// 事件处理（安全版本）
async function handleEvent(event) {
  try {
    const { type, action, sessionKey, timestamp } = event || {};
    const eventName = type + (action ? `:${action}` : '') || 'heartbeat';
    
    switch (eventName) {
      case 'command:new':
      case 'command:reset':
        notifyDesktopPet(eventName, 'thinking', `执行命令: ${action}`, { sessionKey, timestamp });
        break;
        
      case 'session:start':
        notifyDesktopPet(eventName, 'active', `会话开始: ${sessionKey}`, { sessionKey, timestamp });
        break;
        
      case 'session:end':
        notifyDesktopPet(eventName, 'idle', `会话结束: ${sessionKey}`, { sessionKey, timestamp });
        break;
        
      case 'gateway:startup':
        notifyDesktopPet(eventName, 'active', 'OpenClaw Gateway 已启动', { timestamp });
        break;
        
      case 'heartbeat':
      default:
        try {
          const activeSessions = getActiveSessions();
          const cronJobs = getCronJobs();
          const petStatus = activeSessions > 0 ? 'active' : 'idle';
          const message = activeSessions > 0 
            ? `OpenClaw 运行中 (${activeSessions} 个活跃会话)`
            : 'OpenClaw 空闲中';
          notifyDesktopPet('heartbeat', petStatus, message, { activeSessions, cronJobs });
        } catch (e) {}
        break;
    }
  } catch (e) {
    // 静默忽略
  }
}

// 主函数
async function main() {
  try {
    const args = process.argv.slice(2);
    const eventName = args[0] || 'heartbeat';
    const eventData = args[1] ? JSON.parse(args[1]) : {};

    handleEvent({ type: eventName, ...eventData });
  } catch (e) {}
  process.exit(0);
}

// 导出（供 OpenClaw Hook 使用）
async function defaultHandler(event, context) {
  setImmediate(() => {
    try {
      handleEvent(event);
    } catch (e) {}
  });
}

// 直接运行
if (require.main === module) {
  main();
}

module.exports = defaultHandler;
module.exports.default = defaultHandler;
