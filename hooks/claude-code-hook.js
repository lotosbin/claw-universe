#!/usr/bin/env node
/**
 * Claude Code Hook - 发送状态到桌面宠物
 * 特性：完全异步，不阻塞 Claude Code 主流程
 */

import http from "http";
import https from "https";

// 配置
const PET_URL = process.env.CLAW_UNIVERSE_URL || "http://localhost:3456";
const PET_TOKEN = process.env.CLAW_UNIVERSE_TOKEN || "";

// 静默发送通知（返回Promise确保发送完成）
function notifyDesktopPet(event, status, message, details = {}) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        event,
        agent: "claude-code",
        status,
        message,
        timestamp: Date.now(),
        details,
      });

      const url = new URL(PET_URL);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: "/notify",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      };

      if (PET_TOKEN) {
        options.headers["Authorization"] = `Bearer ${PET_TOKEN}`;
      }

      const client = url.protocol === "https:" ? https : http;
      const req = client.request(options, () => {});
      req.on("error", () => {});
      req.on("close", () => resolve());
      req.write(payload);
      req.end();
    } catch (e) {
      resolve();
    }
  });
}

// 状态映射
function mapStatus(hookEvent) {
  switch (hookEvent) {
    case "SessionStart":
      return { status: "idle", message: "会话启动" };
    case "UserPromptSubmit":
      return { status: "thinking", message: "处理中" };
    case "PreToolUse":
      return { status: "active", message: "使用工具" };
    case "PostToolUse":
      return { status: "active", message: "工具完成" };
    case "Stop":
      return { status: "idle", message: "执行完成" };
    case "SessionEnd":
      return { status: "idle", message: "会话结束" };
    default:
      return { status: "idle", message: hookEvent };
  }
}

// 主函数（安全版本）
async function main() {
  try {
    // 从 stdin 读取所有数据
    const input = await new Promise((resolve) => {
      let data = '';
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', () => resolve(''));
    });

    if (!input.trim()) {
      process.exit(0);
    }

    let data;
    try {
      data = JSON.parse(input);
    } catch (e) {
      process.exit(0);
    }

    const { session_id, hook_event_name } = data;
    if (!session_id) {
      process.exit(0);
    }

    const { status, message } = mapStatus(hook_event_name);
    await notifyDesktopPet(hook_event_name, status, message, { session_id });
  } catch (e) {
    // 静默忽略所有错误
  }
  process.exit(0);
}

// 直接运行时执行main
main();

// 导出给 Claude Code Hook 使用
export default async function (event) {
  try {
    const { session_id, hook_event_name } = event || {};
    if (!session_id) return;

    const { status, message } = mapStatus(hook_event_name);
    notifyDesktopPet(hook_event_name, status, message, { session_id });
  } catch (e) {
    // 静默忽略
  }
}
