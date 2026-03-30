import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { BudgetExceededError } from "../shared/harness/TokenBudget";
import { PhaseOneRunManager, RequestValidationError, RunEstimateRequest } from "./runManager";
import { registerHistoryRoutes } from "./api/history";
import { getDb, closeDb } from "./storage/sqlite";

const logger = {
  level: "info",
  transport: {
    target: "pino-pretty",
  },
} as const;

const http2Key = process.env.HTTP2_TLS_KEY;
const http2Cert = process.env.HTTP2_TLS_CERT;
const hasHttp2Tls = Boolean(http2Key && http2Cert);
const enableHttp2 = process.env.ENABLE_HTTP2 === "true";

const server = Fastify(
  ((enableHttp2 && hasHttp2Tls)
    ? {
        http2: true,
        https: {
          allowHTTP1: true,
          key: http2Key,
          cert: http2Cert,
        },
        logger,
      }
    : enableHttp2
      ? {
          http2: true,
          logger,
        }
    : {
        logger,
      }) as any
);

const runManager = new PhaseOneRunManager(server.log);

server.get("/", async (request) => {
  const httpsOptions = server.initialConfig.https as { allowHTTP1?: boolean } | boolean | undefined;
  return {
    status: "ok",
    http2Enabled: Boolean(server.initialConfig.http2),
    http1FallbackEnabled: typeof httpsOptions === "object" ? Boolean(httpsOptions.allowHTTP1) : false,
    httpVersion: request.raw.httpVersion,
    usingHttp2: request.raw.httpVersionMajor >= 2,
    message: "MCP Playwright backend ready",
  };
});

server.post(
  "/api/runs/estimate",
  async (request, reply) => {
    try {
      const estimate = runManager.estimateRun(request.body as RunEstimateRequest);
      return reply.send({ estimate });
    } catch (error) {
      return handleRequestError(reply, error);
    }
  }
);

server.post(
  "/api/runs/start",
  async (request, reply) => {
    try {
      const run = runManager.createRun(request.body as RunEstimateRequest);
      return reply.send(run);
    } catch (error) {
      return handleRequestError(reply, error);
    }
  }
);

server.get("/stream/:runId", (request, reply) => {
  const { runId } = request.params as { runId: string };

  if (!runManager.hasRun(runId)) {
    reply.code(404).send({ error: `Run ${runId} not found` });
    return;
  }

  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");

  const subscriberId = randomUUID();

  const publish = (frame: { id: number; event: string; data: unknown; at: string }) => {
    if (reply.raw.writableEnded) {
      return;
    }

    const payload =
      typeof frame.data === "object" && frame.data !== null ? { ...(frame.data as Record<string, unknown>) } : { value: frame.data };

    reply.raw.write(`id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify({ ...payload, at: frame.at })}\n\n`);
  };

  try {
    runManager.subscribe(runId, {
      id: subscriberId,
      publish,
    });
  } catch (error) {
    reply.code(404).send({ error: toMessage(error) });
    return;
  }

  publish({
    id: 0,
    event: "connected",
    data: { runId },
    at: new Date().toISOString(),
  });

  server.log.info({ runId, subscriberId }, "SSE connection established");

  const heartbeatInterval = setInterval(() => {
    if (reply.raw.writableEnded) {
      return;
    }

    reply.raw.write(`event: heartbeat\ndata: {}\n\n`);
  }, 15000);

  request.raw.on("close", () => {
    clearInterval(heartbeatInterval);
    runManager.unsubscribe(runId, subscriberId);

    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }

    server.log.info({ runId, subscriberId }, "SSE client disconnected");
  });
});

const start = async () => {
  try {
    // Initialize database
    getDb();
    server.log.info("Database initialized");

    // Register history routes
    await registerHistoryRoutes(server);
    server.log.info("History API routes registered");

    await server.listen({ port: 3000, host: "0.0.0.0" });
    server.log.info("Server listening on http://localhost:3000");
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

void start();

// Graceful shutdown
process.on("SIGINT", () => {
  try {
    closeDb();
    server.log.info("Database connection closed");
  } catch (error) {
    server.log.error(error);
  }
  process.exit(0);
});

function handleRequestError(reply: any, error: unknown) {
  if (error instanceof RequestValidationError) {
    return reply.code(400).send({ error: error.message });
  }

  if (error instanceof BudgetExceededError) {
    return reply.code(422).send({ error: error.message });
  }

  return reply.code(500).send({ error: toMessage(error) });
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected server error";
}
