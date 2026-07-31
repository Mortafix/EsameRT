"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CustomSelect } from "@/components/ui/custom-select";
import { api, ApiError } from "@/lib/client/api";
import { cn, formatDate, formatDuration, formatScore } from "@/lib/utils";
import styles from "./history-view.module.css";

type HistoryAttempt = {
  id: string;
  module: string;
  examType: "initial" | "update";
  status: "completed" | "expired";
  score: number;
  threshold: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  omittedCount: number;
  activeSeconds: number;
  completedAt: string;
};

type HistoryPayload = {
  items: HistoryAttempt[];
  total: number;
  nextBefore?: string;
};

const moduleLabels: Record<string, string> = {
  general: "Modulo generale",
  cat145: "Categorie 1 · 4 · 5",
  cat8: "Categoria 8",
  cat9: "Categoria 9",
  cat10: "Categoria 10",
};

export function HistoryView() {
  const [items, setItems] = useState<HistoryAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [module, setModule] = useState("all");
  const [examType, setExamType] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<HistoryAttempt | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const archive: HistoryAttempt[] = [];
      const seenCursors = new Set<string>();
      let before: string | undefined;

      for (let page = 0; page < 100; page += 1) {
        const suffix = before
          ? `&before=${encodeURIComponent(before)}`
          : "";
        const payload = await api<HistoryPayload | HistoryAttempt[]>(
          `/api/history?limit=100${suffix}`,
        );
        if (Array.isArray(payload)) {
          archive.push(...payload);
          break;
        }
        archive.push(...payload.items);
        if (!payload.nextBefore || seenCursors.has(payload.nextBefore)) break;
        seenCursors.add(payload.nextBefore);
        before = payload.nextBefore;
      }

      setItems(archive);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Non è stato possibile caricare lo storico.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (module !== "all" && item.module !== module) return false;
        if (examType !== "all" && item.examType !== examType) return false;
        if (outcome === "passed" && !item.passed) return false;
        if (outcome === "failed" && item.passed) return false;
        return true;
      }),
    [examType, items, module, outcome],
  );

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/api/history/${deleteTarget.id}`, { method: "DELETE" });
      setItems((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Eliminazione non riuscita.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={cn("page-shell", styles.page)}>
      <header className={styles.header}>
        <div>
          <span className="eyebrow">Archivio personale</span>
          <h1 className="font-editorial">
            Ogni prova lascia <em>una traccia utile.</em>
          </h1>
        </div>
        <Link
          href="/statistiche"
          className="rt-button rt-button--secondary rt-button--md"
        >
          Vai alle statistiche <ArrowRight size={17} aria-hidden />
        </Link>
      </header>

      <Card className={styles.filters}>
        <SelectFilter
          label="Modulo"
          value={module}
          onChange={setModule}
          options={[
            ["all", "Tutti i moduli"],
            ["general", "Generale"],
            ["cat145", "Categorie 1 · 4 · 5"],
            ["cat8", "Categoria 8"],
            ["cat9", "Categoria 9"],
            ["cat10", "Categoria 10"],
          ]}
        />
        <SelectFilter
          label="Verifica"
          value={examType}
          onChange={setExamType}
          options={[
            ["all", "Iniziale e aggiornamento"],
            ["initial", "Verifica iniziale"],
            ["update", "Aggiornamento"],
          ]}
        />
        <SelectFilter
          label="Esito"
          value={outcome}
          onChange={setOutcome}
          options={[
            ["all", "Tutti gli esiti"],
            ["passed", "Superate"],
            ["failed", "Non superate"],
          ]}
        />
      </Card>

      <div className={styles.listHeader}>
        <span>
          {filtered.length} {filtered.length === 1 ? "prova" : "prove"}
        </span>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <XCircle size={18} aria-hidden />
          {error}
          <Button variant="ghost" size="sm" onClick={load}>
            Riprova
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className={styles.loading}>
          <LoaderCircle size={26} aria-hidden />
          Carico il tuo archivio…
        </div>
      ) : filtered.length ? (
        <div className={styles.list}>
          {filtered.map((item) => (
            <Card key={item.id} className={styles.item}>
              <div className={styles.status} data-passed={item.passed}>
                {item.passed ? (
                  <CheckCircle2 size={20} aria-hidden />
                ) : (
                  <XCircle size={20} aria-hidden />
                )}
              </div>
              <div className={styles.itemMain}>
                <div className={styles.itemTags}>
                  <Badge tone={item.passed ? "success" : "clay"}>
                    {item.passed ? "Superata" : "Non superata"}
                  </Badge>
                  <Badge>
                    {item.examType === "update"
                      ? "Aggiornamento"
                      : "Iniziale"}
                  </Badge>
                </div>
                <h2 className="font-editorial">
                  {moduleLabels[item.module] ?? item.module}
                </h2>
                <div className={styles.itemMeta}>
                  <span>
                    <CalendarDays size={14} aria-hidden />
                    {formatDate(item.completedAt)}
                  </span>
                  <span>
                    <Clock3 size={14} aria-hidden />
                    {formatDuration(item.activeSeconds)}
                  </span>
                  <span>
                    {item.correctCount} corrette · {item.wrongCount} errate ·{" "}
                    {item.omittedCount} omesse
                  </span>
                </div>
              </div>
              <div className={styles.itemScore}>
                <span>Punteggio</span>
                <strong className="font-editorial">
                  {formatScore(item.score)}
                </strong>
                <small>soglia {formatScore(item.threshold)}</small>
              </div>
              <div className={styles.itemActions}>
                <Link
                  href={`/quiz/${item.id}/risultato`}
                  className="rt-button rt-button--secondary rt-button--sm"
                >
                  Dettaglio <ArrowRight size={15} aria-hidden />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget(item)}
                  aria-label={`Elimina prova ${moduleLabels[item.module]}`}
                >
                  <Trash2 size={17} aria-hidden />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className={styles.empty}>
          <CalendarDays size={30} aria-hidden />
          <h2 className="font-editorial">Nessuna prova con questi filtri.</h2>
          <p>Modifica i filtri oppure inizia una nuova simulazione.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setModule("all");
              setExamType("all");
              setOutcome("all");
            }}
          >
            Azzera filtri
          </Button>
        </Card>
      )}

      <Dialog.Root
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialog}>
            <Dialog.Close className={styles.dialogClose} aria-label="Chiudi">
              <X size={18} />
            </Dialog.Close>
            <span className={styles.deleteIcon}>
              <Trash2 size={22} aria-hidden />
            </span>
            <Dialog.Title className="font-editorial">
              Eliminare questa prova?
            </Dialog.Title>
            <Dialog.Description>
              Verranno rimossi risultato e risposte. Statistiche e ripasso
              saranno ricalcolati senza questa simulazione.
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <Dialog.Close asChild>
                <Button variant="secondary">Annulla</Button>
              </Dialog.Close>
              <Button variant="danger" loading={deleting} onClick={remove}>
                Elimina definitivamente
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<readonly [string, string]>;
}) {
  return (
    <CustomSelect
      className={styles.select}
      variant="floating"
      label={label}
      value={value}
      onValueChange={onChange}
      options={options.map(([optionValue, optionLabel]) => ({
        value: optionValue,
        label: optionLabel,
      }))}
    />
  );
}
