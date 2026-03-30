import Fastify, { FastifyRequest, FastifyReply } from "fastify";

const server = Fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty"
    }
  },
  // In a real environment with TLS, we would pass certificates here.
  // For dev without certs, HTTP/2 can only be used with cleartext (h2c) if the client supports it via reverse proxy,
  // but browsers don't support h2c directly. Fastify's `http2: true` requires TLS for browsers to use it.
  // For Phase 1 we configure it, but Vite dev proxy might connect over http1.
  // We'll leave it as false for basic dev since http2 without TLS over vite proxy drops connections on windows.
  // http2: true 
});

server.get("/", async () => {
  return { status: "ok" };
});

// SSE Endpoint for streaming test events
server.get("/stream/:runId", (request: FastifyRequest, reply: FastifyReply) => {
  const { runId } = request.params as { runId: string };
  
  // Set required SSE headers
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  
  // INFRA-02: Disable proxy buffering
  reply.raw.setHeader("X-Accel-Buffering", "no");

  server.log.info({ runId }, "SSE connection established");

  // INFRA-01: Client disconnected cleanup
  const abortController = new AbortController();
  
  // Send heartbeat every 15 seconds
  const heartbeatInterval = setInterval(() => {
    reply.raw.write(`event: heartbeat\ndata: {}\n\n`);
  }, 15000);

  // Initial event
  reply.raw.write(`id: ${Date.now()}\nevent: connected\ndata: ${JSON.stringify({ runId })}\n\n`);

  // Handle client close
  request.raw.on("close", () => {
    server.log.info({ runId }, "SSE client disconnected");
    clearInterval(heartbeatInterval);
    abortController.abort();
    reply.raw.end();
  });
});

const start = async () => {
  try {
    // Port 3000 to match Vite proxy
    await server.listen({ port: 3000, host: "0.0.0.0" });
    console.log(`Server listening on http://localhost:3000`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
