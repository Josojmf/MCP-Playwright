import { ChangeEvent, MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  Cog,
  FileCode2,
  History,
  LoaderCircle,
  Moon,
  Play,
  Server,
  Shield,
  Sun,
  Upload,
  Wifi,
  XCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RunHistoryList } from "@/components/history/RunHistoryList";
import { RunDetailView } from "@/components/history/RunDetailView";
import type { HistoryListResponse, RunDetail, RunDetailResponse, PersistedRun } from "@/types/history";
import { MCP_REGISTRY } from "../shared/registry";
import { McpColumnGrid } from "@/components/run/McpColumnGrid";
import { RunScorecard } from "@/components/run/RunScorecard";

type ThemeMode = "dark" | "light";
export type RunState = "idle" | "estimating" | "awaiting_confirmation" | "running" | "completed" | "aborted" | "error";
type LogTone = "info" | "success" | "warning" | "error";

interface McpOption {
  id: string;
  label: string;
  engine: string;
  mode: string;
}

type SidebarSection = "new_run" | "run_history" | "settings";

interface RunEstimate {
  scenarioCount: number;
  stepCount: number;
  selectedMcpCount: number;
  totalExecutions: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  withinBudget: boolean;
}

interface RunStartResponse {
  runId: string;
  streamPath: string;
  estimate: RunEstimate;
}

export interface ProgressState {
  status: "idle" | "running" | "completed" | "aborted";
  totalSteps: number;
  completedSteps: number;
  tokensUsed: number;
  networkOverheadMs: number;
  lastStepText: string;
}

export interface StepEvidence {
  id: string;
  stepText: string;
  status: "passed" | "failed";
  latencyMs: number;
  tokensUsed: number;
  screenshotId: string | null;
  videoUrl: string | null;
  timestamp: string;
  hallucinated?: boolean;
  needsReview?: boolean;
}

interface LogEntry {
  id: number;
  time: string;
  tone: LogTone;
  text: string;
}

const MCP_OPTION_ORDER = [
  "@playwright/mcp",
  "@modelcontextprotocol/server-puppeteer",
  "mcp-playwright",
  "@browserbasehq/mcp",
] as const;

const MCP_METADATA: Record<string, Pick<McpOption, "engine" | "mode">> = {
  "@playwright/mcp": { engine: "Microsoft", mode: "ARIA snapshot" },
  "@modelcontextprotocol/server-puppeteer": { engine: "Anthropic", mode: "CSS selectors" },
  "mcp-playwright": { engine: "Community", mode: "ExecuteAutomation" },
  "@browserbasehq/mcp": { engine: "Cloud proxy", mode: "Remote browser" },
};

const MCP_OPTIONS: McpOption[] = MCP_OPTION_ORDER.map((id) => {
  const item = MCP_REGISTRY[id];
  const metadata = MCP_METADATA[id] ?? { engine: "Unknown", mode: "Unknown" };

  return {
    id,
    label: item?.label ?? id,
    engine: metadata.engine,
    mode: metadata.mode,
  };
});

const DEFAULT_FEATURE = `Feature: Checkout Smoke\n  Background:\n    Given I open "https://example.com"\n\n  Scenario Outline: validate target\n    When I navigate to "<url>"\n    Then I should see the URL "<url>"\n\n    Examples:\n      | url                 |\n      | https://example.com |`;

const STORAGE_KEY = "mcp-bench:run-config";

