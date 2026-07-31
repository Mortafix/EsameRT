"use client";

import type { EChartsOption } from "echarts";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  DashboardHeader,
  DashboardLoading,
  EmptyState,
  ErrorState,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  KpiCard,
  KpiGrid,
  Modal,
  Panel,
  StatusPill,
} from "./DashboardPrimitives";
import {
  fetchDashboardJson,
  moduleLabels,
  normalizeAdminStats,
  type AdminStats,
  type AdminUser,
} from "./data";
import { EcoChart } from "./EcoChart";
import { CustomSelect } from "@/components/ui/custom-select";
import styles from "./dashboard.module.css";

const COLORS = {
  petrol: "#164f49",
  petrolDark: "#0f3835",
  lime: "#b7cb4b",
  terracotta: "#c66a4d",
  sand: "#d8ccb0",
  ivory: "#fbf8ef",
  muted: "#74817a",
  grid: "rgba(24, 63, 58, 0.12)",
};

type AdminPeriod = "7d" | "30d" | "90d" | "1y" | "all";
type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; user: AdminUser }
  | { mode: "reveal"; user: AdminUser }
  | { mode: "code"; user: AdminUser }
  | { mode: "revoke"; user: AdminUser }
  | { mode: "toggle"; user: AdminUser }
  | { mode: "delete"; user: AdminUser };

type UserForm = {
  name: string;
  code: string;
  role: "user" | "admin";
  notes: string;
};

const emptyUserForm: UserForm = {
  name: "",
  code: "",
  role: "user",
  notes: "",
};

function moduleLabel(key: string) {
  return key in moduleLabels
    ? moduleLabels[key as keyof typeof moduleLabels]
    : key || "Senza modulo";
}

function shortDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "short",
      }).format(parsed);
}

function activityOption(stats: AdminStats): EChartsOption {
  return {
    textStyle: {
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      color: COLORS.petrolDark,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: COLORS.petrolDark,
      borderWidth: 0,
      textStyle: { color: COLORS.ivory },
      padding: [10, 12],
    },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 18,
      textStyle: { color: COLORS.muted },
    },
    grid: { left: 44, right: 18, top: 40, bottom: 40 },
    xAxis: {
      type: "category",
      data: stats.trend.map((point) => shortDate(point.date)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: COLORS.grid } },
      axisLabel: { hideOverlap: true, color: COLORS.muted },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: COLORS.grid } },
      axisLabel: { color: COLORS.muted },
    },
    series: [
      {
        name: "Accessi",
        type: "line",
        smooth: 0.25,
        symbolSize: 7,
        data: stats.trend.map((point) => point.logins),
        lineStyle: { color: COLORS.petrol, width: 3 },
        itemStyle: { color: COLORS.lime, borderColor: COLORS.petrol, borderWidth: 2 },
      },
      {
        name: "Quiz conclusi",
        type: "bar",
        barMaxWidth: 18,
        data: stats.trend.map((point) => point.attempts),
        itemStyle: {
          color: "rgba(198, 106, 77, 0.65)",
          borderRadius: [5, 5, 0, 0],
        },
      },
    ],
  };
}

function usageOption(stats: AdminStats): EChartsOption {
  const rows = [...stats.byModule]
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 8);
  return {
    textStyle: {
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      color: COLORS.petrolDark,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: COLORS.petrolDark,
      borderWidth: 0,
      textStyle: { color: COLORS.ivory },
    },
    grid: { left: 10, right: 40, top: 16, bottom: 18, containLabel: true },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: COLORS.grid } },
      axisLabel: { color: COLORS.muted },
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => moduleLabel(row.key)),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: COLORS.petrolDark, width: 140, overflow: "truncate" },
    },
    series: [
      {
        name: "Quiz",
        type: "bar",
        barWidth: 20,
        data: rows.map((row) => row.attempts),
        itemStyle: {
          color: COLORS.petrol,
          borderRadius: [0, 7, 7, 0],
        },
        label: {
          show: true,
          position: "right",
          color: COLORS.petrolDark,
        },
      },
    ],
  };
}

function extractRevealedCode(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const outer = payload as Record<string, unknown>;
  const data =
    outer.data && typeof outer.data === "object"
      ? (outer.data as Record<string, unknown>)
      : outer;
  return typeof data.code === "string" ? data.code : "";
}

