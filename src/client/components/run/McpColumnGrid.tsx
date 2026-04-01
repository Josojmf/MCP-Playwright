import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
}

export function McpColumnGrid({
  progressByMcp,
  stepEvidenceByMcp,
  lastScreenshotByMcp,
  isRunning,
  onAbort,
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

  return (
    <div ref={containerRef}>
      {useTabLayout ? (
        <Tabs defaultValue={mcpIds[0]} className="w-full">
          <TabsList
            style={{
              background: "var(--app-panel-strong)",
              border: "1px solid var(--app-border)",
              borderRadius: "4px",
              padding: "4px",
              gap: "4px",
              height: "auto",
              width: "fit-content",
            }}
          >
            {mcpIds.map((mcpId) => (
              <TabsTrigger
                key={mcpId}
                value={mcpId}
                style={{
                  height: "36px",
                  padding: "0 12px",
                  fontSize: "14px",
                  borderRadius: "4px",
                }}
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
            />
          ))}
        </div>
      )}

      {isRunning && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
          <Button
            variant="destructive"
            onClick={onAbort}
            style={{ width: "100%" }}
          >
            Abortar Ejecuci\u00f3n
          </Button>
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
