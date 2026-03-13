#!/usr/bin/env node
/**
 * Desktop Pet Notify - Node.js 版本
 * 发送状态通知到桌面宠物应用
 */

const http = require('http');
const https = require('https');

const PET_URL = process.env.DESKTOP_PET_URL || 'http://localhost:3456';
const PET_TOKEN = process.env.DESKTOP_PET_TOKEN || '';
const AGENT_NAME = process.env.OPENCLAW_AGENT_NAME || 'main';

/**
 * 发送通知到桌面宠物
 * @param {string} event - 事件类型
 * @param {string} status - 状态
 * @param {string} message - 消息
 * @param {object} details - 额外数据
 */
function notify(event, status, message, details = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      event,
      agent: AGENT_NAME,
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
          resolve({ success: true, response: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const event = args[0] || 'status-change';
  const status = args[1] || 'idle';
  const message = args[2] || '';
  
  notify(event, status, message)
    .then(() => {
      console.log('✅ 通知已发送');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ 通知失败:', err.message);
      process.exit(1);
    });
}

module.exports = { notify };
