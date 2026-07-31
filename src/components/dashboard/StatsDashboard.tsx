"use client";

import type { EChartsOption } from "echarts";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DashboardLoading,
  EmptyState,
  ErrorState,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  KpiCard,
  KpiGrid,
  Panel,
  StatusPill,
} from "./DashboardPrimitives";
import {
  examTypeLabels,
  fetchDashboardJson,
  moduleLabels,
  normalizePersonalStats,
  type ExamTypeFilter,
  type ModuleFilter,
  type PeriodFilter,
  type PersonalStats,
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

type Filters = {
  period: PeriodFilter;
  module: ModuleFilter;
  examType: ExamTypeFilter;
};

const initialFilters: Filters = {
  period: "all",
  module: "all",
  examType: "all",
};

function moduleLabel(key?: string) {
  if (key && key in moduleLabels) {
    return moduleLabels[key as keyof typeof moduleLabels];
  }
  return key || "Senza modulo";
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "short",
      }).format(date);
}

function chartBase(): Pick<EChartsOption, "textStyle" | "tooltip"> {
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
  };
}

function scoreTrendOption(stats: PersonalStats): EChartsOption {
  const labels = stats.trend.map((point) => shortDate(point.date));
  return {
    ...chartBase(),
    grid: { left: 42, right: 16, top: 38, bottom: 42 },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 18,
      textStyle: { color: COLORS.muted },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: COLORS.grid } },
      axisTick: { show: false },
      axisLabel: { color: COLORS.muted, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 40,
      interval: 10,
      splitLine: { lineStyle: { color: COLORS.grid } },
      axisLabel: { color: COLORS.muted },
    },
    series: [
      {
        name: "Punteggio",
        type: "line",
        smooth: 0.25,
        symbolSize: 8,
        data: stats.trend.map((point) => point.score),
        lineStyle: { width: 3, color: COLORS.petrol },
        itemStyle: { color: COLORS.lime, borderColor: COLORS.petrol, borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(183, 203, 75, 0.34)" },
              { offset: 1, color: "rgba(183, 203, 75, 0.02)" },
            ],
          },
        },
      },
      {
        name: "Soglia",
        type: "line",
        symbol: "none",
        data: stats.trend.map((point) => point.threshold),
        lineStyle: {
          width: 2,
          type: "dashed",
          color: COLORS.terracotta,
        },
      },
    ],
  };
}

function moduleOption(stats: PersonalStats): EChartsOption {
  const rows = [...stats.byModule]
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 8);
  return {
    ...chartBase(),
    grid: { left: 12, right: 28, top: 16, bottom: 18, containLabel: true },
    xAxis: {
      type: "value",
      max: 100,
      axisLabel: { formatter: "{value}%", color: COLORS.muted },
      splitLine: { lineStyle: { color: COLORS.grid } },
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => moduleLabel(row.key)),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: COLORS.petrolDark, width: 130, overflow: "truncate" },
    },
    series: [
      {
        name: "Superamento",
        type: "bar",
        barWidth: 18,
        data: rows.map((row) => Math.round((row.passRate ?? 0) * 1000) / 10),
        itemStyle: {
          color: COLORS.petrol,
          borderRadius: [0, 7, 7, 0],
        },
        label: {
          show: true,
          position: "right",
          color: COLORS.petrolDark,
          formatter: "{c}%",
        },
      },
    ],
  };
}