function App() {
  const [persisted] = useState<PersistedConfig>(() => loadPersistedConfig());
  const [activeSection, setActiveSection] = useState<SidebarSection>("new_run");

  const [theme, setTheme] = useState<ThemeMode>(persisted.theme ?? "dark");
  const [baseUrl, setBaseUrl] = useState(persisted.baseUrl ?? "https://example.com");
  const [featureText, setFeatureText] = useState(persisted.featureText ?? DEFAULT_FEATURE);
  const [tokenCap, setTokenCap] = useState<number>(persisted.tokenCap ?? 12000);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>(
    persisted.selectedMcpIds && persisted.selectedMcpIds.length > 0
      ? persisted.selectedMcpIds
      : MCP_OPTIONS.map((item) => item.id)
  );

  const [estimate, setEstimate] = useState<RunEstimate | null>(null);
  const [isEstimateModalOpen, setIsEstimateModalOpen] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [progressByMcp, setProgressByMcp] = useState<Record<string, ProgressState>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastScreenshotByMcp, setLastScreenshotByMcp] = useState<Record<string, string | null>>({});
  const [stepEvidenceByMcp, setStepEvidenceByMcp] = useState<Record<string, StepEvidence[]>>({});
  const [historyRuns, setHistoryRuns] = useState<PersistedRun[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null);
  const [selectedHistoryRun, setSelectedHistoryRun] = useState<RunDetail | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [cumulativeCost, setCumulativeCost] = useState<{ totalUsd: number; runCount: number } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme,
        baseUrl,
        featureText,
        tokenCap,
        selectedMcpIds,
      })
    );
  }, [theme, baseUrl, featureText, tokenCap, selectedMcpIds]);

  useEffect(() => {
    return () => {
      closeEventSource(eventSourceRef);
    };
  }, []);

  useEffect(() => {
    if (activeSection === "run_history") {
      void fetchHistory();
    }
  }, [activeSection]);

  const lineNumbers = useMemo(() => {
    const lines = Math.max(8, featureText.split("\n").length);
    return Array.from({ length: lines }, (_, idx) => idx + 1);
  }, [featureText]);

  const summary = useMemo(() => {
    const progressItems = Object.values(progressByMcp);
    if (progressItems.length === 0) {
      return {
        completedSteps: 0,
        totalSteps: 0,
        progressPercent: 0,
        tokensUsed: 0,
      };
    }

    const completedSteps = progressItems.reduce((sum, item) => sum + item.completedSteps, 0);
    const totalSteps = progressItems.reduce((sum, item) => sum + item.totalSteps, 0);
    const tokensUsed = progressItems.reduce((sum, item) => sum + item.tokensUsed, 0);

    return {
      completedSteps,
      totalSteps,
      progressPercent: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
      tokensUsed,
    };
  }, [progressByMcp]);

  const runLabel = runStateLabel(runState);

  const appendLog = (tone: LogTone, text: string) => {
    setLogs((previous) => {
      const next: LogEntry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        time: new Date().toLocaleTimeString("es-ES"),
        tone,
        text,
      };

      return [next, ...previous].slice(0, 200);
    });
  };

  const appendStepEvidence = (mcpId: string, evidence: StepEvidence) => {
    setStepEvidenceByMcp((previous) => {
      const current = previous[mcpId] ?? [];
      const next = [evidence, ...current].slice(0, 25);
      return {
        ...previous,
        [mcpId]: next,
      };
    });
  };

  const toggleMcp = (mcpId: string) => {
    setSelectedMcpIds((previous) => {
      if (previous.includes(mcpId)) {
        return previous.filter((item) => item !== mcpId);
      }

      return [...previous, mcpId];
    });
  };

  const onFeatureUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setFeatureText(String(loadEvent.target?.result ?? ""));
      appendLog("success", `Archivo ${file.name} cargado en el editor.`);
    };

    reader.readAsText(file);
    event.target.value = "";
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetch("/api/history?limit=50");
      const payload = (await response.json()) as HistoryListResponse & { message?: string };

      if (!response.ok || payload.status !== "success") {
        throw new Error(payload.message ?? "No se pudo cargar el historial.");
      }

      setHistoryRuns(payload.data);
      if (payload.data.length > 0 && !selectedHistoryRunId) {
        setSelectedHistoryRunId(payload.data[0].id);
        void fetchRunDetail(payload.data[0].id);
      }

      const costResponse = await fetch("/api/history/cost/total");
      const costPayload = (await costResponse.json()) as {
        status: "success" | "error";
        data?: { totalUsd: number; runCount: number };
      };
      if (costResponse.ok && costPayload.status === "success" && costPayload.data) {
        setCumulativeCost(costPayload.data);
      }
    } catch (error) {
      setHistoryError(getErrorMessage(error));
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchRunDetail = async (runId: string) => {
    setHistoryDetailLoading(true);
    setHistoryDetailError(null);

    try {
      const response = await fetch(`/api/history/${encodeURIComponent(runId)}`);
      const payload = (await response.json()) as RunDetailResponse;

      if (!response.ok || payload.status !== "success" || !payload.data) {
        throw new Error(payload.message ?? "No se pudo cargar el detalle del run.");
      }

      setSelectedHistoryRun(payload.data);
    } catch (error) {
      setHistoryDetailError(getErrorMessage(error));
      setSelectedHistoryRun(null);
    } finally {
      setHistoryDetailLoading(false);
    }
  };

  const requestBody = {
    baseUrl: baseUrl.trim(),
    featureText: featureText.trim(),
    selectedMcpIds,
    tokenCap,
  };

  const estimateRun = async () => {
    const response = await fetch("/api/runs/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const payload = (await response.json()) as { estimate?: RunEstimate; error?: string };

    if (!response.ok || !payload.estimate) {
      throw new Error(payload.error ?? "No se pudo calcular la estimación del run.");
    }

    return payload.estimate;
  };

  const onEstimateAndOpen = async () => {
    closeEventSource(eventSourceRef);
    setErrorText(null);
    setRunState("estimating");

    try {
      const nextEstimate = await estimateRun();
      setEstimate(nextEstimate);
      setRunState("awaiting_confirmation");
      setIsEstimateModalOpen(true);
      appendLog("info", "Estimación calculada. Revisa el costo antes de confirmar.");
    } catch (error) {
      const message = getErrorMessage(error);
      setRunState("error");
      setErrorText(message);
      appendLog("error", message);
    }
  };

  const onConfirmRun = async () => {
    if (!estimate) {
      return;
    }

    setIsEstimateModalOpen(false);
    setErrorText(null);
    setLogs([]);
    setProgressByMcp({});
    setLastScreenshotByMcp({});
    setStepEvidenceByMcp({});

    try {
      const response = await fetch("/api/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as RunStartResponse & { error?: string };

      if (!response.ok || !payload.runId) {
        throw new Error(payload.error ?? "No se pudo iniciar el run.");
      }

      setActiveRunId(payload.runId);
      setEstimate(payload.estimate);
      setRunState("running");

      connectEventStream(payload.streamPath);
      appendLog("info", `Run ${payload.runId} iniciado.`);
    } catch (error) {
      const message = getErrorMessage(error);
      setRunState("error");
      setErrorText(message);
      appendLog("error", message);
    }
  };

  const connectEventStream = (streamPath: string) => {
    closeEventSource(eventSourceRef);

    const source = new EventSource(streamPath);
    eventSourceRef.current = source;

    source.addEventListener("connected", () => {
      setIsConnected(true);
      appendLog("success", "Canal SSE conectado.");
    });

    source.addEventListener("run_started", (event) => {
      const data = parseData(event);
      const totalSteps = getNumeric(data.stepCount);

      const nextProgress: Record<string, ProgressState> = {};
      const nextScreenshots: Record<string, string | null> = {};
      const nextEvidence: Record<string, StepEvidence[]> = {};
      for (const mcpId of selectedMcpIds) {
        nextProgress[mcpId] = {
          status: "running",
          totalSteps,
          completedSteps: 0,
          tokensUsed: 0,
          networkOverheadMs: 0,
          lastStepText: "",
        };
        nextScreenshots[mcpId] = null;
        nextEvidence[mcpId] = [];
      }

      setProgressByMcp(nextProgress);
      setLastScreenshotByMcp(nextScreenshots);
      setStepEvidenceByMcp(nextEvidence);
      appendLog("info", `Run en ejecución: ${getNumeric(data.totalExecutions)} ejecuciones planeadas.`);
    });

    source.addEventListener("mcp_ready", (event) => {
      const data = parseData(event);
      const mcpId = getString(data.mcpId);
      appendLog("info", `MCP listo: ${mcpId}`);
    });

    source.addEventListener("step_started", (event) => {
      const data = parseData(event);
      const mcpId = getString(data.mcpId);
      const stepText = getString(data.stepText);

      setProgressByMcp((previous) => {
        const current = previous[mcpId];
        if (!current) {
          return previous;
        }

        return {
          ...previous,
          [mcpId]: {
            ...current,
            status: "running",
            lastStepText: stepText,
          },
        };
      });
    });

    source.addEventListener("step_passed", (event) => {
      const data = parseData(event);
      const mcpId = getString(data.mcpId);
      const stepText = getString(data.stepText);
      const tokensUsed = getNumeric(data.tokensUsed);
      const latencyMs = getNumeric(data.latencyMs);
      const networkOverheadMs = getNumeric(data.networkOverheadMs);
      const hallucinated = getBoolean(data.hallucinated);
      const needsReview = getBoolean(data.needsReview);
      const screenshotId = getString(data.screenshotId);
      const videoUrl = getString(data.videoUrl);

      setProgressByMcp((previous) => {
        const current = previous[mcpId];
        if (!current) {
          return previous;
        }

        return {
          ...previous,
          [mcpId]: {
            ...current,
            completedSteps: Math.min(current.completedSteps + 1, current.totalSteps),
            tokensUsed: current.tokensUsed + tokensUsed,
            networkOverheadMs: current.networkOverheadMs + networkOverheadMs,
            lastStepText: stepText,
          },
        };
      });
      appendLog(
        "success",
        `[${mcpId}] paso completado en ${latencyMs}ms${networkOverheadMs > 0 ? ` (+${networkOverheadMs}ms red)` : ""}`
      );
      if (screenshotId) {
        setLastScreenshotByMcp((previous) => ({ ...previous, [mcpId]: screenshotId }));
      }
      appendStepEvidence(mcpId, {
        id: `${mcpId}-${Date.now()}-${Math.random()}`,
        stepText,
        status: "passed",
        latencyMs,
        tokensUsed,
        screenshotId: screenshotId || null,
        videoUrl: videoUrl || null,
        timestamp: new Date().toISOString(),
        hallucinated: hallucinated || undefined,
        needsReview: needsReview || undefined,
      });
      if (hallucinated) {
        appendLog("error", `[${mcpId}] posible alucinación detectada en el paso actual.`);
      } else if (needsReview) {
        appendLog("warning", `[${mcpId}] paso marcado como NEEDS_REVIEW.`);
      }
    });

    source.addEventListener("step_failed", (event) => {
      const data = parseData(event);
      const mcpId = getString(data.mcpId);
      const stepText = getString(data.stepText);
      const tokensUsed = getNumeric(data.tokensUsed);
      const latencyMs = getNumeric(data.latencyMs);
      const networkOverheadMs = getNumeric(data.networkOverheadMs);
      const screenshotId = getString(data.screenshotId);
      const videoUrl = getString(data.videoUrl);
      const hallucinated = getBoolean(data.hallucinated);
      const needsReview = getBoolean(data.needsReview);

      setProgressByMcp((previous) => {
        const current = previous[mcpId];
        if (!current) {
          return previous;
        }

        return {
          ...previous,
          [mcpId]: {
            ...current,
            completedSteps: Math.min(current.completedSteps + 1, current.totalSteps),
            tokensUsed: current.tokensUsed + tokensUsed,
            networkOverheadMs: current.networkOverheadMs + networkOverheadMs,
            lastStepText: stepText,
          },
        };
      });

      appendLog(
        "error",
        `[${mcpId}] paso fallido en ${latencyMs}ms${networkOverheadMs > 0 ? ` (+${networkOverheadMs}ms red)` : ""}`
      );
      if (screenshotId) {
        setLastScreenshotByMcp((previous) => ({ ...previous, [mcpId]: screenshotId }));
      }
      appendStepEvidence(mcpId, {
        id: `${mcpId}-${Date.now()}-${Math.random()}`,
        stepText,
        status: "failed",
        latencyMs,
        tokensUsed,
        screenshotId: screenshotId || null,
        videoUrl: videoUrl || null,
        timestamp: new Date().toISOString(),
        hallucinated: hallucinated || undefined,
        needsReview: needsReview || undefined,
      });
    });

    source.addEventListener("mcp_aborted", (event) => {
      const data = parseData(event);
      const mcpId = getString(data.mcpId);
      appendLog("error", `[${mcpId}] abortado: ${getString(data.reason)}`);

      setProgressByMcp((previous) => {
        const current = previous[mcpId];
        if (!current) {
          return previous;
        }

        return {
          ...previous,
          [mcpId]: {
            ...current,
            status: "aborted",
          },
        };
      });
    });

    source.addEventListener("run_persisted", (event) => {
      const data = parseData(event);
      const mcpId = getString(data.mcpId);
      const persistedRunId = getString(data.persistedRunId);
      if (persistedRunId) {
        appendLog("info", `[${mcpId}] guardado en historial (${persistedRunId}).`);
      }
    });

    source.addEventListener("warning", (event) => {
      const data = parseData(event);
      appendLog("warning", getString(data.message));
    });

    source.addEventListener("run_completed", (event) => {
      const data = parseData(event);
      setRunState("completed");
      setIsConnected(false);

      setProgressByMcp((previous) => {
        const next = { ...previous };
        for (const mcpId of Object.keys(next)) {
          next[mcpId] = {
            ...next[mcpId],
            status: "completed",
            completedSteps: next[mcpId].totalSteps,
          };
        }

        return next;
      });

      appendLog("success", `Run completado. Tokens usados: ${getNumeric(data.totalTokensUsed)}.`);
      closeEventSource(eventSourceRef);
      void fetchHistory();
    });

    source.addEventListener("run_aborted", (event) => {
      const data = parseData(event);
      setRunState("aborted");
      setIsConnected(false);

      setProgressByMcp((previous) => {
        const next = { ...previous };
        for (const mcpId of Object.keys(next)) {
          next[mcpId] = {
            ...next[mcpId],
            status: "aborted",
          };
        }

        return next;
      });

      appendLog("error", `Run abortado: ${getString(data.reason)}`);
      closeEventSource(eventSourceRef);
    });

    source.onerror = () => {
      if (runState === "completed" || runState === "aborted") {
        return;
      }

      setIsConnected(false);
      setRunState("error");
      appendLog("error", "SSE desconectado inesperadamente.");
      closeEventSource(eventSourceRef);
    };
  };

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="app-shell transition-colors duration-300">
        <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
          <aside className="w-[240px] shrink-0 border-r border-[var(--app-border)] bg-[var(--app-sidebar)] p-4">
            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border-strong)] bg-[var(--app-panel)] text-[var(--app-accent)]">
                <Server className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-[var(--app-fg-strong)]">MCP Bench</p>
            </div>

            <nav className="space-y-2">
              <button
                type="button"
                className={`sidebar-nav-item ${activeSection === "new_run" ? "sidebar-nav-item-active" : ""}`}
                onClick={() => setActiveSection("new_run")}
              >
                <Play className="h-4 w-4" />
                Nuevo Run
              </button>
              <button
                type="button"
                className={`sidebar-nav-item ${activeSection === "run_history" ? "sidebar-nav-item-active" : ""}`}
                onClick={() => setActiveSection("run_history")}
              >
                <History className="h-4 w-4" />
                Historial
              </button>
              <button
                type="button"
                className={`sidebar-nav-item ${activeSection === "settings" ? "sidebar-nav-item-active" : ""}`}
                onClick={() => setActiveSection("settings")}
              >
                <Cog className="h-4 w-4" />
                Settings
              </button>
            </nav>
          </aside>

          <main className="flex-1 px-6 py-6">
            <div className="flex flex-col gap-6">
          <header className="panel panel-animated panel-gradient relative overflow-hidden flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[color-mix(in_srgb,var(--app-accent)_18%,transparent)] blur-3xl" />
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-panel-strong)] text-[var(--app-accent)]">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--app-muted)]">MCP Playwright Bench</p>
                <h1 className="text-lg font-semibold text-[var(--app-fg-strong)] sm:text-xl">Escenario + Selector + Streaming en tiempo real</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`inline-flex items-center gap-2 rounded-[2px] border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-1 text-xs text-[var(--app-muted)] ${isConnected ? "app-running-ring" : ""}`}>
                <Wifi className={`h-3.5 w-3.5 ${isConnected ? "text-emerald-500" : "text-amber-500"}`} />
                {isConnected ? "SSE online" : "SSE idle"}
              </div>

              <button
                type="button"
                onClick={() => setTheme((previous) => (previous === "dark" ? "light" : "dark"))}
                className="app-soft-button"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Light" : "Dark"}
              </button>
            </div>
          </header>

          {activeSection === "new_run" ? (
            <>
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="space-y-6 xl:col-span-8">
                  <article className="panel panel-animated p-4 sm:p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="section-title">
                        <Shield className="h-4 w-4" /> Contexto de ejecución
                      </h2>
                      <span className="chip">{selectedMcpIds.length} MCP seleccionados</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <label className="field">
                        <span className="field-label">Base URL</span>
                        <input
                          type="url"
                          value={baseUrl}
                          onChange={(event) => setBaseUrl(event.target.value)}
                          className="field-input"
                          placeholder="https://example.com"
                        />
                      </label>

                      <label className="field">
                        <span className="field-label">Token Cap</span>
                        <input
                          type="number"
                          min={500}
                          step={250}
                          value={tokenCap}
                          onChange={(event) => setTokenCap(Number(event.target.value || 0))}
                          className="field-input font-mono"
                        />
                      </label>
                    </div>
                  </article>

                  <article className="panel panel-animated overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
                      <h2 className="section-title">
                        <FileCode2 className="h-4 w-4" /> Escenario Gherkin
                      </h2>

                      <div className="flex items-center gap-2">
                        <label className="app-soft-button cursor-pointer text-xs font-medium">
                          <Upload className="h-3.5 w-3.5" />
                          Importar `.feature`
                          <input type="file" accept=".feature,.txt" className="hidden" onChange={onFeatureUpload} />
                        </label>

                        <button
                          type="button"
                          onClick={() => setFeatureText(DEFAULT_FEATURE)}
                          className="app-soft-button text-xs"
                        >
                          <History className="h-3.5 w-3.5" />
                          Cargar demo
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-[42px_1fr] bg-[var(--app-code-bg)]">
                      <pre className="max-h-[420px] overflow-auto border-r border-[var(--app-border)] px-2 py-3 text-right text-xs leading-6 text-[var(--app-muted)]">
                        {lineNumbers.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </pre>
                      <textarea
                        value={featureText}
                        onChange={(event) => setFeatureText(event.target.value)}
                        className="min-h-[300px] w-full resize-y border-none bg-transparent px-4 py-3 font-mono text-[13px] leading-6 text-[var(--app-fg-strong)] outline-none"
                        spellCheck={false}
                      />
                    </div>
                  </article>
                </div>

                <aside className="space-y-6 xl:col-span-4">
                  <article className="panel panel-animated p-4 sm:p-5">
                    <h2 className="section-title mb-3">
                      <Activity className="h-4 w-4" /> MCP Targets
                    </h2>

                    <div className="space-y-2.5">
                      {MCP_OPTIONS.map((item) => {
                        const isSelected = selectedMcpIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className={`mcp-option ${isSelected ? "mcp-option-selected" : ""}`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleMcp(item.id)}
                              className="mcp-checkbox"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--app-fg-strong)]">{item.label}</p>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--app-muted)]">
                                {item.engine} · {item.mode}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </article>

                  <article className="panel panel-animated p-4 sm:p-5">
                    <h2 className="section-title mb-3">Estado del run</h2>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="metric-card metric-card-highlight">
                        <span className="metric-label">Estado</span>
                        <span className="metric-value">{runLabel}</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Progreso</span>
                        <span className="metric-value">{summary.progressPercent}%</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Pasos</span>
                        <span className="metric-value">{summary.completedSteps}/{summary.totalSteps}</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Tokens</span>
                        <span className="metric-value">{summary.tokensUsed.toLocaleString("es-ES")}</span>
                      </div>
                    </div>

                    <div className="mt-4 h-2 rounded-full bg-[var(--app-track)]">
                      <div
                        className="h-2 rounded-full bg-[var(--app-accent)] transition-all duration-300"
                        style={{ width: `${summary.progressPercent}%` }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onEstimateAndOpen}
                        disabled={runState === "estimating" || runState === "running"}
                        className="app-primary-button"
                      >
                        {runState === "estimating" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Estimar y ejecutar
                      </button>

                      <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-xs text-[var(--app-muted)]">
                        Run ID: {activeRunId ? activeRunId.slice(0, 8) : "-"}
                      </span>
                    </div>

                    {errorText ? (
                      <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{errorText}</p>
                    ) : null}
                  </article>

                  <article className="panel panel-animated p-4 sm:p-5">
                    <h2 className="section-title mb-3">Live Console</h2>
                    <div aria-live="polite" className="max-h-[320px] space-y-2 overflow-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-console)] p-3 font-mono text-xs">
                      {logs.length === 0 ? (
                        <p className="text-[var(--app-muted)]">Sin eventos todavía.</p>
                      ) : (
                        logs.map((entry) => (
                          <p key={entry.id} className={logClass(entry.tone)}>
                            [{entry.time}] {entry.text}
                          </p>
                        ))
                      )}
                    </div>
                  </article>
                </aside>
              </section>

              {Object.keys(progressByMcp).length > 0 ? (
                runState === "running" ? (
                  <section className="panel panel-animated p-4 sm:p-5">
                    <h2 className="section-title mb-3">EJECUCIÓN EN VIVO</h2>
                    <McpColumnGrid
                      progressByMcp={progressByMcp}
                      stepEvidenceByMcp={stepEvidenceByMcp}
                      lastScreenshotByMcp={lastScreenshotByMcp}
                      isRunning
                      onAbort={() => {
                        closeEventSource(eventSourceRef);
                        setRunState("aborted");
                      }}
                    />
                  </section>
                ) : runState === "completed" || runState === "aborted" ? (
                  <section className="panel panel-animated p-4 sm:p-5">
                    <RunScorecard
                      progressByMcp={progressByMcp}
                      stepEvidenceByMcp={stepEvidenceByMcp}
                      lastScreenshotByMcp={lastScreenshotByMcp}
                    />
                  </section>
                ) : null
              ) : null}
            </>
          ) : null}

          {activeSection === "run_history" ? (
            <>
              <section className="panel panel-animated p-4 sm:p-5">
                <h2 className="section-title mb-3">Dashboard de costo</h2>
                <div className="grid grid-cols-2 gap-3 text-sm sm:max-w-md">
                  <div className="metric-card metric-card-highlight">
                    <span className="metric-label">Costo acumulado</span>
                    <span className="metric-value">${(cumulativeCost?.totalUsd ?? 0).toFixed(4)}</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Runs totales</span>
                    <span className="metric-value">{cumulativeCost?.runCount ?? 0}</span>
                  </div>
                </div>
              </section>
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="xl:col-span-4">
                  <RunHistoryList
                    runs={historyRuns}
                    selectedRunId={selectedHistoryRunId}
                    isLoading={historyLoading}
                    error={historyError}
                    onRefresh={() => {
                      void fetchHistory();
                    }}
                    onSelect={(runId) => {
                      setSelectedHistoryRunId(runId);
                      void fetchRunDetail(runId);
                    }}
                  />
                </div>
                <div className="xl:col-span-8">
                  <RunDetailView
                    run={selectedHistoryRun}
                    isLoading={historyDetailLoading}
                    error={historyDetailError}
                  />
                </div>
              </section>
            </>
          ) : null}

          {activeSection === "settings" ? (
            <section className="panel panel-animated p-4 sm:p-5">
              <h2 className="section-title mb-3">Settings</h2>
              <p className="text-sm text-[var(--app-muted)]">
                Configuración técnica en progreso. De momento puedes ajustar `token cap`, seleccionar MCPs y cambiar tema desde esta pantalla.
              </p>
            </section>
          ) : null}
            </div>
          </main>
        </div>
      </div>

      {isEstimateModalOpen && estimate ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded border border-[var(--app-border-strong)] bg-[var(--app-panel-strong)] p-5">
            <h3 className="text-base font-semibold text-[var(--app-fg-strong)]">Confirmar ejecución</h3>
            <p className="mt-1 text-sm text-[var(--app-muted)]">Validamos presupuesto antes de abrir el stream.</p>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="metric-card">
                <span className="metric-label">Escenarios</span>
                <span className="metric-value">{estimate.scenarioCount}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Pasos</span>
                <span className="metric-value">{estimate.stepCount}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Tokens estimados</span>
                <span className="metric-value">{estimate.estimatedTotalTokens.toLocaleString("es-ES")}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Costo estimado</span>
                <span className="metric-value">${estimate.estimatedCostUsd.toFixed(4)}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm">
              {estimate.withinBudget ? (
                <>
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span className="text-emerald-500">Dentro del token cap.</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-400" />
                  <span className="text-red-400">El estimado supera el token cap configurado.</span>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEstimateModalOpen(false);
                  setRunState("idle");
                }}
                className="app-soft-button h-9 px-3"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirmRun}
                disabled={!estimate.withinBudget}
                className="app-primary-button h-9 px-4 text-sm font-semibold disabled:cursor-not-allowed"
              >
                Confirmar run
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

interface PersistedConfig {
  theme?: ThemeMode;
  baseUrl?: string;
  featureText?: string;
  tokenCap?: number;
  selectedMcpIds?: string[];
}

function loadPersistedConfig(): PersistedConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as PersistedConfig;
    return parsed;
  } catch {
    return {};
  }
}

function closeEventSource(ref: MutableRefObject<EventSource | null>) {
  if (ref.current) {
    ref.current.close();
    ref.current = null;
  }
}

function parseData(event: Event): Record<string, unknown> {
  const message = event as MessageEvent;
  if (!message.data || typeof message.data !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(message.data) as Record<string, unknown>;
    return parsed;
  } catch {
    return {};
  }
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Error inesperado";
}

function logClass(tone: LogTone): string {
  if (tone === "success") return "text-emerald-400";
  if (tone === "warning") return "text-amber-400";
  if (tone === "error") return "text-red-400";
  return "text-slate-300";
}

export function statusChipClass(status: ProgressState["status"]): string {
  if (status === "completed") return "status-success";
  if (status === "aborted") return "status-error";
  if (status === "running") return "status-running";
  return "status-idle";
}

function runStateLabel(state: RunState): string {
  if (state === "idle") return "Listo";
  if (state === "estimating") return "Estimando";
  if (state === "awaiting_confirmation") return "Esperando confirmación";
  if (state === "running") return "Ejecutando";
  if (state === "completed") return "Completado";
  if (state === "aborted") return "Abortado";
  return "Error";
}

export default App;
