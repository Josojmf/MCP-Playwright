---
status: diagnosed
trigger: "Diagnose the Phase 11 UAT gap only. Find root cause, evidence, files involved, and suggested fix direction. Do not implement fixes."
created: 2026-04-02T16:10:31.7185306+02:00
updated: 2026-04-02T16:17:42.0000000+02:00
---

## Current Focus

hypothesis: The lightbox fails because `ScreenshotLightbox` custom-composes Base UI dialog primitives incorrectly; opening the modal hides the live app but the popup content is not rendered as a proper visible dialog surface.
test: Compare screenshot URL flow against the API/storage path, then isolate what is unique to the failing lightbox path.
expecting: Screenshot delivery is valid and the only broken path is the custom dialog composition in `ScreenshotLightbox.tsx`.
next_action: return root cause with evidence and fix direction

## Symptoms

expected: Clicking a live screenshot should open a lightbox modal with the full-size screenshot and a dark overlay, then close back to the live view cleanly.
actual: User reported: "The screenshot is not shown, only a white screen appears"
errors: none reported beyond visible white screen
reproduction: Start a live run, wait for a screenshot in an MCP column, click the screenshot thumbnail.
started: Reported during Phase 11 UAT on 2026-04-02

## Eliminated

- hypothesis: The lightbox is blank because the screenshot endpoint is single-use or deletes the image after the thumbnail loads.
  evidence: `McpColumn.tsx` uses the same `/api/screenshots/:id` URL for both thumbnail and lightbox; `history.ts` and `storage/screenshots.ts` only read and return PNG buffers and never delete screenshots on access.
  timestamp: 2026-04-02T16:17:42.0000000+02:00

## Evidence

- timestamp: 2026-04-02T16:12:10.0000000+02:00
  checked: src/client/components/run/McpColumn.tsx
  found: The live thumbnail and the lightbox both resolve the same screenshot URL, `/api/screenshots/${encodeURIComponent(lastScreenshotId)}`.
  implication: Screenshot capture/storage is already good enough for the thumbnail to render; the failing behavior is downstream of the click path.

- timestamp: 2026-04-02T16:15:03.0000000+02:00
  checked: src/server/api/history.ts and src/server/storage/screenshots.ts
  found: `/api/screenshots/:id` reads the PNG buffer with `getScreenshot()` and returns it with `Content-Type: image/png`; `getScreenshot()` walks the screenshot directories and `readFile()`s the matching PNG without mutation or cleanup.
  implication: Opening the lightbox does not hit a destructive or one-time screenshot API path, so the blank result is not caused by screenshot retrieval semantics.

- timestamp: 2026-04-02T16:16:18.0000000+02:00
  checked: src/client/components/run/ScreenshotLightbox.tsx
  found: The lightbox bypasses the shared dialog abstraction and manually renders `DialogPrimitive.Backdrop` plus `DialogPrimitive.Popup`, applying all modal-surface styles directly to `Popup`.
  implication: The failing behavior is isolated to a custom dialog composition that differs from the app's intended dialog wrapper contract.

- timestamp: 2026-04-02T16:17:02.0000000+02:00
  checked: src/client/components/ui/dialog.tsx and Base UI Dialog docs/package source
  found: The shared dialog contract is built around a composed dialog wrapper, while Base UI documents `Dialog.Popup` as the container for dialog contents and introduces `Dialog.Viewport` as the positioning container; Base UI also documents special popup pointer/backdrop behavior.
  implication: Styling `Dialog.Popup` itself as the visible card in `ScreenshotLightbox` is a misuse of the underlying dialog anatomy and is the most specific explanation for the app blanking to an empty sheet when the modal opens.

## Resolution

root_cause: `ScreenshotLightbox` custom-composes Base UI dialog primitives incorrectly. It bypasses the app's shared dialog wrapper and styles `DialogPrimitive.Popup` itself as the modal surface, even though Base UI treats `Popup` as the dialog container with special viewport/pointer semantics. When the lightbox opens, modal state hides the underlying live view but the popup content is not rendered as a proper visible dialog surface, so the user sees a blank white sheet instead of the screenshot.
fix: Rebuild `ScreenshotLightbox` to follow the shared dialog/Base UI anatomy instead of manually styling `DialogPrimitive.Popup` as the card. Use the app-level dialog wrapper (`DialogContent`, and if needed `Dialog.Viewport`/an inner content wrapper) so the modal surface and image are rendered inside the correct dialog content container.
verification:
files_changed: []