function subjectsOption(stats: PersonalStats): EChartsOption {
  const rows = [...stats.subjects]
    .filter((row) => row.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8)
    .reverse();
  return {
    ...chartBase(),
    grid: { left: 12, right: 28, top: 16, bottom: 18, containLabel: true },
    xAxis: {
      type: "value",
      max: 100,
      axisLabel: { formatter: "{value}%", color: COLORS.muted },
      splitLine: { lineStyle: { color: COLORS.grid } },
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: COLORS.petrolDark, width: 150, overflow: "truncate" },
    },
    series: [
      {
        name: "Accuratezza",
        type: "bar",
        barWidth: 18,
        data: rows.map((row) => ({
          value: Math.round(row.accuracy * 1000) / 10,
          itemStyle: {
            color:
              row.accuracy < 0.6
                ? COLORS.terracotta
                : row.accuracy < 0.8
                  ? COLORS.lime
                  : COLORS.petrol,
          },
        })),
        itemStyle: { borderRadius: [0, 7, 7, 0] },
        emphasis: {
          disabled: true,
        },
        label: {
          show: true,
          position: "right",
          color: COLORS.petrolDark,
          formatter: "{c}%",
        },
      },
    ],
  };
}

function answersOption(stats: PersonalStats): EChartsOption {
  const answers = stats.answerDistribution;
  return {
    ...chartBase(),
    tooltip: {
      ...chartBase().tooltip,
      trigger: "item",
    },
    legend: {
      bottom: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: COLORS.muted },
    },
    series: [
      {
        name: "Risposte",
        type: "pie",
        radius: ["55%", "76%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: {
          formatter: "{c}",
          color: COLORS.petrolDark,
          fontWeight: 700,
        },
        data: [
          {
            name: "Corrette",
            value: answers.correct,
            itemStyle: { color: COLORS.petrol },
          },
          {
            name: "Errate",
            value: answers.wrong,
            itemStyle: { color: COLORS.terracotta },
          },
          {
            name: "Omesse",
            value: answers.omitted,
            itemStyle: { color: COLORS.sand },
          },
        ],
      },
    ],
  };
}

function calendarOption(stats: PersonalStats): EChartsOption {
  const validDates = stats.activity
    .filter((point) => /^\d{4}-\d{2}-\d{2}/.test(point.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const end = validDates.at(-1)?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const endDate = new Date(`${end}T12:00:00`);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 182);
  const start = startDate.toISOString().slice(0, 10);
  const maximum = Math.max(1, ...validDates.map((point) => point.count));

  return {
    ...chartBase(),
    tooltip: { ...chartBase().tooltip, trigger: "item" },
    visualMap: {
      min: 0,
      max: maximum,
      type: "piecewise",
      orient: "horizontal",
      left: 0,
      bottom: 0,
      itemGap: 4,
      itemWidth: 14,
      itemHeight: 10,
      text: ["Più attività", "Meno"],
      textStyle: { color: COLORS.muted, fontSize: 11 },
      inRange: {
        color: ["#eee9d9", "#d8df9c", "#9eb65a", COLORS.petrol],
      },
    },
    calendar: {
      top: 20,
      left: 34,
      right: 12,
      bottom: 48,
      range: [start, end],
      cellSize: ["auto", 14],
      splitLine: { show: false },
      itemStyle: {
        borderWidth: 3,
        borderColor: COLORS.ivory,
        color: "#eee9d9",
      },
      dayLabel: {
        firstDay: 1,
        nameMap: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
        color: COLORS.muted,
        fontSize: 10,
      },
      monthLabel: {
        nameMap: [
          "Gen",
          "Feb",
          "Mar",
          "Apr",
          "Mag",
          "Giu",
          "Lug",
          "Ago",
          "Set",
          "Ott",
          "Nov",
          "Dic",
        ],
        color: COLORS.muted,
      },
      yearLabel: { show: false },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: validDates.map((point) => [point.date.slice(0, 10), point.count]),
      },
    ],
  };
}

