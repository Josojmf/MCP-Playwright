import { X } from "lucide-react";

interface PreRunEstimateModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  estimatedCost: number;
  estimatedTokens: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  scenarioStats: {
    scenarioCount: number;
    stepCount: number;
  };
}

export function PreRunEstimateModal({
  onConfirm,
  onCancel,
  estimatedCost,
  estimatedTokens,
  estimatedInputTokens,
  estimatedOutputTokens,
  scenarioStats,
}: PreRunEstimateModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-panel)] shadow-[var(--app-shadow-lg)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-border)] p-6">
          <h2 id="modal-title" className="text-xl font-bold text-[var(--app-fg-strong)]">
            Estimación de Costo
          </h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-[var(--app-muted)] transition hover:bg-[var(--app-panel-strong)] hover:text-[var(--app-fg-strong)]"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div id="modal-description" className="p-6 space-y-6">
          {/* Cost */}
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--app-accent)_36%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_12%,var(--app-panel))] p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[var(--app-accent)]">
                ${estimatedCost.toFixed(4)}
              </span>
              <span className="text-sm text-[var(--app-muted)]">USD Estimado</span>
            </div>
          </div>

          {/* Tokens */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--app-fg-strong)]">Detalles de Tokens</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-3">
                <p className="mb-1 text-xs text-[var(--app-muted)]">Entrada</p>
                <p className="text-lg font-semibold text-[var(--app-fg-strong)]">{estimatedInputTokens.toLocaleString()}</p>
              </div>
              <div className="rounded border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-3">
                <p className="mb-1 text-xs text-[var(--app-muted)]">Salida</p>
                <p className="text-lg font-semibold text-[var(--app-fg-strong)]">{estimatedOutputTokens.toLocaleString()}</p>
              </div>
            </div>
            <div className="rounded border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-3">
              <p className="mb-1 text-xs text-[var(--app-muted)]">Total</p>
              <p className="text-lg font-semibold text-[var(--app-fg-strong)]">{estimatedTokens.toLocaleString()}</p>
            </div>
          </div>

          {/* Scenario Stats */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--app-fg-strong)]">Escenarios y Pasos</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-3">
                <p className="mb-1 text-xs text-[var(--app-muted)]">Escenarios</p>
                <p className="text-lg font-semibold text-[var(--app-fg-strong)]">{scenarioStats.scenarioCount}</p>
              </div>
              <div className="rounded border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-3">
                <p className="mb-1 text-xs text-[var(--app-muted)]">Pasos</p>
                <p className="text-lg font-semibold text-[var(--app-fg-strong)]">{scenarioStats.stepCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 rounded-b-lg border-t border-[var(--app-border)] bg-[var(--app-panel-strong)] p-6">
          <button
            onClick={onCancel}
            className="app-soft-button flex-1 justify-center"
            aria-label="Cancelar ejecución"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="app-primary-button flex-1"
            aria-label="Confirmar ejecución"
          >
            Confirmar Ejecución
          </button>
        </div>
      </div>
    </div>
  );
}
