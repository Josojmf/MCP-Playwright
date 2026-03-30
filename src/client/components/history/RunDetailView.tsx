import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import type { RunDetail } from "@/types/history";
import { EmptyState } from "@/components/common/EmptyState";
import { FileCode2 } from "lucide-react";

interface RunDetailViewProps {
  run: RunDetail | null;
  isLoading: boolean;
  error: string | null;
}

export function RunDetailView({ run, isLoading, error }: RunDetailViewProps) {
  if (isLoading) {
    return (
      <section className="panel p-4 sm:p-5">
        <div className="flex items-center justify-center py-10 text-[var(--app-muted)]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Cargando detalle...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel p-4 sm:p-5">
        <p className="rounded border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      </section>
    );
  }

  if (!run) {
    return (
      <section className="panel p-4 sm:p-5">
        <EmptyState
          icon={FileCode2}
          title="Selecciona un run"
          description="Haz clic en un elemento del historial para ver pasos, estado y tokens."
        />
      </section>
    );
  }

  const passed = run.steps.filter((step) => step.status === "passed").length;
  const failed = run.steps.filter((step) => step.status === "failed").length;
  const passRate = run.steps.length > 0 ? Math.round((passed / run.steps.length) * 100) : 0;
  const screenshotsByStep = new Map(run.screenshots.map((screenshot) => [screenshot.stepId, screenshot]));

  const getStepStatusBadge = (status: string): string => {
    if (status === "passed") return "app-badge app-badge-success";
    if (status === "failed" || status === "aborted") return "app-badge app-badge-danger";
    if (status === "running") return "app-badge app-badge-warning";
    return "app-badge";
  };

  return (
    <section className="panel panel-animated p-4 sm:p-5">
      <h2 className="section-title mb-3">Detalle del run</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="metric-card">
          <span className="metric-label">Estado</span>
          <span className="metric-value">{run.status}</span>
        </div>
        <div className="metric-card metric-card-highlight">
          <span className="metric-label">Pass Rate</span>
          <span className="metric-value">{passRate}%</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Tokens</span>
          <span className="metric-value">{run.totalTokens.toLocaleString("es-ES")}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Costo</span>
          <span className="metric-value">${run.estimatedCost.toFixed(4)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Hallucinations</span>
          <span className="metric-value">{run.hallucinationCount ?? 0}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Needs Review</span>
          <span className="metric-value">{run.needsReviewCount ?? 0}</span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {run.steps.map((step) => (
          <article
            key={step.id}
            className="rounded border border-[var(--app-border)] bg-[var(--app-panel)] p-3 shadow-[var(--app-shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-[var(--app-fg-strong)]">
                {step.index + 1}. {step.text}
              </p>
              {step.status === "passed" ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--app-success)]" />
              ) : (
                <XCircle className="h-4 w-4 text-[var(--app-danger)]" />
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-[var(--app-muted)]">
              <span className="chip">{step.canonicalType}</span>
              <span className={getStepStatusBadge(step.status)}>{step.status}</span>
              <span>{step.latencyMs}ms</span>
              <span>{step.tokens.total} tok</span>
              <span>red {step.networkOverheadMs ?? 0}ms</span>
            </div>
            <p className="mt-1 text-xs text-[var(--app-muted)]">{step.message}</p>
            {step.validation ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded bg-[var(--app-panel-strong)] px-2 py-1 text-[var(--app-muted)]">
                  vision: {step.validation.verdict} ({Math.round(step.validation.confidence * 100)}%)
                </span>
                {step.validation.needsReview ? (
                  <span className="rounded border border-[color-mix(in_srgb,var(--app-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--app-warning)_16%,transparent)] px-2 py-1 text-[var(--app-warning)]">NEEDS_REVIEW</span>
                ) : null}
                {step.validation.hallucinated ? (
                  <span className="rounded border border-[color-mix(in_srgb,var(--app-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--app-danger)_16%,transparent)] px-2 py-1 text-[var(--app-danger)]">HALLUCINATED</span>
                ) : null}
              </div>
            ) : null}
            {screenshotsByStep.get(step.id) ? (
              <a
                href={`/api/screenshots/${encodeURIComponent(String(screenshotsByStep.get(step.id)?.id ?? ""))}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-medium text-[var(--app-accent)] underline decoration-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] underline-offset-2"
              >
                Ver screenshot
              </a>
            ) : null}
          </article>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <a
          href={`/api/history/${encodeURIComponent(run.id)}/export.json`}
          className="app-soft-button text-xs"
        >
          Export JSON
        </a>
        <a
          href={`/api/history/${encodeURIComponent(run.id)}/export.csv`}
          className="app-soft-button text-xs"
        >
          Export CSV
        </a>
      </div>

      <p className="mt-3 text-xs text-[var(--app-muted)]">
        Pasados: {passed} · Fallidos: {failed}
      </p>
    </section>
  );
}
