import { useEffect, useMemo, useState } from "react";
import styles from "./ChartBuilder.module.css";
import type { ColumnSchema } from "../../types/api";
import { PlotlyChart } from "./PlotlyChart";

type ChartMetricInput = {
  agg: string;
  column?: string;
  alias: string;
};

type ChartBuilderProps = {
  schema: ColumnSchema[];
  data: Array<Record<string, unknown>>;
  isLoading: boolean;
  error?: string;
  onRun: (dimensions: string[], metric: ChartMetricInput) => void;
};

const AGGREGATIONS = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" }
] as const;

const NUMERIC_HINTS = ["INT", "DOUBLE", "FLOAT", "DECIMAL", "NUMERIC", "REAL"];

export function ChartBuilder({ schema, data, isLoading, error, onRun }: ChartBuilderProps) {
  const [dimensionA, setDimensionA] = useState<string>("");
  const [dimensionB, setDimensionB] = useState<string>("");
  const [aggregation, setAggregation] = useState<string>("count");
  const [metricColumn, setMetricColumn] = useState<string>("");

  useEffect(() => {
    if (schema.length === 0) {
      setDimensionA("");
      setDimensionB("");
      setMetricColumn("");
      return;
    }

    setDimensionA((current) => current || schema[0]?.name || "");

    const numericCandidate =
      schema.find((column) => isNumeric(column.dtype))?.name ?? schema[0]?.name ?? "";
    setMetricColumn((current) => current || numericCandidate);
  }, [schema]);

  const categoryColumns = schema.map((column) => column.name);
  const metricColumns = schema.map((column) => column.name);
  const numericColumns = schema.filter((column) => isNumeric(column.dtype)).map((column) => column.name);

  const chartMetricAlias = useMemo(() => {
    const suffix = aggregation.toUpperCase();
    if (aggregation === "count" && !metricColumn) {
      return `${suffix}_VALUE`;
    }
    return `${metricColumn || "metric"}_${suffix}`;
  }, [aggregation, metricColumn]);

  const metricKey = useMemo(() => {
    if (!data || data.length === 0) {
      return chartMetricAlias;
    }
    const firstRow = data[0];
    const preferred = chartMetricAlias;
    if (preferred && Object.prototype.hasOwnProperty.call(firstRow, preferred)) {
      return preferred;
    }
    const dimensionKeys = new Set([dimensionA, dimensionB].filter(Boolean));
    const fallback = Object.keys(firstRow).find((key) => !dimensionKeys.has(key));
    return fallback ?? preferred;
  }, [chartMetricAlias, data, dimensionA, dimensionB]);

  const plotData = useMemo(() => {
    if (!data || data.length === 0 || !dimensionA) {
      return [];
    }

    const primaryCategories = [...new Set(data.map((row) => String(row[dimensionA] ?? "(blank)")))];

    if (!dimensionB) {
      return [
        {
          type: "bar",
          x: primaryCategories,
          y: primaryCategories.map((category) => {
            const row = data.find((item) => String(item[dimensionA] ?? "(blank)") === category);
            return Number(row?.[metricKey] ?? 0);
          }),
          marker: { color: "#38bdf8" },
          name: metricKey
        }
      ];
    }

    const seriesMap = new Map<string, Map<string, number>>();
    data.forEach((row) => {
      const seriesKey = String(row[dimensionB] ?? "(blank)");
      const categoryKey = String(row[dimensionA] ?? "(blank)");
      const value = Number(row?.[metricKey] ?? 0);
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, new Map());
      }
      seriesMap.get(seriesKey)?.set(categoryKey, value);
    });

    return Array.from(seriesMap.entries()).map(([seriesKey, valueMap], index) => ({
      type: "bar" as const,
      x: primaryCategories,
      y: primaryCategories.map((category) => valueMap.get(category) ?? 0),
      name: seriesKey,
      marker: {
        color: generatePalette(index)
      }
    }));
  }, [chartMetricAlias, data, dimensionA, dimensionB]);

  const layout = useMemo(
    () => ({
      barmode: dimensionB ? "group" : "relative",
      title: dimensionA
        ? `${aggregation.toUpperCase()} by ${dimensionA}${dimensionB ? ` / ${dimensionB}` : ""}`
        : "Aggregate preview"
    }),
    [aggregation, dimensionA, dimensionB]
  );

  const requiresColumn = aggregation !== "count";
  const canRun = Boolean(dimensionA && (!requiresColumn || metricColumn));

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Chart Explorer</h2>
          <p className={styles.subtitle}>
            Choose dimensions and an aggregation to visualize grouped insights.
          </p>
        </div>
        <div className={styles.controls}>
          <label>
            Dimension A
            <select value={dimensionA} onChange={(event) => setDimensionA(event.target.value)}>
              <option value="">Select column</option>
              {categoryColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dimension B
            <select value={dimensionB} onChange={(event) => setDimensionB(event.target.value)}>
              <option value="">None</option>
              {categoryColumns
                .filter((column) => column !== dimensionA)
                .map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Aggregation
            <select
              value={aggregation}
              onChange={(event) => {
                const value = event.target.value;
                setAggregation(value);
                if (value === "count") {
                  setMetricColumn("");
                } else {
                  const options =
                    value === "sum" || value === "avg" ? numericColumns : metricColumns;
                  if (options.length === 0) {
                    setMetricColumn("");
                  } else if (!options.includes(metricColumn)) {
                    setMetricColumn(options[0]);
                  }
                }
              }}
            >
              {AGGREGATIONS.map((agg) => (
                <option key={agg.value} value={agg.value}>
                  {agg.label}
                </option>
              ))}
            </select>
          </label>
          {aggregation !== "count" ? (
            <label>
              Metric column
              <select value={metricColumn} onChange={(event) => setMetricColumn(event.target.value)}>
                {(aggregation === "sum" || aggregation === "avg"
                  ? numericColumns
                  : metricColumns
                ).map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (!canRun) {
                return;
              }
              onRun([dimensionA, dimensionB].filter(Boolean) as string[], {
                agg: aggregation,
                column:
                  aggregation === "count" && !metricColumn
                    ? undefined
                    : metricColumn || undefined,
                alias: chartMetricAlias
              });
            }}
            disabled={!canRun || isLoading}
          >
            Run
          </button>
        </div>
      </header>
      {error ? <div className={styles.error}>{error}</div> : null}
      <PlotlyChart data={plotData} layout={layout} isLoading={isLoading} />
    </section>
  );
}

function isNumeric(dtype: string): boolean {
  const upper = dtype.toUpperCase();
  return NUMERIC_HINTS.some((hint) => upper.includes(hint));
}

function generatePalette(index: number): string {
  const palette = [
    "#38bdf8",
    "#34d399",
    "#a855f7",
    "#f97316",
    "#ef4444",
    "#facc15",
    "#22d3ee"
  ];
  return palette[index % palette.length];
}
