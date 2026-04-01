import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ProgressState, StepEvidence } from "@/App";

interface McpColumnProps {
  mcpId: string;
  progress: ProgressState;
  steps: StepEvidence[];
  lastScreenshotId: string | null;
  onScreenshotClick: (title: string, url: string) => void;
}

function statusChipClass(status: ProgressState["status"]): string {
  if (status === "completed") return "status-success";
  if (status === "aborted") return "status-error";
  if (status === "running") return "status-running";
  return "status-idle";
}

export function McpColumn({ mcpId, progress, steps, lastScreenshotId, onScreenshotClick }: McpColumnProps) {
  const stepListRef = useRef<HTMLDivElement>(null);
  const completion = progress.totalSteps > 0
    ? Math.round((progress.completedSteps / progress.totalSteps) * 100)
    : 0;

  // stepEvidenceByMcp prepends new items (newest first), so reverse to show oldest first
  const orderedSteps = [...steps].reverse();

  useEffect(() => {
    if (stepListRef.current) {
      stepListRef.current.scrollTop = stepListRef.current.scrollHeight;
    }
  }, [steps.length]);

  return (
    <div
      style={{
        border: "1px solid var(--app-border)",
        background: "var(--app-panel)",
        borderRadius: "6px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: "320px",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <p
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--app-fg-strong)",
            letterSpacing: "-0.01em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {mcpId}
        </p>
        <span className={`status-chip ${statusChipClass(progress.status)}`}>
          {progress.status}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div
          style={{
            height: "4px",
            borderRadius: "2px",
            background: "var(--app-track)",
          }}
        >
          <div
            style={{
              height: "4px",
              borderRadius: "2px",
              background: "var(--app-accent)",
              width: `${completion}%`,
              transition: "width 300ms ease",
            }}
          />
        </div>
        <p
          style={{
            fontSize: "11px",
            color: "var(--app-muted)",
            marginTop: "4px",
          }}
        >
          {progress.completedSteps} de {progress.totalSteps} pasos
        </p>
      </div>

      {/* Screenshot area */}
      {lastScreenshotId ? (
        <button
          type="button"
          onClick={() =>
            onScreenshotClick(
              `${mcpId} \u00b7 Paso ${steps.length}`,
              `/api/screenshots/${encodeURIComponent(lastScreenshotId)}`
            )
          }
          style={{
            height: "168px",
            width: "100%",
            border: "1px solid var(--app-border)",
            borderRadius: "4px",
            overflow: "hidden",
            cursor: "pointer",
            padding: 0,
            background: "none",
            display: "block",
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--app-border-strong)";
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--app-border)";
          }}
        >
          <img
            src={`/api/screenshots/${encodeURIComponent(lastScreenshotId)}`}
            alt={`Screenshot paso ${steps.length} \u00b7 ${mcpId}`}
            style={{
              objectFit: "cover",
              width: "100%",
              height: "100%",
            }}
          />
        </button>
      ) : (
        <div
          style={{
            height: "168px",
            background: "var(--app-panel-strong)",
            border: "1px solid var(--app-border)",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--app-muted)" }}>
            Sin screenshot todav\u00eda.
          </span>
        </div>
      )}

      {/* Step list */}
      <div
        ref={stepListRef}
        style={{
          overflowY: "auto",
          maxHeight: "480px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {orderedSteps.map((step) => {
          if (step.hallucinated) {
            return (
              <div
                key={step.id}
                style={{
                  background: "color-mix(in srgb, var(--app-danger) 10%, var(--app-panel))",
                  borderLeft: "3px solid color-mix(in srgb, var(--app-danger) 30%, transparent)",
                  borderRadius: "4px",
                  padding: "8px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <XCircle style={{ width: "16px", height: "16px", color: "var(--app-danger)", flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                      color: "var(--app-danger)",
                    }}
                  >
                    [HALLUCINATED]
                  </span>
                </div>
                <p style={{ fontSize: "14px", color: "var(--app-fg)" }}>{step.stepText}</p>
                <p style={{ fontSize: "13px", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace", color: "var(--app-muted)", marginTop: "2px" }}>
                  {step.tokensUsed} tok · {step.latencyMs}ms
                </p>
              </div>
            );
          }

          if (step.needsReview) {
            return (
              <div
                key={step.id}
                style={{
                  background: "color-mix(in srgb, var(--app-warning) 10%, var(--app-panel))",
                  borderLeft: "3px solid color-mix(in srgb, var(--app-warning) 30%, transparent)",
                  borderRadius: "4px",
                  padding: "8px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <AlertTriangle style={{ width: "16px", height: "16px", color: "var(--app-warning)", flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                      color: "var(--app-warning)",
                    }}
                  >
                    [NEEDS REVIEW]
                  </span>
                </div>
                <p style={{ fontSize: "14px", color: "var(--app-fg)" }}>{step.stepText}</p>
                <p style={{ fontSize: "13px", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace", color: "var(--app-muted)", marginTop: "2px" }}>
                  {step.tokensUsed} tok · {step.latencyMs}ms
                </p>
              </div>
            );
          }

          // Normal step
          return (
            <div
              key={step.id}
              style={{
                background: "var(--app-panel)",
                border: "1px solid var(--app-border)",
                borderRadius: "4px",
                padding: "8px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
              }}
            >
              {step.status === "passed" ? (
                <CheckCircle2 style={{ width: "16px", height: "16px", color: "var(--app-success)", flexShrink: 0, marginTop: "2px" }} />
              ) : (
                <XCircle style={{ width: "16px", height: "16px", color: "var(--app-danger)", flexShrink: 0, marginTop: "2px" }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "14px", color: "var(--app-fg)" }}>{step.stepText}</p>
                <p style={{ fontSize: "13px", fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace", color: "var(--app-muted)", marginTop: "2px" }}>
                  {step.tokensUsed} tok · {step.latencyMs}ms
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
