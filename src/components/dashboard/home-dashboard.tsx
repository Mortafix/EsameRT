"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Clock3,
  History,
  PauseCircle,
  Play,
  Target,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { normalizePersonalStats } from "@/components/dashboard/data";
import { NewSimulationLink } from "@/components/quiz/new-simulation-link";
import { api } from "@/lib/client/api";
import { formatDate, formatDuration, formatScore } from "@/lib/utils";
import styles from "./home-dashboard.module.css";

type Overview = {
  displayName?: string;
  summary?: {
    completed?: number;
    passRate?: number;
    averageScore?: number;
    bestScore?: number;
    totalActiveSeconds?: number;
  };
  recent?: Array<{
    id: string;
    module: string;
    examType: string;
    status: string;
    score?: number;
    threshold?: number;
    completedAt?: string;
  }>;
};

type OpenAttempt = {
  id: string;
  module: string;
  examType: string;
  status: "active" | "paused";
  answeredCount: number;
  remainingSeconds: number;
  updatedAt: string;
  startedAt?: string;
  questions?: Array<{ selectedOptionId: string | null }>;
};

type SessionPayload = {
  user?: {
    name?: string;
    displayName?: string;
  };
};

type HistoryPayload = {
  items?: Overview["recent"];
};

const moduleLabels: Record<string, string> = {
  general: "Modulo generale",
  cat145: "Categorie 1 · 4 · 5",
  cat8: "Categoria 8",
  cat9: "Categoria 9",
  cat10: "Categoria 10",
};

