#!/usr/bin/env node
/**
 * OpenClaw Pet Hook
 * 发送 OpenClaw 状态到桌面宠物应用
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
  // 异步发送，不等待结果
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
      
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[OpenClaw-Pet-Hook] 通知成功: ${event} - ${status}`);
          }
        });
      });

      req.on('error', () => {
        // 静默忽略网络错误
      });
      
      req.write(payload);
      req.end();
    } catch (e) {
      // 静默忽略所有错误
    }
  });
}

// 获取 OpenClaw 状态（安全版本）
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

// 获取活跃会话数（安全版本）
function getActiveSessions() {
  try {
    const sessionsDir = path.join(os.homedir(), '.openclaw', 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      return files.filter(f => f.endsWith('.jsonl')).length;
    }
  } catch (e) {
    // 忽略
  }
  return 0;
}

// 获取 Cron 任务数（安全版本）
function getCronJobs() {
  try {
    const cronDir = path.join(os.homedir(), '.openclaw', 'cron');
    if (fs.existsSync(cronDir)) {
      const files = fs.readdirSync(cronDir);
      return files.length;
    }
  } catch (e) {
    // 忽略
  }
  return 0;
}

// 事件处理函数（安全版本）
async function handleEvent(event) {
  try {
    const { type, action, sessionKey, timestamp, context } = event;
    const eventName = type + (action ? `:${action}` : '');
    
    console.log(`[OpenClaw-Pet-Hook] 收到事件: ${eventName}`);
    
    switch (eventName) {
      case 'command:new':
      case 'command:reset':
        notifyDesktopPet(eventName, 'thinking', `执行命令: ${action}`, {
          sessionKey,
          timestamp
        });
        break;
        
      case 'session:start':
        notifyDesktopPet(eventName, 'active', `会话开始: ${sessionKey}`, {
          sessionKey,
          timestamp
        });
        break;
        
      case 'session:end':
        notifyDesktopPet(eventName, 'idle', `会话结束: ${sessionKey}`, {
          sessionKey,
          timestamp
        });
        break;
        
      case 'gateway:startup':
        notifyDesktopPet(eventName, 'active', 'OpenClaw Gateway 已启动', {
          timestamp
        });
        break;
        
      case 'heartbeat':
      default:
        // 默认心跳处理 - 静默处理
        try {
          const activeSessions = getActiveSessions();
          const cronJobs = getCronJobs();
          
          const petStatus = activeSessions > 0 ? 'active' : 'idle';
          const message = activeSessions > 0 
            ? `OpenClaw 运行中 (${activeSessions} 个活跃会话)`
            : 'OpenClaw 空闲中';
          
          notifyDesktopPet('heartbeat', petStatus, message, {
            activeSessions,
            cronJobs
          });
        } catch (e) {
          // 心跳处理错误静默忽略
        }
        break;
    }
  } catch (e) {
    // 外层错误静默忽略
    console.error(`[OpenClaw-Pet-Hook] 处理错误: ${e.message}`);
  }
}

// OpenClaw Hook 导出格式 - 必须导出 default 函数
/**
 * OpenClaw hook handler
 * 特性：
 * - 完全异步，不阻塞主流程
 * - 所有错误内部处理，不会抛出异常
 * @param {Object} event - Hook event
 * @param {Object} context - Hook context
 */
async function defaultHandler(event, context) {
  // 使用 setImmediate 确保异步执行，不阻塞
  setImmediate(() => {
    try {
      handleEvent(event);
    } catch (e) {
      // 最外层错误捕获，确保不会影响 OpenClaw
      console.error(`[OpenClaw-Pet-Hook] 异常: ${e.message}`);
    }
  });
}

// 支持直接运行 (CLI)
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // 如果有参数，构建事件对象
  if (args.length > 0) {
    const eventName = args[0];
    const event = {
      type: eventName.split(':')[0] || 'heartbeat',
      action: eventName.split(':')[1] || null,
      timestamp: Date.now(),
      sessionKey: args[1] || 'cli'
    };
    handleEvent(event);
  } else {
    // 默认心跳
    handleEvent({ type: 'heartbeat', timestamp: Date.now() });
  }
}

// OpenClaw Hook 导出格式 - 必须导出 default 函数
module.exports = defaultHandler;
module.exports.default = defaultHandler;
