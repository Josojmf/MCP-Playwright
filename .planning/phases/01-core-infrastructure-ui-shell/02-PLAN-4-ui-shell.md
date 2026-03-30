# Plan 4: UI Shell

**Phase:** 1 (Core Infrastructure & UI Shell)
**Focus:** Scaffold the React client environment, integrate Tailwind + shadcn/ui components, and implement the persistent sidebar layout, scenario editor, and MCP target selector.
**Requirements Covered:** UI-01, UI-02, UI-08, UI-09

## 1. Client Project Initialization
- Scaffold a Vite + React + TypeScript app inside `src/client/`.
- Setup Vite proxy in `vite.config.ts` to forward `/api` and `/stream` routes to Fastify (`http://localhost:3000`).
- Implement the unified startup script (D-03 config setup via `concurrently`) to run `vite` + `ts-node src/server/index.ts`.

## 2. Design System (`UI-08`)
- Install Tailwind CSS and initialize PostCSS.
- Install shadcn/ui (Radix primitives) CLI. Setup `components.json`.
- Implement a Dark/Light mode toggle switch. Default to a technical PostHog/Datadog aesthetic: neutral grays, slate backgrounds, high-contrast monospace text for data, clean borders. No excessive gradients or drop-shadows.

## 3. Shell Layout (`UI-09`, `D-02`)
- Create standard `AppLayout.tsx`.
- Include a 250px-wide persistent left sidebar navigation. Minimum links: "New Run", "Run History", "Settings".
- Dedicate the right pane for main view injection. Target 1280px overall container responsive width mapping.

## 4. Run Configuration View
- **Scenario Editor (`UI-01`):** 
  - Provide a distinct standard `<input>` field for the target Base URL.
  - Implement a large `textarea` (monospaced) for Gherkin script entry.
  - Add a file upload button mechanism utilizing standard `FileReader` to load `.feature` file contents directly into the textarea.
- **MCP Provider Selector (`UI-02`):**
  - Implement a list of checkbox components from shadcn/ui.
  - Add hard-coded mocked UI placeholders for Phase 1 (e.g., `@playwright/mcp`, `puppeteer-mcp`). Default them all to Checked.
- **Execution:** Add a prominent "Run Benchmark" button (action mocked for Phase 1, just validates form state).

## 5. Test & Validate
- Run `npm run dev` and navigate to the local host.
- Verify Vite hot-reloading works side-by-side with API calls.
- Inspect the visual responsiveness of the UI below bounding boxes (verify 1280px scaling wrapper).
- Type arbitrary code into the scenario editor, toggle the light/dark mode switch, uncheck an MCP box, and verify the settings hold up visually without crashing.
- Upload a local text file and see it populate the editor pane.
