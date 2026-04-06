---
phase: 01
plan: 04
subsystem: video-recording
tags: [video, playwright, run-config, history, frontend, backend]
dependency_graph:
  requires: [01-01]
  provides: [video-recording-toggle, video-playback-in-history]
  affects: [src/client/App.tsx, src/server/runManager.ts, src/server/mcp/McpProcessManager.ts, src/server/index.ts, src/client/components/history/RunDetailView.tsx, src/client/types/history.ts, src/server/api/history.ts]
tech_stack:
  added: []
  patterns: [SSE-event-video_available, PLAYWRIGHT_VIDEO_DIR-env-var, createReadStream-video-serving, conditional-video-player-in-RunDetailView]
key_files:
  created: []
  modified:
    - src/client/App.tsx
    - src/server/runManager.ts
    - src/server/mcp/McpProcessManager.ts
    - src/server/index.ts
    - src/client/components/history/RunDetailView.tsx
    - src/client/types/history.ts
    - src/server/api/history.ts
decisions:
  - recordVideo defaults to false in UI (per D-08 — optional toggle, not auto-on)
  - Video passed to MCP process via PLAYWRIGHT_VIDEO_DIR env var on spawn
  - McpProcessManager accepts extraEnv record for flexible env var injection
  - Video serving route uses createReadStream (no fastify-static dependency)
  - Video URL resolved at history query time by scanning videos/ directory
  - video_available SSE event emitted after run_completed when video file found
metrics:
  duration: "~8 minutes"
  completed_date: "2026-04-06T10:48:00Z"
  tasks: 2
  files_modified: 7
  commits: 2
requirements: [TRACE-08, TRACE-09]
---

# Phase 01 Plan 04: Video Recording Toggle and Playback Summary

**One-liner:** Optional Playwright video recording toggle (default off) with PLAYWRIGHT_VIDEO_DIR env injection and conditional video player in run history.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Video recording toggle in run config (frontend + backend) | 7596d20c | App.tsx, runManager.ts, McpProcessManager.ts, index.ts |
| 2 | Video player section in RunDetailView | ff287892 | RunDetailView.tsx, history.ts, history.ts (API) |

## What Was Built

### Task 1: Video Toggle in Run Config

**Frontend (`src/client/App.tsx`):**
- Added `const [recordVideo, setRecordVideo] = useState(false)` — default off per D-08
- Added checkbox UI with "Grabar video (Playwright)" label in the Estado del run panel, above Estimar y ejecutar button
- Included `recordVideo` in `requestBody` shared by both estimate and start POST calls

**Backend (`src/server/runManager.ts`):**
- Added `recordVideo?: boolean` to `RunEstimateRequest`
- Added `recordVideo: boolean` to `RunConfig`
- Propagated `recordVideo: Boolean(normalizedInput.recordVideo)` into session config
- Pass `PLAYWRIGHT_VIDEO_DIR` env var to MCP process when `session.config.recordVideo` is true
- Emit `video_available` SSE event after `run_completed` if a `.webm` or `.mp4` file is found in the video directory

**McpProcessManager (`src/server/mcp/McpProcessManager.ts`):**
- Added optional `extraEnv: Record<string, string>` constructor parameter
- Pass merged `{ ...process.env, ...extraEnv }` as `env` to `StdioClientTransport` when extra env vars exist

**Server routes (`src/server/index.ts`):**
- Added `GET /api/videos/:runId/:filename` route
- Path traversal protection: resolves and validates path stays within DATA_DIR
- Serves video with `createReadStream` — no additional dependency required
- Supports both `video/webm` and `video/mp4` content types

### Task 2: Video Player in RunDetailView

**Frontend types (`src/client/types/history.ts`):**
- Added `videoUrl?: string` to `RunDetail` interface

**RunDetailView (`src/client/components/history/RunDetailView.tsx`):**
- Added conditional `{run.videoUrl && (...)}` video player section after trust state panel
- Uses native `<video controls preload="metadata">` with `<source>` for both webm and mp4
- Max height 480px, black background, full width

**History API (`src/server/api/history.ts`):**
- Added `resolveVideoUrl(runId)` async helper — reads video directory, returns URL if file found
- Included `videoUrl` in `/api/history/:id` response data
- Gracefully handles missing video directory (returns `undefined`)

## Deviations from Plan

### Auto-fixed Issues

None beyond what the plan specified.

**1. [Rule 2 - Missing functionality] Added extraEnv to McpProcessManager**
- **Found during:** Task 1 — McpProcessManager had no mechanism to pass extra env vars to spawned process
- **Issue:** Plan said to pass `PLAYWRIGHT_VIDEO_DIR` to MCP process, but McpProcessManager constructor had no env parameter
- **Fix:** Added optional `extraEnv: Record<string, string>` parameter to constructor; merged with `process.env` when spawning via `StdioClientTransport`
- **Files modified:** `src/server/mcp/McpProcessManager.ts`
- **Commit:** 7596d20c

## Known Stubs

None — video feature is fully wired. The video will only be produced when `recordVideo=true` is sent in the run start request AND the Playwright MCP actually respects the `PLAYWRIGHT_VIDEO_DIR` environment variable. This is an MCP-level behavior dependency, not a stub.

## Self-Check: PASSED

- [x] `src/client/App.tsx` contains `const [recordVideo, setRecordVideo] = useState(false)`
- [x] `src/client/App.tsx` contains checkbox with `recordVideo` and `setRecordVideo`
- [x] `src/client/App.tsx` contains `recordVideo` in `requestBody`
- [x] `src/server/runManager.ts` RunEstimateRequest contains `recordVideo?: boolean`
- [x] `src/server/runManager.ts` RunConfig contains `recordVideo: boolean`
- [x] `src/server/runManager.ts` contains `PLAYWRIGHT_VIDEO_DIR`
- [x] `src/client/components/history/RunDetailView.tsx` contains `<video` element
- [x] `src/client/components/history/RunDetailView.tsx` contains `run.videoUrl`
- [x] `src/client/components/history/RunDetailView.tsx` contains `controls` and `preload="metadata"`
- [x] `src/client/components/history/RunDetailView.tsx` contains `type="video/webm"`
- [x] `src/client/types/history.ts` RunDetail contains `videoUrl?: string`
- [x] TypeScript compiles without errors (`npx tsc --noEmit` passes)
- [x] Commits 7596d20c and ff287892 exist
