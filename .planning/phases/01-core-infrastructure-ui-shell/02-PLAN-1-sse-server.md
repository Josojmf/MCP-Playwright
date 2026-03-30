# Plan 1: Fastify SSE Server

**Phase:** 1 (Core Infrastructure & UI Shell)
**Focus:** Scaffold Fastify backend, configure HTTP/2, and establish the robust SSE streaming endpoint for real-time test run results.
**Requirements Covered:** INFRA-01, INFRA-02

## 1. Project Scaffolding
- Create `package.json` at the root of the monolithic project structure (flat `src/` split: `src/client`, `src/server`, `src/shared`).
- Setup `tsconfig.json` for Node.js backend.
- Install dependencies: `fastify`, `typescript`, `ts-node`, `pino` (for logging).
- Configure development script using `concurrently` (e.g., `npm run dev`) that will eventually run both client and server development proxy (D-03 in 01-CONTEXT.md).

## 2. Server Initialization
- Initialize a Fastify instance in `src/server/index.ts`.
- **HTTP/2 Support (INFRA-02):** Configure Fastify with `http2: true`. Ensure fallback to HTTP/1.1 if HTTP/2 is not supported by the client, though browsers running the benchmark UI will support it. This bypasses the 6-connections-per-origin limit for parallel runs.
- Add basic Pino logging for incoming requests and errors to help trace connection issues.

## 3. SSE Endpoint (`/stream/:runId`)
- Create the route: `GET /stream/:runId`.
- **Headers:** Set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and **critically** `X-Accel-Buffering: no` to prevent Nginx or other reverse proxies from buffering the stream.
- **Connection Keep-Alive:** Implement a heartbeat mechanism that sends a ping frame (e.g., `event: heartbeat\ndata: {}\n\n`) every ~15-30 seconds to prevent connection drops.
- **Client Disconnect Handling (INFRA-01):** Listen to the Fastify request `close` event. Bind this to an `AbortController` instance to immediately abort any running processes or loops tied to this `runId` when the browser tab is closed or the user navigates away.
- **Stream Output:** Use `reply.raw.write()` to push standard Server-Sent Event formatted strings (`id`, `event`, `data`). Handle graceful ending of the stream (`reply.raw.end()`).

## 4. Test & Validate
- Write a basic CLI script to connect to the SSE endpoint and verify heartbeat messages arrive.
- Connect from a browser and immediately close the tab; verify the server logs the abort event properly without throwing "write after end" errors.
