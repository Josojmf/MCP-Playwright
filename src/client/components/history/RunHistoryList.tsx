import { LoaderCircle, RefreshCw } from "lucide-react";
import type { PersistedRun } from "@/types/history";
import { EmptyState } from "@/components/common/EmptyState";
import { History } from "lucide-react";

interface RunHistoryListProps {
  runs: PersistedRun[];
  selectedRunId: string | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelect: (runId: string) => void;
}

export function RunHistoryList({
  runs,
  selectedRunId,
  isLoading,
  error,
  onRefresh,
  onSelect,
}: RunHistoryListProps) {
  const statusBadgeClass = (status: string): string => {
    const normalized = status.toLowerCase();
    if (normalized.includes("pass") || normalized.includes("ok") || normalized.includes("complet")) {
      return "app-badge app-badge-success";
    }

    if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("abort")) {
      return "app-badge app-badge-danger";
    }

    if (normalized.includes("review") || normalized.includes("warn")) {
      return "app-badge app-badge-warning";
    }

    return "app-badge";
  };

  return (
    <section className="panel panel-animated p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">
          <History className="h-4 w-4" /> Historial de runs
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          className="app-soft-button text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recargar
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-[var(--app-muted)]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Cargando historial...
        </div>
      ) : null}

      {!isLoading && error ? (
        <p className="rounded border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && runs.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sin historial todavía"
          description="Cuando completes un run, aparecerá aquí con sus métricas."
        />
      ) : null}

      {!isLoading && !error && runs.length > 0 ? (
        <div className="space-y-2">
          {runs.map((run) => {
            const active = selectedRunId === run.id;
            return (
              <button
                type="button"
                key={run.id}
                onClick={() => onSelect(run.id)}
                className={`w-full rounded border p-3 text-left transition-colors ${
                  active
                    ? "border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_8%,var(--app-panel))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--app-accent)_20%,transparent)]"
                    : "border-[var(--app-border)] bg-[var(--app-panel)] hover:-translate-y-[1px] hover:bg-[var(--app-panel-strong)] hover:shadow-[var(--app-shadow-md)]"
                }`}
              >
                <p className="truncate text-sm font-semibold text-[var(--app-fg-strong)]">{run.name}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-[var(--app-muted)]">
                  <span>{run.totalSteps} pasos</span>
                  <span className={statusBadgeClass(run.status)}>{run.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{run.summary}</p>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
