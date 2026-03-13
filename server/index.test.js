const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

// Test configuration - derive all from CLAW_UNIVERSE_URL
const BASE_URL = process.env.CLAW_UNIVERSE_URL || "http://localhost:3457";
const TEST_TOKEN = process.env.CLAW_UNIVERSE_TOKEN || "";

// Parse BASE_URL to get host and port
const baseUrlObj = new URL(BASE_URL);
const TEST_HOST = baseUrlObj.hostname;
const TEST_PORT = parseInt(baseUrlObj.port, 10) || 80;

// Store original env values
const originalPort = process.env.PORT;
const originalToken = process.env.PET_TOKEN;

// Helper to make HTTP requests
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || TEST_PORT,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          // Not JSON
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to make authenticated requests
function authRequest(method, path, body = null) {
  return request(method, path, body, {
    Authorization: `Bearer ${TEST_TOKEN}`,
  });
}

describe("Server Index Tests", () => {
  let server;

  before(async () => {
    // Start server with test config
    process.env.PORT = TEST_PORT;
    process.env.PET_TOKEN = TEST_TOKEN;

    // Create test server with fresh state
    const petState = {
      status: "idle",
      message: "",
      agent: "main",
      lastUpdate: Date.now(),
      history: [],
      metrics: {
        totalEvents: 0,
        activeSessions: 0,
        totalSessions: 0,
      },
    };

    const MAX_HISTORY = 50;
    const TOKEN = TEST_TOKEN;

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

      petState.history.unshift({
        event,
        status,
        message,
        timestamp: Date.now(),
      });

      if (petState.history.length > MAX_HISTORY) {
        petState.history = petState.history.slice(0, MAX_HISTORY);
      }
    }

    server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url, BASE_URL);

      // 认证检查
      if (TOKEN) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.slice(7) !== TOKEN) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end('<html><body><div class="pet-emoji">😴</div></body></html>');
        return;
      }

      if (url.pathname === "/notify" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            updatePetState(
              data.event || "unknown",
              data.status || "idle",
              data.message || "",
              data.details || {},
            );
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
        return;
      }

      if (url.pathname === "/api/state" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(petState));
        return;
      }

      if (url.pathname === "/api/test" && req.method === "POST") {
        updatePetState("test", "thinking", "测试通知收到！", {});
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === "/api/history/clear" && req.method === "POST") {
        petState.history = [];
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    await new Promise((resolve) => {
      server.listen(TEST_PORT, "0.0.0.0", resolve);
    });
  });

  after(() => {
    server.close();
    process.env.PORT = originalPort;
    process.env.PET_TOKEN = originalToken;
  });

  test("GET / returns HTML", async () => {
    const res = await request("GET", "/");
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/html"));
    assert.ok(res.body.includes("<html"));
  });

  test("GET /index.html returns HTML", async () => {
    const res = await request("GET", "/index.html");
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/html"));
  });

  test("GET /api/state returns JSON with pet state", async () => {
    const res = await request("GET", "/api/state");
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers["content-type"].includes("application/json"));
    assert.ok(res.body.status);
    assert.ok(res.body.metrics);
    assert.ok(res.body.history);
  });

  test("POST /notify updates pet state", async () => {
    // Get current event count first
    const before = await request("GET", "/api/state");
    const prevEvents = before.body.metrics.totalEvents;

    const res = await request("POST", "/notify", {
      event: "test-event",
      status: "active",
      message: "Test message",
      details: { activeSessions: 5, totalSessions: 10 },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);

    // Verify state was updated
    const state = await request("GET", "/api/state");
    assert.strictEqual(state.body.status, "active");
    assert.strictEqual(state.body.message, "Test message");
    assert.strictEqual(state.body.metrics.activeSessions, 5);
    assert.strictEqual(state.body.metrics.totalSessions, 10);
    assert.strictEqual(state.body.metrics.totalEvents, prevEvents + 1);
  });

  test("POST /api/test triggers test notification", async () => {
    const res = await request("POST", "/api/test");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);

    const state = await request("GET", "/api/state");
    assert.strictEqual(state.body.status, "thinking");
  });

  test("POST /api/history/clear clears history", async () => {
    // First add some history
    await request("POST", "/notify", {
      event: "test1",
      status: "idle",
      message: "",
    });
    await request("POST", "/notify", {
      event: "test2",
      status: "active",
      message: "",
    });

    let state = await request("GET", "/api/state");
    assert.ok(state.body.history.length > 0);

    // Clear history
    const res = await request("POST", "/api/history/clear");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);

    // Verify history is cleared
    state = await request("GET", "/api/state");
    assert.strictEqual(state.body.history.length, 0);
  });

  test("POST /notify with invalid JSON returns 400", async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: TEST_HOST,
          port: TEST_PORT,
          path: "/notify",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ status: res.statusCode, body: data }));
        },
      );
      req.on("error", reject);
      req.write("not valid json");
      req.end();
    });

    assert.strictEqual(res.status, 400);
  });

  test("GET unknown route returns 404", async () => {
    const res = await request("GET", "/unknown/route");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body, "Not found");
  });

  test("CORS headers are present", async () => {
    const res = await request("GET", "/api/state");
    assert.strictEqual(res.headers["access-control-allow-origin"], "*");
    assert.strictEqual(
      res.headers["access-control-allow-methods"],
      "GET, POST, OPTIONS",
    );
  });

  test("OPTIONS request returns 200 for CORS preflight", async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: TEST_HOST,
          port: TEST_PORT,
          path: "/api/state",
          method: "OPTIONS",
        },
        (res) => {
          resolve({ status: res.statusCode, headers: res.headers });
        },
      );
      req.on("error", reject);
      req.end();
    });

    assert.strictEqual(res.status, 200);
  });

  test("petState has correct structure", async () => {
    // Check structure regardless of current state (tests may have modified it)
    const res = await request("GET", "/api/state");
    assert.ok(res.body.status);
    assert.ok(typeof res.body.message === "string");
    assert.ok(res.body.agent);
    assert.ok(res.body.history);
    assert.ok(res.body.metrics);
    assert.ok(typeof res.body.metrics.totalEvents === "number");
    assert.ok(typeof res.body.metrics.activeSessions === "number");
    assert.ok(typeof res.body.metrics.totalSessions === "number");
    assert.ok(typeof res.body.lastUpdate === "number");
  });

  test("history is limited to MAX_HISTORY items", async () => {
    // Clear history first
    await request("POST", "/api/history/clear");

    // Add more than MAX_HISTORY (50) events
    for (let i = 0; i < 60; i++) {
      await request("POST", "/notify", {
        event: `event-${i}`,
        status: "idle",
        message: "",
      });
    }

    const state = await request("GET", "/api/state");
    assert.ok(state.body.history.length <= 50);
  });

  test("updatePetState increments totalEvents", async () => {
    // Clear and reset
    await request("POST", "/api/history/clear");

    const before = await request("GET", "/api/state");
    const initialEvents = before.body.metrics.totalEvents;

    await request("POST", "/notify", {
      event: "test",
      status: "active",
      message: "",
    });

    const after = await request("GET", "/api/state");
    assert.strictEqual(after.body.metrics.totalEvents, initialEvents + 1);
  });

  // Auth tests (only run when TOKEN is set)
  if (TEST_TOKEN) {
    test("request without auth returns 401 when token is required", async () => {
      const res = await request("GET", "/api/state");
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, "Unauthorized");
    });

    test("request with valid Bearer token succeeds", async () => {
      const res = await authRequest("GET", "/api/state");
      assert.strictEqual(res.status, 200);
    });

    test("request with invalid token returns 401", async () => {
      const res = await request("GET", "/api/state", null, {
        Authorization: "Bearer wrong-token",
      });
      assert.strictEqual(res.status, 401);
    });

    test("POST /notify with valid auth token succeeds", async () => {
      const res = await authRequest("POST", "/notify", {
        event: "auth-test",
        status: "active",
        message: "Authenticated test",
      });
      assert.strictEqual(res.status, 200);
    });
  }
});