export function AdminDashboard() {
  const [period, setPeriod] = useState<AdminPeriod>("30d");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "admin">("all");
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [form, setForm] = useState<UserForm>(emptyUserForm);
  const [adminCode, setAdminCode] = useState("");
  const [revealedCode, setRevealedCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  const loadData = useCallback(
    async (signal?: AbortSignal, retainData = false) => {
      if (retainData) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (period !== "all") params.set("period", period);

      try {
        const [statsPayload, usersPayload] = await Promise.all([
          fetchDashboardJson(
            `/api/admin/stats${params.size ? `?${params.toString()}` : ""}`,
            { signal },
          ),
          fetchDashboardJson("/api/admin/users", { signal }),
        ]);
        const normalized = normalizeAdminStats(statsPayload);
        const normalizedUsers = normalizeAdminStats(usersPayload).users;
        setStats({ ...normalized, users: normalizedUsers });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Non è stato possibile caricare il pannello.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period],
  );

  useEffect(() => {
    const controller = new AbortController();
    const requestId = window.setTimeout(() => {
      void loadData(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(requestId);
      controller.abort();
    };
  }, [loadData]);

  const users = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("it-IT");
    return (stats?.users ?? []).filter((user) => {
      const matchesSearch =
        !query ||
        user.label.toLocaleLowerCase("it-IT").includes(query) ||
        user.notes.toLocaleLowerCase("it-IT").includes(query) ||
        user.codeHint.toLocaleLowerCase("it-IT").includes(query);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? user.active : !user.active);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [roleFilter, search, stats?.users, statusFilter]);

  const activityChart = useMemo(
    () => (stats ? activityOption(stats) : {}),
    [stats],
  );
  const usageChart = useMemo(
    () => (stats ? usageOption(stats) : {}),
    [stats],
  );

  const closeDialog = () => {
    if (mutationPending) return;
    setDialog({ mode: "closed" });
    setMutationError(null);
    setRevealedCode("");
    setAdminCode("");
    setConfirmation("");
    setCopyStatus("");
  };

  const openCreate = () => {
    setForm(emptyUserForm);
    setMutationError(null);
    setDialog({ mode: "create" });
  };

  const openEdit = (user: AdminUser) => {
    setForm({
      name: user.label,
      code: "",
      role: user.role,
      notes: user.notes,
    });
    setMutationError(null);
    setDialog({ mode: "edit", user });
  };

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMutationError(null);

    const name = form.name.trim();
    if (!name) {
      setMutationError("Inserisci un nome riconoscibile.");
      return;
    }
    if (
      dialog.mode === "create" &&
      (!/^(?=.*[A-Za-z])(?=.*\d).{10,64}$/.test(form.code) ||
        form.code !== form.code.trim())
    ) {
      setMutationError(
        "Il codice deve avere 10–64 caratteri, almeno una lettera e un numero, senza spazi esterni.",
      );
      return;
    }

    setMutationPending(true);
    try {
      if (dialog.mode === "create") {
        await fetchDashboardJson("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            name,
            code: form.code,
            role: form.role,
            notes: form.notes.trim(),
          }),
        });
      } else if (dialog.mode === "edit") {
        const patch: Record<string, unknown> = {
          revision: dialog.user.revision,
        };
        if (name !== dialog.user.label) patch.name = name;
        if (form.role !== dialog.user.role) patch.role = form.role;
        if (form.notes.trim() !== dialog.user.notes) {
          patch.notes = form.notes.trim();
        }
        if (Object.keys(patch).length === 1) {
          setDialog({ mode: "closed" });
          return;
        }
        await fetchDashboardJson(`/api/admin/users/${dialog.user.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      } else {
        return;
      }
      setDialog({ mode: "closed" });
      await loadData(undefined, true);
    } catch (caught) {
      setMutationError(
        caught instanceof Error ? caught.message : "Modifica non salvata.",
      );
    } finally {
      setMutationPending(false);
    }
  };

  const toggleUser = async () => {
    if (dialog.mode !== "toggle") return;
    setMutationPending(true);
    setMutationError(null);
    try {
      await fetchDashboardJson(`/api/admin/users/${dialog.user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          revision: dialog.user.revision,
          isActive: !dialog.user.active,
        }),
      });
      setDialog({ mode: "closed" });
      await loadData(undefined, true);
    } catch (caught) {
      setMutationError(
        caught instanceof Error ? caught.message : "Stato utente non modificato.",
      );
    } finally {
      setMutationPending(false);
    }
  };

  const deleteUser = async () => {
    if (dialog.mode !== "delete") return;
    if (confirmation !== dialog.user.label) {
      setMutationError("Il nome di conferma non corrisponde.");
      return;
    }
    setMutationPending(true);
    setMutationError(null);
    try {
      await fetchDashboardJson(`/api/admin/users/${dialog.user.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          revision: dialog.user.revision,
          confirmation,
        }),
      });
      setDialog({ mode: "closed" });
      await loadData(undefined, true);
    } catch (caught) {
      setMutationError(
        caught instanceof Error ? caught.message : "Utente non eliminato.",
      );
    } finally {
      setMutationPending(false);
    }
  };

  const revealUserCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog.mode !== "reveal") return;
    setMutationPending(true);
    setMutationError(null);
    setRevealedCode("");
    try {
      const payload = await fetchDashboardJson(
        `/api/admin/users/${dialog.user.id}/code/reveal`,
        {
          method: "POST",
          body: JSON.stringify({ adminCode }),
        },
      );
      const code = extractRevealedCode(payload);
      if (!code) throw new Error("Il server non ha restituito il codice.");
      setRevealedCode(code);
      setAdminCode("");
    } catch (caught) {
      setMutationError(
        caught instanceof Error ? caught.message : "Codice non disponibile.",
      );
    } finally {
      setMutationPending(false);
    }
  };

  const changeUserCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog.mode !== "code") return;
    if (
      !/^(?=.*[A-Za-z])(?=.*\d).{10,64}$/.test(form.code) ||
      form.code !== form.code.trim()
    ) {
      setMutationError(
        "Il codice deve avere 10–64 caratteri, almeno una lettera e un numero, senza spazi esterni.",
      );
      return;
    }
    setMutationPending(true);
    setMutationError(null);
    try {
      await fetchDashboardJson(`/api/admin/users/${dialog.user.id}/code`, {
        method: "POST",
        body: JSON.stringify({
          revision: dialog.user.revision,
          code: form.code,
        }),
      });
      setDialog({ mode: "closed" });
      await loadData(undefined, true);
    } catch (caught) {
      setMutationError(
        caught instanceof Error ? caught.message : "Codice non modificato.",
      );
    } finally {
      setMutationPending(false);
    }
  };

  const revokeSessions = async () => {
    if (dialog.mode !== "revoke") return;
    setMutationPending(true);
    setMutationError(null);
    try {
      await fetchDashboardJson(
        `/api/admin/users/${dialog.user.id}/sessions/revoke`,
        { method: "POST" },
      );
      setDialog({ mode: "closed" });
      await loadData(undefined, true);
    } catch (caught) {
      setMutationError(
        caught instanceof Error ? caught.message : "Sessioni non revocate.",
      );
    } finally {
      setMutationPending(false);
    }
  };

  const copyRevealedCode = async () => {
    try {
      await navigator.clipboard.writeText(revealedCode);
      setCopyStatus("Codice copiato.");
    } catch {
      setCopyStatus("Copia non disponibile: seleziona il codice manualmente.");
    }
  };

  const activeDialogUser =
    dialog.mode === "edit" ||
    dialog.mode === "reveal" ||
    dialog.mode === "code" ||
    dialog.mode === "revoke" ||
    dialog.mode === "toggle" ||
    dialog.mode === "delete"
      ? dialog.user
      : null;

  return (
    <div className={styles.pageShell}>
      <DashboardHeader
        eyebrow="Cabina di regia"
        title="Amministrazione"
        meta={
          stats?.generatedAt ? (
            <span>Aggiornato {formatDate(stats.generatedAt, true)}</span>
          ) : (
            <span>Metriche aggregate e dati operativi</span>
          )
        }
        actions={
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void loadData(undefined, true)}
              disabled={refreshing}
            >
              {refreshing ? "Aggiorno…" : "Aggiorna"}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={openCreate}
            >
              Nuovo utente
            </button>
          </div>
        }
      />

      <section className={styles.filterBar} aria-label="Periodo pannello admin">
        <CustomSelect
          className={styles.fieldCompact}
          variant="compact"
          label="Periodo metriche"
          value={period}
          onValueChange={(value) => setPeriod(value as AdminPeriod)}
          options={[
            { value: "7d", label: "Ultimi 7 giorni" },
            { value: "30d", label: "Ultimi 30 giorni" },
            { value: "90d", label: "Ultimi 90 giorni" },
            { value: "1y", label: "Ultimi 12 mesi" },
            { value: "all", label: "Tutto lo storico" },
          ]}
        />
        <div className={styles.filterEnd}>
          <StatusPill tone="accent">Vista aggregata</StatusPill>
          <span className={styles.sampleLabel}>
            Nessun dettaglio risposta visibile
          </span>
        </div>
      </section>

      {loading ? <DashboardLoading label="Preparo il pannello admin…" /> : null}
      {error && !loading ? (
        <ErrorState
          title="Pannello non disponibile"
          description={error}
          onRetry={() => void loadData()}
        />
      ) : null}

      {stats && !loading && !error ? (
        <>
          <KpiGrid>
            <KpiCard
              label="Utenti"
              value={formatNumber(stats.summary.totalUsers)}
              detail={`${formatNumber(stats.summary.activeUsers30d)} attivi negli ultimi 30 giorni`}
              badge={`${formatNumber(stats.summary.activeUsers7d)} attivi 7g`}
            />
            <KpiCard
              label="Accessi ultimi 7 giorni"
              value={formatNumber(stats.summary.logins)}
              detail={`${formatNumber(stats.summary.activeSessions)} sessioni attive`}
              tone="accent"
            />
            <KpiCard
              label="Quiz completati"
              value={formatNumber(stats.summary.completed)}
              detail={`${formatNumber(stats.summary.started)} avviati · ${formatNumber(stats.summary.active)} attivi · ${formatNumber(stats.summary.paused)} in pausa`}
            />
            <KpiCard
              label="Tasso completamento"
              value={formatPercent(stats.summary.completionRate, 1)}
              detail={`${formatNumber(stats.summary.expired)} scaduti nel periodo`}
              tone="positive"
            />
            <KpiCard
              label="Tasso superamento"
              value={formatPercent(stats.summary.passRate, 1)}
              detail={`Punteggio medio ${formatNumber(stats.summary.averageScore, 1)} / 40`}
              tone="positive"
            />
            <KpiCard
              label="Tempo medio"
              value={formatDuration(stats.summary.averageActiveSeconds)}
              detail="Tempo attivo per prova conclusa"
            />
          </KpiGrid>

          <div className={styles.twoColumnWide}>
            <Panel
              eyebrow="Attività"
              title="Accessi e quiz conclusi"
              description="Volumi giornalieri nel periodo selezionato."
            >
              {stats.trend.length ? (
                <EcoChart
                  option={activityChart}
                  ariaLabel="Grafico giornaliero degli accessi e dei quiz conclusi"
                  height={340}
                />
              ) : (
                <EmptyState
                  compact
                  title="Nessuna attività"
                  description="Non risultano accessi o quiz nel periodo."
                />
              )}
            </Panel>

            <Panel
              eyebrow="Adozione"
              title="Quiz per modulo"
              description="Volume delle prove: utile per capire quali categorie vengono esercitate."
            >
              {stats.byModule.length ? (
                <EcoChart
                  option={usageChart}
                  ariaLabel="Grafico del numero di quiz suddiviso per modulo"
                  height={340}
                />
              ) : (
                <EmptyState
                  compact
                  title="Nessun modulo utilizzato"
                  description="Il confronto comparirà con i primi quiz."
                />
              )}
            </Panel>
          </div>

          <Panel
            eyebrow="Accessi"
            title="Utenti"
            description="Crea, modifica e revoca gli accessi. I codici restano mascherati finché non confermi la tua identità."
            action={
              <span className={styles.sampleLabel}>
                {formatNumber(users.length)} di{" "}
                {formatNumber(stats.users.length)} utenti
              </span>
            }
          >
            <div className={styles.userFilters} aria-label="Filtri utenti">
              <label className={styles.searchField}>
                <span className={styles.visuallyHidden}>Cerca utente</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cerca nome, note o codice…"
                />
              </label>
              <CustomSelect
                className={styles.fieldCompact}
                variant="compact"
                label="Stato"
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as "all" | "active" | "inactive")
                }
                options={[
                  { value: "all", label: "Tutti" },
                  { value: "active", label: "Attivi" },
                  { value: "inactive", label: "Disattivati" },
                ]}
              />
              <CustomSelect
                className={styles.fieldCompact}
                variant="compact"
                label="Ruolo"
                value={roleFilter}
                onValueChange={(value) =>
                  setRoleFilter(value as "all" | "user" | "admin")
                }
                options={[
                  { value: "all", label: "Tutti" },
                  { value: "user", label: "Utenti" },
                  { value: "admin", label: "Admin" },
                ]}
              />
            </div>

            {users.length ? (
              <div className={styles.tableWrap}>
                <table className={`${styles.dataTable} ${styles.usersTable}`}>
                  <thead>
                    <tr>
                      <th scope="col">Utente</th>
                      <th scope="col">Stato</th>
                      <th scope="col">Accessi</th>
                      <th scope="col">Ultimo login</th>
                      <th scope="col">Quiz</th>
                      <th scope="col">Media</th>
                      <th scope="col">Pass rate</th>
                      <th scope="col">
                        <span className={styles.visuallyHidden}>Azioni</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td data-label="Utente">
                          <div className={styles.userIdentity}>
                            <span className={styles.avatar} aria-hidden="true">
                              {user.label.slice(0, 2).toLocaleUpperCase("it-IT")}
                            </span>
                            <div>
                              <strong>{user.label}</strong>
                              <span>
                                {user.role === "admin" ? "Admin" : "Utente"} ·{" "}
                                {user.codeHint || "codice mascherato"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Stato">
                          <StatusPill tone={user.active ? "positive" : "danger"}>
                            {user.active ? "Attivo" : "Disattivato"}
                          </StatusPill>
                        </td>
                        <td data-label="Accessi">
                          {formatNumber(user.loginCount)}
                          {user.activeSessions > 0 ? (
                            <span className={styles.inlineNote}>
                              {user.activeSessions} sessioni
                            </span>
                          ) : null}
                        </td>
                        <td data-label="Ultimo login">
                          {formatDate(user.lastLoginAt, true)}
                        </td>
                        <td data-label="Quiz">
                          {formatNumber(user.quizCount)}
                          <span className={styles.inlineNote}>
                            {formatDuration(user.totalActiveSeconds)}
                          </span>
                        </td>
                        <td data-label="Media">
                          {user.quizCount
                            ? `${formatNumber(user.averageScore, 1)} / 40`
                            : "—"}
                        </td>
                        <td data-label="Pass rate">
                          {user.quizCount ? formatPercent(user.passRate, 1) : "—"}
                        </td>
                        <td data-label="Azioni">
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.smallButton}
                              onClick={() => openEdit(user)}
                              aria-label={`Modifica ${user.label}`}
                            >
                              Modifica
                            </button>
                            <button
                              type="button"
                              className={styles.smallButton}
                              onClick={() => {
                                setAdminCode("");
                                setRevealedCode("");
                                setMutationError(null);
                                setDialog({ mode: "reveal", user });
                              }}
                              aria-label={`Mostra codice di ${user.label}`}
                            >
                              Codice
                            </button>
                            <button
                              type="button"
                              className={styles.smallButton}
                              onClick={() => {
                                setMutationError(null);
                                setDialog({ mode: "toggle", user });
                              }}
                              aria-label={`${user.active ? "Disattiva" : "Riattiva"} ${user.label}`}
                            >
                              {user.active ? "Disattiva" : "Riattiva"}
                            </button>
                            <button
                              type="button"
                              className={`${styles.smallButton} ${styles.dangerButton}`}
                              onClick={() => {
                                setConfirmation("");
                                setMutationError(null);
                                setDialog({ mode: "delete", user });
                              }}
                              aria-label={`Elimina ${user.label}`}
                            >
                              Elimina
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                compact
                title="Nessun utente trovato"
                description="Modifica la ricerca o azzera i filtri."
              />
            )}
          </Panel>
        </>
      ) : null}

      <Modal
        open={dialog.mode === "create" || dialog.mode === "edit"}
        title={dialog.mode === "create" ? "Crea un utente" : "Modifica utente"}
        description={
          dialog.mode === "create"
            ? "Il codice personale è l’unica credenziale necessaria per accedere."
            : "Aggiorna identità, note e ruolo. Il codice non viene modificato."
        }
        onClose={closeDialog}
        footer={
          <>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeDialog}
              disabled={mutationPending}
            >
              Annulla
            </button>
            <button
              type="submit"
              form="user-editor"
              className={styles.primaryButton}
              disabled={mutationPending}
            >
              {mutationPending
                ? "Salvataggio…"
                : dialog.mode === "create"
                  ? "Crea utente"
                  : "Salva modifiche"}
            </button>
          </>
        }
      >
        <form id="user-editor" className={styles.formGrid} onSubmit={saveUser}>
          <label className={styles.field}>
            <span>Nome o etichetta</span>
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              autoComplete="off"
            />
          </label>
          {dialog.mode === "create" ? (
            <label className={styles.field}>
              <span>Codice personale</span>
              <input
                required
                type="password"
                minLength={10}
                maxLength={64}
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
                autoComplete="new-password"
                aria-describedby="code-requirements"
              />
              <small id="code-requirements">
                10–64 caratteri, almeno una lettera e un numero.
              </small>
            </label>
          ) : null}
          <CustomSelect
            className={styles.field}
            label="Ruolo"
            value={form.role}
            onValueChange={(role) =>
              setForm((current) => ({
                ...current,
                role: role as "user" | "admin",
              }))
            }
            options={[
              { value: "user", label: "Utente" },
              { value: "admin", label: "Amministratore" },
            ]}
          />
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Note interne</span>
            <textarea
              rows={4}
              maxLength={500}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Facoltative, visibili solo agli amministratori"
            />
          </label>
          {dialog.mode === "edit" ? (
            <div className={`${styles.securityActions} ${styles.fieldFull}`}>
              <div>
                <strong>Sicurezza accesso</strong>
                <span>
                  Il cambio codice e la revoca disconnettono le sessioni
                  interessate.
                </span>
              </div>
              <div>
                <button
                  type="button"
                  className={styles.smallButton}
                  onClick={() => {
                    setForm((current) => ({ ...current, code: "" }));
                    setMutationError(null);
                    setDialog({ mode: "code", user: dialog.user });
                  }}
                >
                  Cambia codice
                </button>
                <button
                  type="button"
                  className={styles.smallButton}
                  onClick={() => {
                    setMutationError(null);
                    setDialog({ mode: "revoke", user: dialog.user });
                  }}
                  disabled={dialog.user.activeSessions === 0}
                >
                  Revoca sessioni ({dialog.user.activeSessions})
                </button>
              </div>
            </div>
          ) : null}
          {mutationError ? (
            <p className={styles.formError} role="alert">
              {mutationError}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={dialog.mode === "code"}
        title={`Cambia codice di ${activeDialogUser?.label ?? "utente"}`}
        description="Il nuovo codice sostituisce subito quello precedente e revoca tutte le sessioni dell’utente."
        onClose={closeDialog}
        footer={
          <>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeDialog}
              disabled={mutationPending}
            >
              Annulla
            </button>
            <button
              type="submit"
              form="change-code"
              className={styles.primaryButton}
              disabled={mutationPending || !form.code}
            >
              {mutationPending ? "Aggiornamento…" : "Imposta nuovo codice"}
            </button>
          </>
        }
      >
        <form
          id="change-code"
          className={styles.formGrid}
          onSubmit={changeUserCode}
        >
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Nuovo codice personale</span>
            <input
              required
              type="password"
              minLength={10}
              maxLength={64}
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
              autoComplete="new-password"
            />
            <small>
              10–64 caratteri, almeno una lettera e un numero.
            </small>
          </label>
          {mutationError ? (
            <p className={styles.formError} role="alert">
              {mutationError}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={dialog.mode === "revoke"}
        title={`Revoca sessioni di ${activeDialogUser?.label ?? "utente"}`}
        description="L’utente dovrà effettuare di nuovo il login su tutti i dispositivi. Codice e storico non cambiano."
        onClose={closeDialog}
        footer={
          <>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeDialog}
              disabled={mutationPending}
            >
              Annulla
            </button>
            <button
              type="button"
              className={styles.destructiveButton}
              onClick={() => void revokeSessions()}
              disabled={mutationPending}
            >
              {mutationPending ? "Revoca…" : "Revoca tutte le sessioni"}
            </button>
          </>
        }
      >
        <p className={styles.modalNotice}>
          Sessioni attive rilevate:{" "}
          <strong>{activeDialogUser?.activeSessions ?? 0}</strong>.
        </p>
        {mutationError ? (
          <p className={styles.formError} role="alert">
            {mutationError}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={dialog.mode === "reveal"}
        title={`Codice di ${activeDialogUser?.label ?? "utente"}`}
        description="Per sicurezza è richiesta una recente ri-autenticazione. La rivelazione viene registrata nell’audit log."
        onClose={closeDialog}
        footer={
          <>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeDialog}
              disabled={mutationPending}
            >
              Chiudi
            </button>
            {!revealedCode ? (
              <button
                type="submit"
                form="reveal-code"
                className={styles.primaryButton}
                disabled={mutationPending || !adminCode}
              >
                {mutationPending ? "Verifica…" : "Rivela codice"}
              </button>
            ) : null}
          </>
        }
      >
        {revealedCode ? (
          <div className={styles.revealedCode}>
            <span>Codice personale</span>
            <div>
              <code>{revealedCode}</code>
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => void copyRevealedCode()}
              >
                Copia
              </button>
            </div>
            <p aria-live="polite">{copyStatus}</p>
          </div>
        ) : (
          <form
            id="reveal-code"
            className={styles.formGrid}
            onSubmit={revealUserCode}
          >
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Il tuo codice admin</span>
              <input
                required
                type="password"
                value={adminCode}
                onChange={(event) => setAdminCode(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {mutationError ? (
              <p className={styles.formError} role="alert">
                {mutationError}
              </p>
            ) : null}
          </form>
        )}
      </Modal>

      <Modal
        open={dialog.mode === "toggle"}
        title={`${activeDialogUser?.active ? "Disattiva" : "Riattiva"} ${activeDialogUser?.label ?? "utente"}`}
        description={
          activeDialogUser?.active
            ? "L’utente non potrà più accedere e le sue sessioni verranno revocate. Lo storico resta conservato."
            : "L’utente potrà tornare ad accedere con il suo codice personale."
        }
        onClose={closeDialog}
        footer={
          <>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeDialog}
              disabled={mutationPending}
            >
              Annulla
            </button>
            <button
              type="button"
              className={
                activeDialogUser?.active
                  ? styles.destructiveButton
                  : styles.primaryButton
              }
              onClick={() => void toggleUser()}
              disabled={mutationPending}
            >
              {mutationPending
                ? "Aggiornamento…"
                : activeDialogUser?.active
                  ? "Disattiva accesso"
                  : "Riattiva accesso"}
            </button>
          </>
        }
      >
        <p className={styles.modalNotice}>
          {activeDialogUser?.role === "admin"
            ? "Il sistema impedirà di disattivare l’ultimo amministratore."
            : "Questa azione non elimina risultati o statistiche."}
        </p>
        {mutationError ? (
          <p className={styles.formError} role="alert">
            {mutationError}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={dialog.mode === "delete"}
        title={`Elimina ${activeDialogUser?.label ?? "utente"}`}
        description="Verranno cancellati definitivamente accesso, sessioni, quiz e statistiche personali. L’operazione non è recuperabile."
        onClose={closeDialog}
        danger
        footer={
          <>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeDialog}
              disabled={mutationPending}
            >
              Annulla
            </button>
            <button
              type="button"
              className={styles.destructiveButton}
              onClick={() => void deleteUser()}
              disabled={
                mutationPending || confirmation !== activeDialogUser?.label
              }
            >
              {mutationPending ? "Eliminazione…" : "Elimina definitivamente"}
            </button>
          </>
        }
      >
        <label className={styles.field}>
          <span>
            Digita <strong>{activeDialogUser?.label}</strong> per confermare
          </span>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
        {mutationError ? (
          <p className={styles.formError} role="alert">
            {mutationError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