export function HomeDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [attempt, setAttempt] = useState<OpenAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    Promise.allSettled([
      api<unknown>("/api/stats/me"),
      api<{ attempt?: OpenAttempt } | OpenAttempt | null>("/api/attempts"),
      api<SessionPayload>("/api/auth/me"),
      api<HistoryPayload>("/api/history?limit=4"),
    ]).then(([statsResult, attemptResult, sessionResult, historyResult]) => {
      if (statsResult.status === "fulfilled") {
        const stats = normalizePersonalStats(statsResult.value);
        const user =
          sessionResult.status === "fulfilled"
            ? sessionResult.value.user
            : undefined;
        setOverview({
          displayName: user?.displayName ?? user?.name,
          summary: {
            completed: stats.summary.completed,
            passRate: stats.summary.passRate,
            averageScore: stats.summary.averageScore,
            bestScore: stats.summary.bestScore,
            totalActiveSeconds: stats.summary.totalActiveSeconds,
          },
          recent:
            historyResult.status === "fulfilled"
              ? historyResult.value.items
              : stats.trend
                  .slice(-4)
                  .reverse()
                  .flatMap((item) =>
                    item.id
                      ? [
                          {
                            id: item.id,
                            module: item.module ?? "",
                            examType: item.examType ?? "",
                            status: "completed",
                            score: item.score,
                            threshold: item.threshold,
                            completedAt: item.date,
                          },
                        ]
                      : [],
                  ),
        });
      }
      if (attemptResult.status === "fulfilled" && attemptResult.value) {
        const value = attemptResult.value;
        const raw =
          "attempt" in value ? (value.attempt ?? null) : (value as OpenAttempt);
        setAttempt(
          raw
            ? {
                ...raw,
                answeredCount:
                  raw.answeredCount ??
                  raw.questions?.filter(
                    (question) => question.selectedOptionId !== null,
                  ).length ??
                  0,
                updatedAt:
                  raw.updatedAt ?? raw.startedAt ?? new Date().toISOString(),
              }
            : null,
        );
      }
      setLoading(false);
    });
  }, []);

  const summary = overview?.summary ?? {};
  const displayName = overview?.displayName?.split(" ")[0] ?? "bentornato";

  async function deleteOpenAttempt() {
    if (!attempt) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/api/attempts/${attempt.id}`, { method: "DELETE" });
      localStorage.removeItem(`rtlab-pending-${attempt.id}`);
      setAttempt(null);
      setDeleteOpen(false);
    } catch {
      setDeleteError(
        "Non è stato possibile eliminare la prova. Riprova tra poco.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page-shell">
      <section className={styles.hero}>
        <div>
          <span className="eyebrow">Il tuo laboratorio</span>
          <h1 className="font-editorial">
            Ciao {displayName}, <em>da dove ripartiamo?</em>
          </h1>
        </div>
        <div className={styles.heroActions}>
          <NewSimulationLink
            className="rt-button rt-button--primary rt-button--lg"
          >
            Nuova simulazione
            <ArrowRight size={18} aria-hidden />
          </NewSimulationLink>
        </div>
      </section>

      {attempt ? (
        <Card className={styles.resumeCard}>
          <div className={styles.resumeIcon}>
            {attempt.status === "paused" ? (
              <PauseCircle size={28} aria-hidden />
            ) : (
              <Play size={28} aria-hidden />
            )}
          </div>
          <div className={styles.resumeCopy}>
            <div>
              <Badge tone="lime">
                {attempt.status === "paused" ? "In pausa" : "In corso"}
              </Badge>
              <span className={styles.resumeUpdated}>
                Salvato {formatDate(attempt.updatedAt)}
              </span>
            </div>
            <h2 className="font-editorial">
              {moduleLabels[attempt.module] ?? attempt.module}
            </h2>
            <p>
              {attempt.answeredCount} risposte su 40 ·{" "}
              {formatDuration(attempt.remainingSeconds)} rimasti
            </p>
          </div>
          <div className={styles.resumeProgress} aria-hidden>
            <span style={{ width: `${(attempt.answeredCount / 40) * 100}%` }} />
          </div>
          <div className={styles.resumeActions}>
            <Link
              href={`/quiz/${attempt.id}`}
              className="rt-button rt-button--dark rt-button--md"
            >
              Riprendi
              <ArrowRight size={17} aria-hidden />
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className={styles.deleteAttempt}
              onClick={() => {
                setDeleteError("");
                setDeleteOpen(true);
              }}
            >
              <Trash2 size={15} aria-hidden />
              Elimina
            </Button>
          </div>
        </Card>
      ) : null}

      <section className={styles.metrics} aria-label="Riepilogo personale">
        <MetricCard
          icon={Target}
          label="Prove concluse"
          value={loading ? "—" : String(summary.completed ?? 0)}
        />
        <MetricCard
          icon={Trophy}
          label="Percentuale superate"
          value={
            loading
              ? "—"
              : `${Math.round((summary.passRate ?? 0) * 100)}%`
          }
          tone="lime"
        />
        <MetricCard
          icon={BarChart3}
          label="Punteggio medio"
          value={loading ? "—" : formatScore(summary.averageScore ?? 0)}
        />
        <MetricCard
          icon={Clock3}
          label="Tempo in prova"
          value={
            loading ? "—" : formatDuration(summary.totalActiveSeconds ?? 0)
          }
          tone="clay"
        />
      </section>

      <section className={styles.lowerGrid}>
        <Card className={styles.recentCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className="eyebrow">Ultimi risultati</span>
              <h2 className="font-editorial">Le prove più recenti</h2>
            </div>
            <Link href="/storico">
              Vedi storico <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
          <div className={styles.recentList}>
            {(overview?.recent ?? []).slice(0, 4).map((item) => (
              <Link
                key={item.id}
                href={`/quiz/${item.id}/risultato`}
                className={styles.recentItem}
              >
                <span className={styles.recentModule}>
                  <History size={17} aria-hidden />
                  <span>
                    <strong>{moduleLabels[item.module] ?? item.module}</strong>
                    <small>
                      {item.examType === "update"
                        ? "Aggiornamento"
                        : "Verifica iniziale"}
                    </small>
                  </span>
                </span>
                <span
                  className={
                    (item.score ?? 0) >= (item.threshold ?? Infinity)
                      ? styles.scorePass
                      : styles.scoreFail
                  }
                >
                  {formatScore(item.score ?? 0)}
                </span>
              </Link>
            ))}
            {!loading && (overview?.recent?.length ?? 0) === 0 ? (
              <div className={styles.noRecent}>
                Qui compariranno i tuoi risultati. La prima prova è un ottimo
                punto zero.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className={styles.coachCard}>
          <h2 className="font-editorial">Non studiare tutto allo stesso modo.</h2>
          <p>
            Il ripasso ordina le domande per numero di errori e ti restituisce
            subito la risposta ufficiale.
          </p>
          <Link
            href="/ripasso"
            className="rt-button rt-button--secondary rt-button--md"
          >
            Apri il ripasso
            <ArrowRight size={17} aria-hidden />
          </Link>
        </Card>
      </section>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialog}>
            <Dialog.Close className={styles.dialogClose} aria-label="Chiudi">
              <X size={19} />
            </Dialog.Close>
            <span className={styles.deleteIcon}>
              <Trash2 size={23} aria-hidden />
            </span>
            <Dialog.Title className="font-editorial">
              Eliminare la prova aperta?
            </Dialog.Title>
            <Dialog.Description>
              Risposte e tempo salvato saranno cancellati definitivamente. Potrai
              poi iniziare subito una nuova simulazione.
            </Dialog.Description>
            {deleteError ? (
              <p className={styles.dialogError} role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <Dialog.Close asChild>
                <Button variant="secondary">Annulla</Button>
              </Dialog.Close>
              <Button
                variant="danger"
                loading={deleting}
                onClick={deleteOpenAttempt}
              >
                Elimina definitivamente
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  tone?: "lime" | "clay";
}) {
  return (
    <Card className={styles.metricCard} data-tone={tone}>
      <Icon size={19} aria-hidden />
      <span>{label}</span>
      <strong className="font-editorial">{value}</strong>
    </Card>
  );
}
