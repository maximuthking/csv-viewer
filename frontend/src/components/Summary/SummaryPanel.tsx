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
  { key: "total_rows", label: "Total rows" },
  { key: "non_null_count", label: "Non-null count" },
  { key: "null_count", label: "Null count" },
  { key: "distinct_count", label: "Distinct count" },
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

  const orderedRows = useMemo(() => {
    if (schema.length === 0) {
      return filtered;
    }
    const allowed = new Set(filtered.map((item) => item.column));
    return schema
      .filter((column) => allowed.has(column.name))
      .map((column) => summaryMap.get(column.name))
      .filter((item): item is SummaryResponse["summaries"][number] => Boolean(item));
  }, [filtered, schema, summaryMap]);

  const rowsToRender = schema.length > 0 ? orderedRows : filtered;
  const hasData = rowsToRender.length > 0;

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Summary Statistics</h2>
          <p className={styles.subtitle}>
            Inspect distribution per column. Filter results to focus on key metrics.
          </p>
        </div>
        <div className={styles.actions}>
          <input
            className={styles.search}
            placeholder="Filter columns..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                {METRICS.map((metric) => (
                  <th key={metric.key}>{metric.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsToRender.map((item) => (
                <tr key={item.column}>
                  <td>{item.column}</td>
                  <td>{item.dtype}</td>
                  {METRICS.map((metric) => (
                    <td key={metric.key}>{formatValue((item as Record<string, unknown>)[metric.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
