const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3456;
const TOKEN = process.env.PET_TOKEN || '';

// 宠物状态
let petState = {
  status: 'idle', // idle, thinking, active, error
  message: '',
  agent: 'main',
  lastUpdate: Date.now(),
  history: [],
  metrics: {
    totalEvents: 0,
    activeSessions: 0,
    totalSessions: 0
  }
};

// 通知历史（保留最近 50 条）
const MAX_HISTORY = 50;

// 简单的 HTML 页面（宠物界面）
function getPetHTML() {
  const statusEmoji = {
    idle: '😴',
    thinking: '🤔',
    active: '⚡',
    error: '❌'
  };
  
  const statusText = {
    idle: '空闲中',
    thinking: '思考中',
    active: '工作中',
    error: '出错啦'
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>桌面宠物 - Max</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .pet-container {
      text-align: center;
      padding: 40px;
    }
    .pet-emoji {
      font-size: 120px;
      animation: bounce 2s ease-in-out infinite;
      transition: transform 0.3s ease;
    }
    .pet-emoji.thinking { animation: pulse 1s ease-in-out infinite; }
    .pet-emoji.active { animation: shake 0.5s ease-in-out infinite; }
    .pet-emoji.error { animation: wobble 1s ease-in-out infinite; }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    @keyframes shake {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-10deg); }
      75% { transform: rotate(10deg); }
    }
    @keyframes wobble {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-15deg); }
      75% { transform: rotate(15deg); }
    }
    
    .pet-name {
      font-size: 24px;
      margin-top: 20px;
      color: #ffd700;
    }
    .pet-status {
      font-size: 18px;
      margin-top: 10px;
      color: #aaa;
    }
    .pet-message {
      font-size: 14px;
      margin-top: 15px;
      color: #888;
      max-width: 300px;
      word-wrap: break-word;
    }
    .agent-info {
      font-size: 12px;
      margin-top: 10px;
      color: #666;
    }
    
    .panel {
      margin-top: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 30px;
      min-width: 350px;
    }
    .panel h3 {
      font-size: 16px;
      margin-bottom: 20px;
      color: #ffd700;
    }
    
    .status-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    .status-item {
      background: rgba(0,0,0,0.3);
      padding: 15px;
      border-radius: 10px;
      text-align: center;
    }
    .status-item .label {
      font-size: 12px;
      color: #888;
    }
    .status-item .value {
      font-size: 20px;
      font-weight: bold;
      color: #fff;
    }
    
    .history {
      margin-top: 30px;
      text-align: left;
      max-height: 200px;
      overflow-y: auto;
    }
    .history-item {
      padding: 8px 12px;
      margin-bottom: 5px;
      background: rgba(0,0,0,0.2);
      border-radius: 5px;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
    }
    .history-item .time { color: #666; }
    .history-item .event { color: #4fc3f7; }
    .history-item .status { 
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 10px;
    }
    .status-idle { background: #4caf50; }
    .status-thinking { background: #ff9800; }
    .status-active { background: #2196f3; }
    .status-error { background: #f44336; }
    
    .controls {
      margin-top: 20px;
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    .btn {
      padding: 8px 20px;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s;
    }
    .btn:hover { transform: scale(1.05); }
    .btn-primary { background: #ffd700; color: #000; }
    .btn-secondary { background: rgba(255,255,255,0.2); color: #fff; }
  </style>
</head>
<body>
  <div class="pet-container">
    <div class="pet-emoji" id="petEmoji">${statusEmoji[petState.status]}</div>
    <div class="pet-name">Max ⚡</div>
    <div class="pet-status" id="petStatus">${statusText[petState.status]}</div>
    <div class="pet-message" id="petMessage">${petState.message || '等待任务中...'}</div>
    <div class="agent-info" id="agentInfo">Agent: ${petState.agent}</div>
    
    <div class="panel">
      <h3>📊 状态面板</h3>
      <div class="status-grid">
        <div class="status-item">
          <div class="label">总事件</div>
          <div class="value" id="totalEvents">0</div>
        </div>
        <div class="status-item">
          <div class="label">活跃会话</div>
          <div class="value" id="activeSessions">0</div>
        </div>
        <div class="status-item">
          <div class="label">总会话</div>
          <div class="value" id="totalSessions">0</div>
        </div>
        <div class="status-item">
          <div class="label">最后更新</div>
          <div class="value" id="lastUpdate">--</div>
        </div>
      </div>
      
      <div class="history" id="history"></div>
      
      <div class="controls">
        <button class="btn btn-primary" onclick="testNotify()">测试通知</button>
        <button class="btn btn-secondary" onclick="clearHistory()">清空历史</button>
      </div>
    </div>
  </div>

  <script>
    let lastUpdate = 0;
    
    async function updateState() {
      try {
        const res = await fetch('/api/state');
        const state = await res.json();
        
        document.getElementById('petEmoji').textContent = '${statusEmoji['ID_PLACEHOLDER']}'.replace('ID_PLACEHOLDER', state.status);
        document.getElementById('petEmoji').className = 'pet-emoji ' + state.status;
        
        document.getElementById('petStatus').textContent = '${statusText['ID_PLACEHOLDER']}'.replace('ID_PLACEHOLDER', state.status);
        document.getElementById('petMessage').textContent = state.message || '等待任务中...';
        document.getElementById('agentInfo').textContent = 'Agent: ' + state.agent;
        
        document.getElementById('totalEvents').textContent = state.metrics.totalEvents;
        document.getElementById('activeSessions').textContent = state.metrics.activeSessions;
        document.getElementById('totalSessions').textContent = state.metrics.totalSessions;
        document.getElementById('lastUpdate').textContent = new Date(state.lastUpdate).toLocaleTimeString();
        
        if (state.lastUpdate > lastUpdate) {
          lastUpdate = state.lastUpdate;
          renderHistory(state.history);
        }
      } catch(e) {
        console.error('更新失败:', e);
      }
    }
    
    function renderHistory(history) {
      const container = document.getElementById('history');
      container.innerHTML = history.map(h => \`
        <div class="history-item">
          <span class="time">\${new Date(h.timestamp).toLocaleTimeString()}</span>
          <span class="event">\${h.event}</span>
          <span class="status status-\${h.status}">\${h.status}</span>
        </div>
      \`).join('');
    }
    
    async function testNotify() {
      await fetch('/api/test', { method: 'POST' });
      updateState();
    }
    
    async function clearHistory() {
      await fetch('/api/history/clear', { method: 'POST' });
      updateState();
    }
    
    // 每秒更新状态
    setInterval(updateState, 1000);
    updateState();
  </script>
</body>
</html>`;
}

// 更新宠物状态
function updatePetState(event, status, message, details = {}) {
  petState.status = status;
  petState.message = message;
  petState.lastUpdate = Date.now();
  petState.metrics.totalEvents++;
  
  if (details.activeSessions !== undefined) {
    petState.metrics.activeSessions = details.activeSessions;
  }
  if (details.totalSessions !== undefined) {
    petState.metrics.totalSessions = details.totalSessions;
  }
  
  // 添加到历史
  petState.history.unshift({
    event,
    status,
    message,
    timestamp: Date.now()
  });
  
  // 保持历史记录数量
  if (petState.history.length > MAX_HISTORY) {
    petState.history = petState.history.slice(0, MAX_HISTORY);
  }
  
  console.log(`[${new Date().toISOString()}] ${event}: ${status} - ${message}`);
}

// HTTP 服务器
const server = http.createServer((req, res) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // 认证检查
  if (TOKEN) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== TOKEN) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }
  
  // 路由处理
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    // 动态生成 HTML 替换状态
    const emojiMap = { idle: '😴', thinking: '🤔', active: '⚡', error: '❌' };
    const textMap = { idle: '空闲中', thinking: '思考中', active: '工作中', error: '出错啦' };
    let html = getPetHTML();
    html = html.replace(/ID_PLACEHOLDER/g, petState.status);
    res.end(html);
    return;
  }
  
  if (url.pathname === '/notify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        updatePetState(
          data.event || 'unknown',
          data.status || 'idle',
          data.message || '',
          data.details || {}
        );
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  
  if (url.pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(petState));
    return;
  }
  
  if (url.pathname === '/api/test' && req.method === 'POST') {
    updatePetState('test', 'thinking', '测试通知收到！', {});
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  
  if (url.pathname === '/api/history/clear' && req.method === 'POST') {
    petState.history = [];
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  
  // 静态文件
  if (url.pathname.startsWith('/static/')) {
    const filePath = path.join(__dirname, 'static', url.pathname.slice(8));
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      const contentType = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg'
      }[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🐱 桌面宠物服务端已启动
   地址: http://0.0.0.0:${PORT}
   Token: ${TOKEN || '(未设置)'}
   
   端点:
   - POST /notify     接收通知
   - GET  /api/state  获取状态
   - GET  /           宠物界面
  `);
});
