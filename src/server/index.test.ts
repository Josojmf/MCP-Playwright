import assert from "node:assert/strict";
import test from "node:test";

import { sweepBrowserbaseOrphanSessions } from "./index";

function createLogger() {
  const entries: Array<{ level: string; data: unknown[] }> = [];
  return {
    logger: {
      info: (...data: unknown[]) => entries.push({ level: "info", data }),
      warn: (...data: unknown[]) => entries.push({ level: "warn", data }),
      debug: (...data: unknown[]) => entries.push({ level: "debug", data }),
    },
    entries,
  };
}

test("sweepBrowserbaseOrphanSessions: sin API key hace skip silencioso", async () => {
  const originalKey = process.env.BROWSERBASE_API_KEY;
  delete process.env.BROWSERBASE_API_KEY;

  const { logger, entries } = createLogger();
  const calls: Array<{ url: string; method: string }> = [];

  await sweepBrowserbaseOrphanSessions({
    logger: logger as any,
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      return new Response("[]", { status: 200 });
    }) as any,
  });

  assert.equal(calls.length, 0);
  assert.ok(entries.some((e) => e.level === "debug"));

  if (originalKey) process.env.BROWSERBASE_API_KEY = originalKey;
});

test("sweepBrowserbaseOrphanSessions: elimina sesiones RUNNING y reporta resumen", async () => {
  const originalKey = process.env.BROWSERBASE_API_KEY;
  process.env.BROWSERBASE_API_KEY = "bb_test_key";

  const { logger, entries } = createLogger();
  const calls: Array<{ url: string; method: string }> = [];

  await sweepBrowserbaseOrphanSessions({
    logger: logger as any,
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(url), method });

      if (method === "GET") {
        return Response.json({ data: [{ id: "s1" }, { id: "s2" }] });
      }

      return new Response(null, { status: 204 });
    }) as any,
  });

  assert.equal(calls.filter((c) => c.method === "GET").length, 1);
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 2);
  assert.ok(entries.some((e) => e.level === "info"));

  if (originalKey) process.env.BROWSERBASE_API_KEY = originalKey;
  else delete process.env.BROWSERBASE_API_KEY;
});

test("sweepBrowserbaseOrphanSessions: fallo parcial en DELETE no rompe startup", async () => {
  const originalKey = process.env.BROWSERBASE_API_KEY;
  process.env.BROWSERBASE_API_KEY = "bb_test_key";

  const { logger, entries } = createLogger();

  await sweepBrowserbaseOrphanSessions({
    logger: logger as any,
    fetchImpl: (async (_url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";

      if (method === "GET") {
        return Response.json([{ id: "s1" }, { id: "s2" }]);
      }

      if ((init?.headers as Record<string, string> | undefined)?.["X-BB-Session"] === "s1") {
        return new Response("fail", { status: 500 });
      }

      return new Response(null, { status: 204 });
    }) as any,
    deleteHeadersFactory: (sessionId: string, apiKey: string) => ({
      "X-BB-API-Key": apiKey,
      "X-BB-Session": sessionId,
    }),
  });

  assert.ok(entries.some((e) => e.level === "warn"));
  assert.ok(entries.some((e) => e.level === "info"));

  if (originalKey) process.env.BROWSERBASE_API_KEY = originalKey;
  else delete process.env.BROWSERBASE_API_KEY;
});
