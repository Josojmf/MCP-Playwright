import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import type { ProgressState, StepEvidence } from "@/App";
import { getStepFlagStyles } from "./StepFlagStyles";

interface RunScorecardProps {
  progressByMcp: Record<string, ProgressState>;
  stepEvidenceByMcp: Record<string, StepEvidence[]>;
  lastScreenshotByMcp: Record<string, string | null>;
}

export function RunScorecard({
  progressByMcp,
  stepEvidenceByMcp,
  lastScreenshotByMcp: _lastScreenshotByMcp,
}: RunScorecardProps) {
  const [expandedMcps, setExpandedMcps] = useState<Set<string>>(() => new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => new Set());
  const mcpIds = Object.keys(progressByMcp);

  const toggleMcp = (mcpId: string) => {
    setExpandedMcps((previous) => {
      const next = new Set(previous);
      if (next.has(mcpId)) {
        next.delete(mcpId);
      } else {
        next.add(mcpId);
      }
      return next;
    });
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps((previous) => {
      const next = new Set(previous);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const hasAnySteps = mcpIds.some((mcpId) => (stepEvidenceByMcp[mcpId] ?? []).length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-[6px] border border-[var(--app-border)] bg-[var(--app-panel)]">
        <div className="border-b border-[var(--app-border)] px-4 py-3">
          <p className="text-[12px] font-semibold tracking-[0.10em] text-[var(--app-muted)]">RESULTADOS DEL RUN</p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[var(--app-panel-strong)]">
              <th className="border-b border-[var(--app-border)] px-4 py-2 text-left text-[11px] font-semibold tracking-[0.10em] text-[var(--app-muted)] uppercase">MCP</th>
              <th className="border-b border-[var(--app-border)] px-4 py-2 text-left text-[11px] font-semibold tracking-[0.10em] text-[var(--app-muted)] uppercase">Tasa de éxito</th>
              <th className="border-b border-[var(--app-border)] px-4 py-2 text-left text-[11px] font-semibold tracking-[0.10em] text-[var(--app-muted)] uppercase">Alucinaciones</th>
              <th className="border-b border-[var(--app-border)] px-4 py-2 text-left text-[11px] font-semibold tracking-[0.10em] text-[var(--app-muted)] uppercase">Tokens / Costo</th>
              <th className="border-b border-[var(--app-border)] px-4 py-2 text-left text-[11px] font-semibold tracking-[0.10em] text-[var(--app-muted)] uppercase">Latencia media</th>
            </tr>
          </thead>
          <tbody>
            {mcpIds.map((mcpId, index) => {
              const steps = stepEvidenceByMcp[mcpId] ?? [];
              const passedSteps = steps.filter((step) => step.status === "passed").length;
              const hallucinationCount = steps.filter((step) => step.hallucinated).length;
              const averageLatency = steps.length > 0
                ? Math.round(steps.reduce((sum, step) => sum + step.latencyMs, 0) / steps.length)
                : 0;
              const passRate = steps.length > 0 ? Math.round((passedSteps / steps.length) * 100) : 0;
              const rowBackground = index % 2 === 0 ? "var(--app-panel)" : "var(--app-panel-strong)";

              return (
                <tr key={mcpId} style={{ background: rowBackground }}>
                  <td className="border-b border-[var(--app-border)] px-4 py-2 text-[13px] font-semibold text-[var(--app-fg-strong)]">
                    <span style={{ fontFamily: `ui-monospace, "Cascadia Code", monospace` }}>{mcpId}</span>
                  </td>
                  <td className="border-b border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-fg)]">{passRate}%</td>
                  <td className="border-b border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-fg)]">{hallucinationCount}</td>
                  <td className="border-b border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-fg)]">
                    {progressByMcp[mcpId]?.tokensUsed.toLocaleString("es-ES") ?? 0} tok
                  </td>
                  <td className="border-b border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-fg)]">{averageLatency}ms</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-[6px] border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <p className="mb-3 text-[12px] font-semibold tracking-[0.10em] text-[var(--app-muted)]">REPLAY DE PASOS</p>

        {!hasAnySteps ? (
          <div className="rounded-[4px] border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-4 py-8 text-center text-sm text-[var(--app-muted)]">
            Sin pasos registrados.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mcpIds.map((mcpId) => {
              const steps = [...(stepEvidenceByMcp[mcpId] ?? [])].reverse();
              const isExpanded = expandedMcps.has(mcpId);

              return (
                <div key={mcpId} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => toggleMcp(mcpId)}
                    className="flex items-center justify-between gap-2 rounded-[4px] border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-4 py-2 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel)]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-[var(--app-muted)]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[var(--app-muted)]" />
                      )}
                      <span className="text-sm font-semibold text-[var(--app-fg-strong)]">{mcpId}</span>
                    </span>
                    <span className="text-xs text-[var(--app-muted)]">{mcpId} — {steps.length} pasos</span>
                  </button>

                  {isExpanded ? (
                    <div className="flex flex-col gap-1">
                      {steps.map((step, index) => {
                        const isStepExpanded = expandedSteps.has(step.id);
                        const flag = getStepFlagStyles(step);

                        return (
                          <div
                            key={step.id}
                            style={{
                              background: "var(--app-panel)",
                              border: flag.containerStyle ? "1px solid transparent" : "1px solid var(--app-border)",
                              borderRadius: "4px",
                              marginTop: "4px",
                              ...flag.containerStyle,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => toggleStep(step.id)}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[color-mix(in_srgb,var(--app-panel-strong)_80%,transparent)]"
                              style={{ borderRadius: "4px" }}
                            >
                              <span className="min-w-[2.5rem] text-[11px] font-semibold text-[var(--app-muted)]">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm text-[var(--app-fg)]">{step.stepText}</span>
                              <span className={`app-badge ${step.status === "passed" ? "app-badge-success" : "app-badge-danger"}`}>
                                {step.status}
                              </span>
                              {flag.label ? (
                                <span
                                  className="text-[11px] font-semibold tracking-[0.10em]"
                                  style={{ color: flag.accentColor ?? "var(--app-muted)" }}
                                >
                                  {flag.label}
                                </span>
                              ) : null}
                              <span className="text-[13px] text-[var(--app-muted)]">{step.tokensUsed} tok</span>
                              <span className="text-[13px] text-[var(--app-muted)]">{step.latencyMs}ms</span>
                            </button>

                            {isStepExpanded ? (
                              <div className="px-4 pb-4">
                                <div className="mb-2 flex items-center gap-2">
                                  {flag.icon === "hallucinated" ? (
                                    <XCircle className="h-4 w-4" style={{ color: flag.accentColor ?? "var(--app-danger)" }} />
                                  ) : flag.icon === "needsReview" ? (
                                    <AlertTriangle className="h-4 w-4" style={{ color: flag.accentColor ?? "var(--app-warning)" }} />
                                  ) : null}
                                  {flag.label ? (
                                    <span
                                      className="text-[11px] font-semibold tracking-[0.10em]"
                                      style={{ color: flag.accentColor ?? "var(--app-muted)" }}
                                    >
                                      {flag.label}
                                    </span>
                                  ) : null}
                                </div>
                                {step.screenshotId ? (
                                  <>
                                    <img
                                      src={`/api/screenshots/${encodeURIComponent(step.screenshotId)}`}
                                      alt={`Screenshot paso ${index + 1} · ${mcpId}`}
                                      className="mt-2 w-full rounded-[4px] border border-[var(--app-border)] object-contain"
                                      style={{ maxHeight: "240px" }}
                                    />
                                    <a
                                      href={`/api/screenshots/${encodeURIComponent(step.screenshotId)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-2 inline-flex text-xs font-medium text-[var(--app-accent)] underline decoration-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] underline-offset-2"
                                    >
                                      Ver screenshot
                                    </a>
                                  </>
                                ) : (
                                  <p className="mt-2 text-[11px] text-[var(--app-muted)]">Sin screenshot para este paso.</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
