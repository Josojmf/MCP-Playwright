import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { McpColumn } from "./McpColumn";
import { ScreenshotLightbox } from "./ScreenshotLightbox";
import type { ProgressState, StepEvidence } from "@/App";

interface LightboxState {
  open: boolean;
  title: string;
  url: string;
}

interface McpColumnGridProps {
  progressByMcp: Record<string, ProgressState>;
  stepEvidenceByMcp: Record<string, StepEvidence[]>;
  lastScreenshotByMcp: Record<string, string | null>;
  isRunning: boolean;
  onAbort: () => void;
  toolCallsByMcpAndStep?: Record<string, Record<string, Array<{
    toolId: string; toolName: string; arguments: Record<string, unknown>;
    status: "success" | "error"; latencyMs: number;
    result?: string; error?: string; screenshotId?: string;
  }>>>;
  messagesByMcpAndStep?: Record<string, Record<string, string>>;
}

export function McpColumnGrid({
  progressByMcp,
  stepEvidenceByMcp,
  lastScreenshotByMcp,
  isRunning,
  onAbort,
  toolCallsByMcpAndStep,
  messagesByMcpAndStep,
}: McpColumnGridProps) {
  const [lightbox, setLightbox] = useState<LightboxState>({ open: false, title: "", url: "" });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(Infinity);

  const mcpIds = Object.keys(progressByMcp);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleScreenshotClick = (title: string, url: string) => {
    setLightbox({ open: true, title, url });
  };

  // Use tabs when 3+ MCPs or container is narrow (< 640px)
  const useTabLayout = mcpIds.length >= 3 || containerWidth < 640;

  const gridColumns =
    mcpIds.length === 1 ? "1fr" : "1fr 1fr";

  if (mcpIds.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef}>
      {useTabLayout ? (
        <Tabs defaultValue={mcpIds[0]} className="w-full">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-[4px] border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-1">
            {mcpIds.map((mcpId) => (
              <TabsTrigger
                key={mcpId}
                value={mcpId}
                className="h-9 rounded-[4px] border border-transparent px-3 text-sm font-normal text-[var(--app-muted)] hover:bg-[var(--app-panel)] hover:text-[var(--app-fg-strong)] data-[active]:border-[var(--app-border)] data-[active]:bg-[var(--app-panel)] data-[active]:font-semibold data-[active]:text-[var(--app-fg-strong)]"
              >
                {mcpId}
              </TabsTrigger>
            ))}
          </TabsList>
          {mcpIds.map((mcpId) => (
            <TabsContent key={mcpId} value={mcpId} className="mt-2">
              <McpColumn
                mcpId={mcpId}
                progress={progressByMcp[mcpId]!}
                steps={stepEvidenceByMcp[mcpId] ?? []}
                lastScreenshotId={lastScreenshotByMcp[mcpId] ?? null}
                onScreenshotClick={handleScreenshotClick}
                toolCallsByStep={toolCallsByMcpAndStep?.[mcpId] ?? {}}
                messagesByStep={messagesByMcpAndStep?.[mcpId] ?? {}}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridColumns,
            gap: "16px",
          }}
        >
          {mcpIds.map((mcpId) => (
            <McpColumn
              key={mcpId}
              mcpId={mcpId}
              progress={progressByMcp[mcpId]!}
              steps={stepEvidenceByMcp[mcpId] ?? []}
              lastScreenshotId={lastScreenshotByMcp[mcpId] ?? null}
              onScreenshotClick={handleScreenshotClick}
              toolCallsByStep={toolCallsByMcpAndStep?.[mcpId] ?? {}}
              messagesByStep={messagesByMcpAndStep?.[mcpId] ?? {}}
            />
          ))}
        </div>
      )}

      {isRunning && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={onAbort}
            className="inline-flex w-full items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--app-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--app-danger)_85%,black)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-105"
          >
            Abortar Ejecución
          </button>
        </div>
      )}

      <ScreenshotLightbox
        open={lightbox.open}
        onOpenChange={(open) => setLightbox((prev) => ({ ...prev, open }))}
        title={lightbox.title}
        screenshotUrl={lightbox.url}
      />
    </div>
  );
}
