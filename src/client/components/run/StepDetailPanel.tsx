import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export interface ToolCallDetail {
  toolId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: "success" | "error";
  latencyMs: number;
  result?: string;
  error?: string;
  errorMessage?: string;
  screenshotId?: string;
}

interface StepDetailPanelProps {
  stepText: string;
  status: "passed" | "failed";
  latencyMs: number;
  tokensUsed: number;
  toolCalls: ToolCallDetail[];
  message?: string;
  timestamp: string;
}

export function StepDetailPanel({ stepText: _stepText, status, latencyMs, tokensUsed, toolCalls, message }: StepDetailPanelProps) {
  return (
    <div className="mt-2 rounded border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-3">
      <Tabs defaultValue="tools">
        <TabsList variant="line" className="mb-2">
          <TabsTrigger value="tools">Tools ({toolCalls.length})</TabsTrigger>
          <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
          <TabsTrigger value="timing">Timing</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="tools">
          {toolCalls.length === 0 ? (
            <p className="text-xs text-[var(--app-muted)] py-2">No tool calls recorded.</p>
          ) : (
            toolCalls.map((tc) => (
              <div key={tc.toolId} className="rounded border border-[var(--app-border)] bg-[var(--app-panel)] p-2 mb-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="chip">{tc.toolName}</span>
                  <span className={tc.status === "error" ? "app-badge app-badge-danger" : "app-badge app-badge-success"}>{tc.status}</span>
                  <span className="text-[var(--app-muted)]">{tc.latencyMs}ms</span>
                </div>
                {Object.keys(tc.arguments).length > 0 && (
                  <pre className="mt-1 text-[11px] text-[var(--app-muted)] overflow-x-auto max-h-24 overflow-y-auto">{JSON.stringify(tc.arguments, null, 2)}</pre>
                )}
                {tc.result && <p className="mt-1 text-[11px] text-[var(--app-muted)] whitespace-pre-wrap max-h-32 overflow-y-auto">{tc.result}</p>}
                {(tc.error || tc.errorMessage) && (
                  <p className="mt-1 text-[11px] text-[var(--app-danger)] whitespace-pre-wrap">{tc.errorMessage || tc.error}</p>
                )}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="reasoning">
          <div className="py-2 text-xs text-[var(--app-muted)]">
            {message ? (
              <p className="whitespace-pre-wrap">{message}</p>
            ) : (
              <p>No reasoning data available for this step.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="timing">
          {(() => {
            const toolTime = toolCalls.reduce((sum, tc) => sum + tc.latencyMs, 0);
            const llmTime = Math.max(0, latencyMs - toolTime);
            return (
              <div className="py-2 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--app-muted)]">Total step time</span>
                  <span className="font-mono text-[var(--app-fg-strong)]">{latencyMs}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--app-muted)]">Tool execution</span>
                  <span className="font-mono text-[var(--app-fg)]">{toolTime}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--app-muted)]">LLM thinking</span>
                  <span className="font-mono text-[var(--app-fg)]">{llmTime}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--app-muted)]">Tokens used</span>
                  <span className="font-mono text-[var(--app-fg)]">{tokensUsed}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--app-track)] overflow-hidden flex">
                  {latencyMs > 0 && (
                    <>
                      <div style={{ width: `${(llmTime / latencyMs) * 100}%` }} className="bg-[var(--app-accent)] h-full" title="LLM thinking" />
                      <div style={{ width: `${(toolTime / latencyMs) * 100}%` }} className="bg-[var(--app-success)] h-full" title="Tool execution" />
                    </>
                  )}
                </div>
                <div className="flex gap-4 text-[11px]">
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-[var(--app-accent)]" />LLM</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-[var(--app-success)]" />Tool</span>
                </div>
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="errors">
          <div className="py-2 text-xs">
            {status === "failed" && message ? (
              <div className="rounded border border-[color-mix(in_srgb,var(--app-danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--app-danger)_8%,var(--app-panel))] p-2 mb-2">
                <p className="font-semibold text-[var(--app-danger)] mb-1">Step failure</p>
                <pre className="text-[var(--app-danger)] whitespace-pre-wrap text-[11px]">{message}</pre>
              </div>
            ) : null}
            {toolCalls.filter(tc => tc.error || tc.errorMessage).map((tc) => (
              <div key={tc.toolId} className="rounded border border-[var(--app-border)] bg-[var(--app-panel)] p-2 mb-2">
                <p className="font-semibold text-[var(--app-fg-strong)]">{tc.toolName}</p>
                <pre className="text-[var(--app-danger)] whitespace-pre-wrap text-[11px] mt-1">{tc.errorMessage || tc.error}</pre>
              </div>
            ))}
            {status !== "failed" && toolCalls.every(tc => !tc.error && !tc.errorMessage) && (
              <p className="text-[var(--app-muted)]">No errors for this step.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
