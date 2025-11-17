import { useMemo, useState } from "react";
import styles from "./SummaryPanel.module.css";
import type { ColumnSchema, SummaryResponse } from "../../types/api";

type SummaryPanelProps = {
  schema: ColumnSchema[];
  summaries: SummaryResponse["summaries"];
  isLoading: boolean;
  error?: string;
  onRefresh: () => void;
};

const METRICS = [
  { key: "non_null_count", label: "Non-null" },
  { key: "null_count", label: "Null" },
  { key: "distinct_count", label: "Distinct" },
  { key: "min_value", label: "Min" },
  { key: "max_value", label: "Max" },
  { key: "mean_value", label: "Mean" },
  { key: "stddev_value", label: "Stddev" }
] as const;

export function SummaryPanel({
  schema,
  summaries,
  isLoading,
  error,
  onRefresh
}: SummaryPanelProps) {
  const [search, setSearch] = useState("");
  const [sortMetric, setSortMetric] = useState<"null_rate" | "distinct_rate" | "alpha">("alpha");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return summaries;
    }
    return summaries.filter((item) => item.column.toLowerCase().includes(keyword));
  }, [summaries, search]);

  const summaryMap = useMemo(() => {
    const map = new Map<string, SummaryResponse["summaries"][number]>();
    summaries.forEach((item) => map.set(item.column, item));
    return map;
  }, [summaries]);

  const rowsToRender = useMemo(() => {
    const allowed = new Set(filtered.map((item) => item.column));
    const base =
      schema.length > 0
        ? schema
            .map((column) => summaryMap.get(column.name))
            .filter((item): item is SummaryResponse["summaries"][number] => Boolean(item))
            .filter((item) => allowed.has(item.column))
        : filtered;

    const sorted = [...base].sort((a, b) => {
      const getRates = (item: SummaryResponse["summaries"][number]) => {
        const total = Number(item.total_rows ?? item.non_null_count ?? 0) || 0;
        const nullRate = total > 0 ? Number(item.null_count ?? 0) / total : 0;
        const distinctRate = total > 0 ? Number(item.distinct_count ?? 0) / total : 0;
        return { nullRate, distinctRate };
      };

      if (sortMetric === "alpha") {
        return sortDirection === "asc"
          ? a.column.localeCompare(b.column)
          : b.column.localeCompare(a.column);
      }

      const aRates = getRates(a);
      const bRates = getRates(b);
      const value =
        sortMetric === "null_rate"
          ? aRates.nullRate - bRates.nullRate
          : aRates.distinctRate - bRates.distinctRate;
      return sortDirection === "asc" ? value : -value;
    });

    return sorted;
  }, [filtered, schema, sortDirection, sortMetric, summaryMap]);

  const hasData = rowsToRender.length > 0;

  const handleExport = () => {
    if (!hasData) {
      return;
    }
    const header = [
      "column",
      "dtype",
      "total_rows",
      "non_null_count",
      "null_count",
      "distinct_count",
      "min_value",
      "max_value",
      "mean_value",
      "stddev_value"
    ];
    const lines = rowsToRender.map((item) =>
      header
        .map((key) => {
          const value = (item as Record<string, unknown>)[key];
          if (value == null) {
            return "";
          }
          if (typeof value === "string" && value.includes(",")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value);
        })
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    if (typeof window === "undefined") {
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `summary-${new Date().toISOString()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const formatRate = (numerator: unknown, denominator: unknown) => {
    const num = Number(numerator);
    const den = Number(denominator);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) {
      return "0%";
    }
    return `${((num / den) * 100).toFixed(1)}%`;
  };

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Summary Statistics</h2>
          <p className={styles.subtitle}>
            컬럼별 분포와 누락률을 비교하면서 이상징후를 빠르게 찾을 수 있습니다.
          </p>
        </div>
        <div className={styles.actions}>
          <input
            className={styles.search}
            placeholder="컬럼명 필터..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className={styles.sortSelect}
            value={sortMetric}
            onChange={(event) => setSortMetric(event.target.value as typeof sortMetric)}
          >
            <option value="alpha">이름 순</option>
            <option value="null_rate">누락률</option>
            <option value="distinct_rate">고유값 비율</option>
          </select>
          <button
            type="button"
            className={styles.sortDirection}
            onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
          >
            {sortDirection === "asc" ? "오름차순" : "내림차순"}
          </button>
          <button type="button" onClick={handleExport} disabled={!hasData}>
            CSV 내보내기
          </button>
          <button type="button" onClick={onRefresh} disabled={isLoading}>
            Refresh
          </button>
        </div>
      </header>
      {isLoading ? (
        <div className={styles.state}>Loading summary...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : !hasData ? (
        <div className={styles.state}>No summary data available.</div>
      ) : (
        <div className={styles.cardGrid}>
          {rowsToRender.map((item) => {
            const totalRowsValue = Number(item.total_rows ?? item.non_null_count ?? 0);
            const nullRate = formatRate(item.null_count, totalRowsValue);
            const distinctRate = formatRate(item.distinct_count, totalRowsValue);
            return (
              <article key={item.column} className={styles.card}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardTitle}>{item.column}</p>
                    <p className={styles.cardType}>{item.dtype}</p>
                  </div>
                  <div className={styles.badges}>
                    <span className={styles.badge}>null {nullRate}</span>
                    <span className={styles.badgeSecondary}>distinct {distinctRate}</span>
                  </div>
                </header>
                <dl className={styles.metrics}>
                  {METRICS.map((metric) => (
                    <div key={metric.key}>
                      <dt>{metric.label}</dt>
                      <dd>{formatValue((item as Record<string, unknown>)[metric.key])}</dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.progressRows}>
                  <div className={styles.progressRow}>
                    <span>Null ratio</span>
                    <div className={styles.progressTrack}>
                      <span
                        className={styles.progressValue}
                        style={{ width: nullRate }}
                      />
                    </div>
                  </div>
                  <div className={styles.progressRow}>
                    <span>Distinct ratio</span>
                    <div className={styles.progressTrack}>
                      <span
                        className={styles.progressValueSecondary}
                        style={{ width: distinctRate }}
                      />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "-";
    }
    if (Math.abs(value) >= 1_000_000 || Math.abs(value) < 0.001) {
      return value.toExponential(2);
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  return String(value);
}
