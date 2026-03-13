#!/usr/bin/env node
/**
 * AI漫剧自我进化 - 每小时定时任务
 * 分析最近产出，优化工作流，持续改进
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const EVOLUTION_LOG = path.join(MEMORY_DIR, 'evolution-log.md');

// 日志
function log(msg) {
  const time = new Date().toISOString();
  console.log(`[${time}] ${msg}`);
}

// 获取今天和昨天的记忆文件
function getRecentMemoryFiles() {
  const files = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) { // 最近7天
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const filePath = path.join(MEMORY_DIR, `${dateStr}.md`);
    if (fs.existsSync(filePath)) {
      files.push({ date: dateStr, path: filePath });
    }
  }
  return files;
}

// 读取记忆文件内容
function readMemoryFiles(files) {
  let content = '';
  for (const f of files) {
    try {
      content += fs.readFileSync(f.path, 'utf-8') + '\n';
    } catch (e) {}
  }
  return content;
}

// 分析产出统计
function analyzeOutput(memory) {
  const stats = {
    tasks: 0,
    decisions: 0,
    errors: 0,
    learnings: []
  };
  
  // 简单统计
  const taskMatches = memory.match(/- \[ \]/g) || [];
  stats.tasks = taskMatches.length;
  
  const decisionMatches = memory.match(/决定|决策|选择/g) || [];
  stats.decisions = decisionMatches.length;
  
  const errorMatches = memory.match(/错误|失败|问题/g) || [];
  stats.errors = errorMatches.length;
  
  return stats;
}

// 生成进化建议
function generateEvolution(stats) {
  const suggestions = [];
  
  if (stats.errors > 5) {
    suggestions.push('❌ 错误较多，考虑优化工作流');
  }
  
  if (stats.tasks > 20) {
    suggestions.push('📈 任务量大，考虑自动化更多流程');
  }
  
  if (stats.decisions > 10) {
    suggestions.push('🧠 决策频繁，记录决策模式');
  }
  
  if (suggestions.length === 0) {
    suggestions.push('✨ 运行良好，保持现状');
  }
  
  return suggestions;
}

// 写进化日志
function writeEvolutionLog(stats, suggestions) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];
  
  let logContent = '';
  if (fs.existsSync(EVOLUTION_LOG)) {
    logContent = fs.readFileSync(EVOLUTION_LOG, 'utf-8');
  }
  
  const newEntry = `## ${dateStr} ${timeStr} - 自我进化
  
### 统计
- 任务数: ${stats.tasks}
- 决策数: ${stats.decisions}
- 错误数: ${stats.errors}

### 建议
${suggestions.map(s => `- ${s}`).join('\n')}

---
`;
  
  fs.writeFileSync(EVOLUTION_LOG, newEntry + logContent);
  log('进化日志已更新');
}

// 主函数
async function evolve() {
  log('开始自我进化...');
  
  try {
    // 1. 获取最近记忆
    const memoryFiles = getRecentMemoryFiles();
    log(`分析最近 ${memoryFiles.length} 天的记忆`);
    
    // 2. 分析产出
    const memory = readMemoryFiles(memoryFiles);
    const stats = analyzeOutput(memory);
    
    // 3. 生成建议
    const suggestions = generateEvolution(stats);
    
    // 4. 记录进化
    writeEvolutionLog(stats, suggestions);
    
    // 5. 发送通知到桌面宠物（如果有）
    try {
      const notifyUrl = process.env.DESKTOP_PET_URL;
      if (notifyUrl) {
        const payload = JSON.stringify({
          event: 'evolution',
          status: 'idle',
          message: '自我进化完成',
          timestamp: Date.now(),
          details: { stats, suggestions }
        });
        
        execSync(`curl -s -X POST "${notifyUrl}/notify" -H "Content-Type: application/json" -d '${payload}'`, {
          timeout: 5000,
          stdio: 'ignore'
        });
      }
    } catch (e) {
      // 通知失败不影响主流程
    }
    
    log('自我进化完成');
    console.log('建议:', suggestions.join(', '));
    
  } catch (e) {
    log(`进化失败: ${e.message}`);
  }
  
  process.exit(0);
}

evolve();
