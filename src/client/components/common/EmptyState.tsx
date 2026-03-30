import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-4 py-12 text-center">
      <Icon className="mb-4 h-12 w-12 text-[var(--app-muted)]" />
      <h3 className="mb-2 text-lg font-semibold text-[var(--app-fg-strong)]">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-[var(--app-muted)]">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="app-primary-button"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
