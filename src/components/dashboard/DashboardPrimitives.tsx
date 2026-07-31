"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";

import styles from "./dashboard.module.css";

export function DashboardHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        {description ? (
          <p className={styles.heroDescription}>{description}</p>
        ) : null}
        {meta ? <div className={styles.heroMeta}>{meta}</div> : null}
      </div>
      {actions ? <div className={styles.heroActions}>{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  eyebrow,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.panel} ${className ?? ""}`}>
      {title || eyebrow || description || action ? (
        <header className={styles.panelHeader}>
          <div>
            {eyebrow ? <p className={styles.panelEyebrow}>{eyebrow}</p> : null}
            {title ? <h2 className={styles.panelTitle}>{title}</h2> : null}
            {description ? (
              <p className={styles.panelDescription}>{description}</p>
            ) : null}
          </div>
          {action ? <div className={styles.panelAction}>{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className={styles.kpiGrid}>{children}</div>;
}

export function KpiCard({
  label,
  value,
  detail,
  badge,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  badge?: string;
  tone?: "default" | "positive" | "warning" | "accent";
}) {
  return (
    <article className={`${styles.kpiCard} ${styles[`kpi_${tone}`]}`}>
      <div className={styles.kpiTopline}>
        <p>{label}</p>
        {badge ? <span className={styles.metricBadge}>{badge}</span> : null}
      </div>
      <strong className={styles.kpiValue}>{value}</strong>
      {detail ? <p className={styles.kpiDetail}>{detail}</p> : null}
    </article>
  );
}

export function EmptyState({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.emptyState} ${compact ? styles.emptyCompact : ""}`}
    >
      <span className={styles.emptyMark} aria-hidden="true">
        ◌
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function DashboardLoading({ label }: { label: string }) {
  return (
    <div className={styles.loadingWrap} role="status" aria-live="polite">
      <span className={styles.loader} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className={styles.errorState} role="alert">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button type="button" className={styles.secondaryButton} onClick={onRetry}>
        Riprova
      </button>
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger" | "accent";
}) {
  return (
    <span className={`${styles.statusPill} ${styles[`pill_${tone}`]}`}>
      {children}
    </span>
  );
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  danger = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  danger?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(
      "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])",
    );
    firstFocusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`${styles.modal} ${danger ? styles.modalDanger : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className={styles.modalHeader}>
          <div>
            <p className={styles.panelEyebrow}>
              {danger ? "Azione irreversibile" : "Gestione accesso"}
            </p>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Chiudi finestra"
          >
            ×
          </button>
        </header>
        <div className={styles.modalBody}>{children}</div>
        <footer className={styles.modalFooter}>{footer}</footer>
      </div>
    </div>
  );
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number, digits = 0) {
  const normalized = value > 1 ? value / 100 : value;
  return new Intl.NumberFormat("it-IT", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(normalized);
}

export function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0 min";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
}

export function formatDate(value?: string | null, includeTime = false) {
  if (!value) return "Mai";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit" }
      : undefined),
  }).format(parsed);
}