export function StatsDashboard() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(
    async (signal?: AbortSignal, retainData = false) => {
      if (retainData) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters.period !== "all") params.set("period", filters.period);
      if (filters.module !== "all") params.set("module", filters.module);
      if (filters.examType !== "all") {
        params.set("examType", filters.examType);
      }

      try {
        const payload = await fetchDashboardJson(
          `/api/stats/me${params.size ? `?${params.toString()}` : ""}`,
          { signal },
        );
        setStats(normalizePersonalStats(payload));
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Non è stato possibile caricare le statistiche.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    const requestId = window.setTimeout(() => {
      void loadStats(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(requestId);
      controller.abort();
    };
  }, [loadStats]);

  const trendOption = useMemo(
    () => (stats ? scoreTrendOption(stats) : {}),
    [stats],
  );
  const modulesOption = useMemo(
    () => (stats ? moduleOption(stats) : {}),
    [stats],
  );
  const subjectOption = useMemo(
    () => (stats ? subjectsOption(stats) : {}),
    [stats],
  );
  const answerOption = useMemo(
    () => (stats ? answersOption(stats) : {}),
    [stats],
  );
  const activityOption = useMemo(
    () => (stats ? calendarOption(stats) : {}),
    [stats],
  );

  return (
    <div className={`${styles.pageShell} ${styles.personalStatsPage}`}>
      <header className={styles.personalHeader}>
        <div>
          <span className="eyebrow">Statistiche personali</span>
          <h1 className={`font-editorial ${styles.personalTitle}`}>
            I numeri del tuo <em>percorso.</em>
          </h1>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void loadStats(undefined, true)}
          disabled={refreshing}
        >
          {refreshing ? "Aggiorno…" : "Aggiorna"}
        </button>
      </header>

      <section className={styles.filterBar} aria-label="Filtri statistiche">
        <CustomSelect
          className={styles.fieldCompact}
          variant="compact"
          label="Periodo"
          value={filters.period}
          onValueChange={(period) =>
            setFilters((current) => ({
              ...current,
              period: period as PeriodFilter,
            }))
          }
          options={[
            { value: "all", label: "Tutto lo storico" },
            { value: "30d", label: "Ultimi 30 giorni" },
            { value: "90d", label: "Ultimi 90 giorni" },
            { value: "1y", label: "Ultimi 12 mesi" },
          ]}
        />
        <CustomSelect
          className={styles.fieldCompact}
          variant="compact"
          label="Modulo"
          value={filters.module}
          onValueChange={(module) =>
            setFilters((current) => ({
              ...current,
              module: module as ModuleFilter,
            }))
          }
          options={[
            { value: "all", label: "Tutti i moduli" },
            ...Object.entries(moduleLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <CustomSelect
          className={styles.fieldCompact}
          variant="compact"
          label="Tipo prova"
          value={filters.examType}
          onValueChange={(examType) =>
            setFilters((current) => ({
              ...current,
              examType: examType as ExamTypeFilter,
            }))
          }
          options={[
            { value: "all", label: "Iniziale e aggiornamento" },
            ...Object.entries(examTypeLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <div className={styles.filterEnd}>
          <span className={styles.sampleLabel}>
            {formatNumber(stats?.sampleSize ?? 0)} esami nel campione
          </span>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setFilters(initialFilters)}
            disabled={
              filters.period === "all" &&
              filters.module === "all" &&
              filters.examType === "all"
            }
          >
            Azzera filtri
          </button>
        </div>
      </section>

      {loading ? <DashboardLoading label="Calcolo le tue statistiche…" /> : null}
      {error && !loading ? (
        <ErrorState
          title="Statistiche non disponibili"
          description={error}
          onRetry={() => void loadStats()}
        />
      ) : null}

      {stats && !loading && !error ? (
        <>
          <KpiGrid>
            <KpiCard
              label="Esami completati"
              value={formatNumber(stats.summary.completed)}
              detail={`${formatNumber(stats.summary.passed)} superati`}
              badge={`n=${formatNumber(stats.sampleSize)}`}
            />
            <KpiCard
              label="Tasso di superamento"
              value={formatPercent(stats.summary.passRate, 1)}
              detail={
                stats.summary.recentDelta === null
                  ? "Servono almeno 10 prove per il confronto"
                  : `${stats.summary.recentDelta >= 0 ? "+" : ""}${formatNumber(
                      stats.summary.recentDelta,
                      1,
                    )} punti: ultime 5 vs precedenti`
              }
              tone={stats.summary.passRate >= 0.8 ? "positive" : "default"}
            />
            <KpiCard
              label="Punteggio medio"
              value={`${formatNumber(stats.summary.averageScore, 1)} / 40`}
              detail={`Ultimo ${formatNumber(stats.summary.latestScore, 1)} · margine medio ${stats.summary.averageMargin >= 0 ? "+" : ""}${formatNumber(stats.summary.averageMargin, 1)}`}
              tone="accent"
            />
            <KpiCard
              label="Miglior punteggio"
              value={`${formatNumber(stats.summary.bestScore, 1)} / 40`}
              detail="Migliore risultato nel campione filtrato"
              tone="positive"
            />
            <KpiCard
              label="Tempo medio"
              value={formatDuration(stats.summary.averageActiveSeconds)}
              detail={`${formatDuration(stats.summary.totalActiveSeconds)} di esercizio attivo`}
            />
            <KpiCard
              label="Copertura banca"
              value={formatPercent(stats.summary.coverageRate, 1)}
              detail={`${formatNumber(stats.summary.coveredQuestions)} di ${formatNumber(stats.summary.availableQuestions)} domande incontrate`}
              tone="warning"
            />
          </KpiGrid>

          {stats.sampleSize === 0 ? (
            <Panel>
              <EmptyState
                title="Nessun esame in questo intervallo"
                description="Modifica i filtri oppure completa un quiz: le statistiche compariranno qui automaticamente."
              />
            </Panel>
          ) : (
            <>
              <div className={styles.twoColumnWide}>
                <Panel
                  eyebrow="Andamento"
                  title="Punteggio nel tempo"
                  description="La soglia segue il tipo di prova svolta; i punteggi sono su 40."
                >
                  {stats.trend.length ? (
                    <EcoChart
                      option={trendOption}
                      ariaLabel="Grafico dei punteggi nel tempo confrontati con la soglia di superamento"
                      height={340}
                    />
                  ) : (
                    <EmptyState
                      compact
                      title="Trend non disponibile"
                      description="Servono almeno due prove nel campione."
                    />
                  )}
                </Panel>
                <Panel
                  eyebrow="Confronto"
                  title="Superamento per modulo"
                  description="Percentuale di prove superate, con numerosità disponibile nei dettagli."
                >
                  {stats.byModule.length ? (
                    <EcoChart
                      option={modulesOption}
                      ariaLabel="Grafico del tasso di superamento suddiviso per modulo"
                      height={340}
                    />
                  ) : (
                    <EmptyState
                      compact
                      title="Nessun confronto disponibile"
                      description="Completa prove in più moduli per confrontarle."
                    />
                  )}
                </Panel>
              </div>

              <div className={styles.twoColumnEqual}>
                <Panel
                  eyebrow="Qualità"
                  title="Distribuzione delle risposte"
                  description="Corrette, errate e omesse in tutti gli esami filtrati."
                >
                  <EcoChart
                    option={answerOption}
                    ariaLabel={`Distribuzione risposte: ${stats.answerDistribution.correct} corrette, ${stats.answerDistribution.wrong} errate e ${stats.answerDistribution.omitted} omesse`}
                    height={300}
                  />
                </Panel>
                <Panel
                  eyebrow="Continuità"
                  title="Calendario attività"
                  description="Ogni cella rappresenta il numero di quiz completati in un giorno."
                >
                  {stats.activity.length ? (
                    <EcoChart
                      option={activityOption}
                      ariaLabel="Mappa di calore dell'attività giornaliera degli ultimi sei mesi disponibili"
                      height={300}
                    />
                  ) : (
                    <EmptyState
                      compact
                      title="Attività non disponibile"
                      description="Il calendario si popola completando i quiz."
                    />
                  )}
                </Panel>
              </div>

              <Panel
                eyebrow="Diagnostica"
                title="Accuratezza per materia"
                description="Le materie meno solide sono in alto. Il colore segnala fasce descrittive, non un giudizio di preparazione."
              >
                {stats.subjects.length ? (
                  <EcoChart
                    option={subjectOption}
                    ariaLabel="Grafico dell'accuratezza delle risposte per materia"
                    height={Math.max(320, Math.min(520, stats.subjects.length * 48))}
                  />
                ) : (
                  <EmptyState
                    compact
                    title="Materie non disponibili"
                    description="I dati appariranno dopo il primo esame completato."
                  />
                )}
              </Panel>

              <div className={styles.twoColumnEqual}>
                <Panel
                  eyebrow="Priorità"
                  title="Argomenti da rinforzare"
                  description="Ordinati per accuratezza; il campione evita letture troppo sicure."
                >
                  {stats.weakTopics.length ? (
                    <ol className={styles.rankedList}>
                      {stats.weakTopics.slice(0, 6).map((topic, index) => (
                        <li key={`${topic.label}-${index}`}>
                          <span className={styles.rank}>{index + 1}</span>
                          <div>
                            <strong>{topic.label}</strong>
                            <span>
                              {moduleLabel(topic.module)} · n=
                              {formatNumber(topic.attempts)}
                            </span>
                          </div>
                          <StatusPill
                            tone={topic.accuracy < 0.6 ? "danger" : "warning"}
                          >
                            {formatPercent(topic.accuracy, 1)}
                          </StatusPill>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <EmptyState
                      compact
                      title="Nessuna priorità calcolabile"
                      description="Servono più risposte per individuare pattern affidabili."
                    />
                  )}
                </Panel>

                <Panel
                  eyebrow="Ripasso"
                  title="Allenamento mirato"
                  description="Le risposte in ripasso restano separate dai risultati d'esame."
                >
                  <div className={styles.reviewGrid}>
                    <div>
                      <span>Risposte</span>
                      <strong>{formatNumber(stats.review.answers)}</strong>
                    </div>
                    <div>
                      <span>Accuratezza</span>
                      <strong>{formatPercent(stats.review.accuracy, 1)}</strong>
                    </div>
                    <div>
                      <span>Domande riviste</span>
                      <strong>
                        {formatNumber(stats.review.questionsReviewed)}
                      </strong>
                    </div>
                  </div>
                  <p className={styles.supportingText}>
                    Ultima attività: {formatDate(stats.review.lastActivityAt, true)}
                  </p>
                  <a className={styles.primaryButton} href="/ripasso">
                    Apri il ripasso guidato
                  </a>
                </Panel>
              </div>

              <Panel
                eyebrow="Dettaglio personale"
                title="Domande più sbagliate"
                description="Le priorità derivano esclusivamente dai tuoi esami completati."
              >
                {stats.mostMissed.length ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th scope="col">ID ministeriale</th>
                          <th scope="col">Materia</th>
                          <th scope="col">Modulo</th>
                          <th scope="col">Errori</th>
                          <th scope="col">Campione</th>
                          <th scope="col">Accuratezza</th>
                          <th scope="col">Tempo medio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.mostMissed.slice(0, 12).map((question) => (
                          <tr
                            key={`${question.questionId}-${question.module ?? ""}`}
                          >
                            <td data-label="ID ministeriale">
                              <strong>{question.questionId}</strong>
                            </td>
                            <td data-label="Materia">{question.subject}</td>
                            <td data-label="Modulo">
                              {moduleLabel(question.module)}
                            </td>
                            <td data-label="Errori">
                              {formatNumber(question.misses)}
                            </td>
                            <td data-label="Campione">
                              n={formatNumber(question.attempts)}
                            </td>
                            <td data-label="Accuratezza">
                              <StatusPill
                                tone={
                                  question.accuracy < 0.5 ? "danger" : "warning"
                                }
                              >
                                {formatPercent(question.accuracy, 1)}
                              </StatusPill>
                            </td>
                            <td data-label="Tempo medio">
                              {formatDuration(question.averageTimeSeconds)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="Nessun errore da mostrare"
                    description="Ottimo segnale, oppure il campione è ancora troppo piccolo."
                  />
                )}
              </Panel>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
