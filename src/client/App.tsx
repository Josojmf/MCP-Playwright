import { ChangeEvent, MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
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

type ThemeMode = "dark" | "light";
type RunState = "idle" | "estimating" | "awaiting_confirmation" | "running" | "completed" | "aborted" | "error";
type LogTone = "info" | "success" | "warning" | "error";

interface McpOption {
  id: string;
  label: string;
  engine: string;
  mode: string;
}

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

interface ProgressState {
  status: "idle" | "running" | "completed" | "aborted";
  totalSteps: number;
  completedSteps: number;
  tokensUsed: number;
  lastStepText: string;
}

interface LogEntry {
  id: number;
  time: string;
  tone: LogTone;
  text: string;
}

const MCP_OPTIONS: McpOption[] = [
  {
    id: "@playwright/mcp",
    label: "@playwright/mcp",
    engine: "Microsoft",
    mode: "ARIA snapshot",
  },
  {
    id: "puppeteer",
    label: "@modelcontextprotocol/server-puppeteer",
    engine: "Anthropic",
    mode: "CSS selectors",
  },
  {
    id: "mcp-playwright",
    label: "mcp-playwright",
    engine: "Community",
    mode: "ExecuteAutomation",
  },
  {
    id: "browserbase",
    label: "@browserbasehq/mcp",
    engine: "Cloud proxy",
    mode: "Remote browser",
  },
];

const DEFAULT_FEATURE = `Feature: Checkout Smoke\n  Background:\n    Given I open "https://example.com"\n\n  Scenario Outline: validate target\n    When I navigate to "<url>"\n    Then I should see the URL "<url>"\n\n    Examples:\n      | url                 |\n      | https://example.com |`;

const STORAGE_KEY = "mcp-bench:run-config";

function App() {
  const [persisted] = useState<PersistedConfig>(() => loadPersistedConfig());

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
      for (const mcpId of selectedMcpIds) {
        nextProgress[mcpId] = {
          status: "running",
          totalSteps,
          completedSteps: 0,
          tokensUsed: 0,
          lastStepText: "",
        };
      }

      setProgressByMcp(nextProgress);
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
            lastStepText: stepText,
          },
        };
      });

      appendLog("success", `[${mcpId}] paso completado en ${latencyMs}ms`);
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
      <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)] transition-colors duration-300">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
          <header className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
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
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-1 text-xs text-[var(--app-muted)]">
                <Wifi className={`h-3.5 w-3.5 ${isConnected ? "text-emerald-500" : "text-amber-500"}`} />
                {isConnected ? "SSE online" : "SSE idle"}
              </div>

              <button
                type="button"
                onClick={() => setTheme((previous) => (previous === "dark" ? "light" : "dark"))}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-panel-strong)]"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Light" : "Dark"}
              </button>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-8">
              <article className="panel p-4 sm:p-5">
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

              <article className="panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
                  <h2 className="section-title">
                    <FileCode2 className="h-4 w-4" /> Escenario Gherkin
                  </h2>

                  <div className="flex items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-panel-strong)]">
                      <Upload className="h-3.5 w-3.5" />
                      Importar `.feature`
                      <input type="file" accept=".feature,.txt" className="hidden" onChange={onFeatureUpload} />
                    </label>

                    <button
                      type="button"
                      onClick={() => setFeatureText(DEFAULT_FEATURE)}
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-panel-strong)]"
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
              <article className="panel p-4 sm:p-5">
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
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMcp(item.id)}
                          className="mt-1 h-4 w-4 rounded border-[var(--app-border)]"
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

              <article className="panel p-4 sm:p-5">
                <h2 className="section-title mb-3">Estado del run</h2>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="metric-card">
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
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
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

              <article className="panel p-4 sm:p-5">
                <h2 className="section-title mb-3">Live Console</h2>
                <div className="max-h-[320px] space-y-2 overflow-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-console)] p-3 font-mono text-xs">
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
            <section className="panel p-4 sm:p-5">
              <h2 className="section-title mb-3">Progreso por MCP</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Object.entries(progressByMcp).map(([mcpId, progress]) => {
                  const completion = progress.totalSteps > 0 ? Math.round((progress.completedSteps / progress.totalSteps) * 100) : 0;

                  return (
                    <article key={mcpId} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-[var(--app-fg-strong)]">{mcpId}</p>
                        <span className={`status-chip ${statusChipClass(progress.status)}`}>{progress.status}</span>
                      </div>
                      <p className="truncate text-xs text-[var(--app-muted)]">{progress.lastStepText || "Esperando primer paso..."}</p>
                      <div className="mt-3 h-1.5 rounded-full bg-[var(--app-track)]">
                        <div
                          className="h-1.5 rounded-full bg-[var(--app-accent)]"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-[var(--app-muted)]">
                        <span>{progress.completedSteps}/{progress.totalSteps} pasos</span>
                        <span>{progress.tokensUsed} tok</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
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
                className="h-9 rounded border border-[var(--app-border)] bg-transparent px-3 text-sm text-[var(--app-fg)] transition-colors hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirmRun}
                disabled={!estimate.withinBudget}
                className="h-9 rounded bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--app-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
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

function statusChipClass(status: ProgressState["status"]): string {
  if (status === "completed") return "status-success";
  if (status === "aborted") return "status-error";
  if (status === "running") return "status-running";
  return "status-idle";
}

function runStateLabel(state: RunState): string {
  if (state === "idle") return "Idle";
  if (state === "estimating") return "Estimando";
  if (state === "awaiting_confirmation") return "Esperando confirmación";
  if (state === "running") return "Ejecutando";
  if (state === "completed") return "Completado";
  if (state === "aborted") return "Abortado";
  return "Error";
}

export default App;
