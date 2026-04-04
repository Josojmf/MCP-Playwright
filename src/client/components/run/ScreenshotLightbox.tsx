import { Dialog, DialogClose, DialogHeader, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScreenshotLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  screenshotUrl: string;
}

export function ScreenshotLightbox({ open, onOpenChange, title, screenshotUrl }: ScreenshotLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Backdrop
          data-slot="dialog-overlay"
          className="fixed inset-0 isolate z-50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          style={{ background: "rgba(0,0,0,0.55)" }}
        />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none duration-100",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
          style={{
            maxWidth: "90vw",
            maxHeight: "90vh",
            width: "90vw",
            padding: "20px",
            border: "1px solid var(--app-border-strong)",
            borderRadius: "6px",
            background: "var(--app-panel-strong)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <DialogHeader className="flex-row items-center justify-between gap-2">
            <DialogTitle className="text-base leading-tight font-semibold tracking-[-0.01em] text-[var(--app-fg-strong)]">
              {title}
            </DialogTitle>
            <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Cerrar" />}>
              <XIcon />
              <span className="sr-only">Cerrar</span>
            </DialogClose>
          </DialogHeader>
          <img
            src={screenshotUrl}
            alt={title}
            style={{
              maxWidth: "100%",
              maxHeight: "calc(90vh - 80px)",
              objectFit: "contain",
              display: "block",
            }}
          />
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
