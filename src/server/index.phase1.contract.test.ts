import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const serverSource = readFileSync(resolve(process.cwd(), "src/server/index.ts"), "utf8");

test("phase1 contract: SSE route exists with required headers and heartbeat", () => {
  assert.match(serverSource, /server\.get\("\/stream\/:runId"/);
  assert.match(serverSource, /Content-Type",\s*"text\/event-stream"/);
  assert.match(serverSource, /Cache-Control",\s*"no-cache"/);
  assert.match(serverSource, /X-Accel-Buffering",\s*"no"/);
  assert.match(serverSource, /setInterval\([\s\S]*?15000\)/);
  assert.match(serverSource, /request\.raw\.on\("close"/);
  assert.match(serverSource, /runManager\.unsubscribe\(runId, subscriberId\)/);
  assert.match(serverSource, /reply\.raw\.end\(\)/);
});

test("phase1 contract: Fastify config contains HTTP\/2 support and HTTP\/1 fallback toggle", () => {
  assert.match(serverSource, /http2:\s*true/);
  assert.match(serverSource, /allowHTTP1:\s*true/);
  assert.match(serverSource, /ENABLE_HTTP2/);
});
