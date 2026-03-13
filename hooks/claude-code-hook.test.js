/**
 * Claude Code Hook Tests
 * Run with: node claude-code-hook.test.js
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOOK_SCRIPT = path.join(__dirname, "claude-code-hook.js");

console.log("=== Claude Code Hook Tests ===\n");

let passed = 0;
let failed = 0;

// 辅助函数：运行 hook 脚本测试
function runHookTest(input, expectedCode, description, env = {}) {
  return new Promise((resolve) => {
    const proc = spawn("node", [HOOK_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });

    proc.on("close", (code) => {
      if (code === expectedCode) {
        console.log(`  ✓ ${description}`);
        passed++;
      } else {
        console.log(`  ✗ ${description} (exit code: ${code}, expected: ${expectedCode})`);
        failed++;
      }
      resolve();
    });

    proc.stdin.end(input);
  });
}

// 测试 1: 空输入
console.log("Test 1: Empty input");
await runHookTest("", 0, "Empty input should exit 0");

// 测试 2: 无效 JSON
console.log("\nTest 2: Invalid JSON");
await runHookTest("not valid json", 0, "Invalid JSON should exit 0");

// 测试 3: 缺少 session_id
console.log("\nTest 3: Missing session_id");
await runHookTest(JSON.stringify({ hook_event_name: "SessionStart" }), 0, "Missing session_id should exit 0");

// 测试 4: 缺少 hook_event_name
console.log("\nTest 4: Missing hook_event_name");
await runHookTest(JSON.stringify({ session_id: "test-123" }), 0, "Missing hook_event_name should exit 0");

// 测试 5: 有效输入 - SessionStart
console.log("\nTest 5: Valid input - SessionStart");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "SessionStart" }),
  0,
  "SessionStart should exit 0",
  { DESKTOP_PET_URL: "http://localhost:19999" }
);

// 测试 6: 有效输入 - UserPromptSubmit
console.log("\nTest 6: Valid input - UserPromptSubmit");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "UserPromptSubmit", prompt: "hello" }),
  0,
  "UserPromptSubmit should exit 0"
);

// 测试 7: 有效输入 - PreToolUse
console.log("\nTest 7: Valid input - PreToolUse");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } }),
  0,
  "PreToolUse should exit 0"
);

// 测试 8: 有效输入 - PostToolUse
console.log("\nTest 8: Valid input - PostToolUse");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "/test.js" } }),
  0,
  "PostToolUse should exit 0"
);

// 测试 9: 有效输入 - Stop
console.log("\nTest 9: Valid input - Stop");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "Stop" }),
  0,
  "Stop should exit 0"
);

// 测试 10: 有效输入 - SessionEnd
console.log("\nTest 10: Valid input - SessionEnd");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "SessionEnd" }),
  0,
  "SessionEnd should exit 0"
);

// 测试 11: 未知事件
console.log("\nTest 11: Unknown event");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "CustomEvent" }),
  0,
  "Unknown event should exit 0"
);

// 测试 12: 测试PET_URL环境变量
console.log("\nTest 12: Custom PET_URL");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "SessionStart" }),
  0,
  "Custom PET_URL should work",
  { DESKTOP_PET_URL: "http://127.0.0.1:19999" }
);

// 测试 13: 测试PET_TOKEN环境变量
console.log("\nTest 13: Custom PET_TOKEN");
await runHookTest(
  JSON.stringify({ session_id: "test-123", hook_event_name: "SessionStart" }),
  0,
  "Custom PET_TOKEN should work",
  { DESKTOP_PET_URL: "http://127.0.0.1:19999", DESKTOP_PET_TOKEN: "secret-token" }
);

console.log("\n=== Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\nAll tests passed!");
}
