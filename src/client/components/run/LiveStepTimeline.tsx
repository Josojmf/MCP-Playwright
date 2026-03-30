import { AlertCircle, CheckCircle2, Clock, Loader, XCircle } from "lucide-react";

interface StepTokens {
  input: number;
  output: number;
  total: number;
}

interface ToolCallTrace {
  toolId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: string;
  error?: string;
}

interface StepResult {
  stepId: string;
  stepIndex: number;
  scenarioId: string;
  scenarioName: string;
  stepText: string;
  canonicalType: "given" | "when" | "then";
  status: "running" | "passed" | "failed" | "aborted";
  tokens: StepTokens;
  latencyMs: number;
  message: string;
  toolCalls: ToolCallTrace[];
  timestamp: string;
}

interface LiveStepTimelineProps {
  steps: StepResult[];
  isRunning: boolean;
  onAbort?: () => void;
}

export function LiveStepTimeline({ steps, isRunning, onAbort }: LiveStepTimelineProps) {
  const completedSteps = steps.filter((s) => s.status !== "running").length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className="w-full space-y-4 panel-animated">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--app-fg-strong)]">Progreso de Ejecución</h3>
          <span className="text-sm text-[var(--app-muted)]">
            {completedSteps} de {totalSteps}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-[var(--app-track)]">
          <div
            className="h-2 rounded-full bg-[var(--app-accent)] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      <div className="space-y-3">
        {steps.length === 0 ? (
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] py-8 text-center text-[var(--app-muted)]">
            <p>Esperando inicio de ejecución...</p>
          </div>
        ) : (
          steps.map((step, index) => (
            <TimelineStep key={step.stepId} step={step} index={index} isLast={index === steps.length - 1} />
          ))
        )}
      </div>

      {isRunning && onAbort ? (
        <div className="flex justify-center">
          <button
            onClick={onAbort}
            className="inline-flex items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--app-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--app-danger)_85%,black)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-105"
            aria-label="Abortar la ejecución en curso"
          >
            Abortar Ejecución
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface TimelineStepProps {
  step: StepResult;
  index: number;
  isLast: boolean;
}

function TimelineStep({ step, index, isLast }: TimelineStepProps) {
  const statusConfig = {
    passed: {
      icon: CheckCircle2,
      bgColor: "bg-[color-mix(in_srgb,var(--app-success)_12%,var(--app-panel))]",
      borderColor: "border-[color-mix(in_srgb,var(--app-success)_32%,transparent)]",
      textColor: "text-[var(--app-success)]",
      badge: "✓ Pasado",
    },
    failed: {
      icon: XCircle,
      bgColor: "bg-[color-mix(in_srgb,var(--app-danger)_12%,var(--app-panel))]",
      borderColor: "border-[color-mix(in_srgb,var(--app-danger)_32%,transparent)]",
      textColor: "text-[var(--app-danger)]",
      badge: "✗ Fallido",
    },
    aborted: {
      icon: AlertCircle,
      bgColor: "bg-[var(--app-panel-strong)]",
      borderColor: "border-[var(--app-border)]",
      textColor: "text-[var(--app-muted)]",
      badge: "⊘ Abortado",
    },
    running: {
      icon: Loader,
      bgColor: "bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-panel))]",
      borderColor: "border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)]",
      textColor: "text-[var(--app-accent)]",
      badge: "▶ Ejecutando",
    },
  };

  const config = statusConfig[step.status];
  const Icon = config.icon;

  const typeLabel: Record<"given" | "when" | "then", string> = {
    given: "Dado",
    when: "Cuando",
    then: "Entonces",
  };
  const label = typeLabel[step.canonicalType];

  return (
    <div className="relative">
      <div className={`${config.bgColor} ${config.borderColor} rounded-lg border p-4 shadow-[var(--app-shadow-sm)] transition`}>
        <div className="flex items-start gap-3">
          <div className="mt-1 flex-shrink-0">
            {step.status === "running" ? (
              <Icon className="h-5 w-5 animate-spin text-[var(--app-accent)]" />
            ) : (
              <Icon className={`h-5 w-5 ${config.textColor}`} />
            )}
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-[var(--app-muted)]">
                  {label} Paso {index + 1}
                </span>
                <span className={`app-badge ${step.status === "passed" ? "app-badge-success" : ""} ${step.status === "failed" || step.status === "aborted" ? "app-badge-danger" : ""} ${step.status === "running" ? "app-badge-warning" : ""}`}>
                  {config.badge}
                </span>
              </div>
            </div>
            <p className="mb-2 text-sm font-medium text-[var(--app-fg-strong)]">{step.stepText}</p>
            <p className="mb-2 text-xs text-[var(--app-muted)]">{step.message}</p>

            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-1 text-[var(--app-muted)]">
                <Clock className="h-3 w-3" />
                <span>{step.latencyMs}ms</span>
              </div>
              <div className="text-[var(--app-muted)]">
                <span>Tokens: {step.tokens.total} (entrada: {step.tokens.input}, salida: {step.tokens.output})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isLast ? <div className="absolute left-[19px] top-full h-3 w-0.5 bg-[var(--app-border-strong)]" /> : null}
    </div>
  );
}
