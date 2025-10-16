import { useMemo } from 'react';
import type { ChangeEvent } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption, SeriesOption } from 'echarts';
import { useDashboardStore, ChartType } from '../../state/useDashboardStore';
import styles from './ChartPanel.module.css';

const TIME_BUCKET_OPTIONS = ["1 minute", "5 minutes", "15 minutes", "1 hour", "1 day", "1 week"];
const INTERPOLATION_OPTIONS = ["none", "forward_fill"];
const CHART_TYPE_OPTIONS: ChartType[] = ["line", "bar", "scatter"];

export function ChartPanel() {
  const {
    chart,
    schema,
    setChartOptions
  } = useDashboardStore((state) => ({
    chart: state.chart,
    schema: state.schema,
    setChartOptions: state.setChartOptions
  }));

  const { data, options: chartOptions, isLoading, error } = chart;
  const { chart_type, time_column, value_columns, time_bucket, interpolation } = chartOptions;

  const { timeColumns, numericColumns } = useMemo(() => ({
    timeColumns: schema.filter((c) => c.dtype.includes("TIMESTAMP")),
    numericColumns: schema.filter((c) =>
      ["BIGINT", "DOUBLE", "FLOAT", "INTEGER", "REAL"].some((t) =>
        c.dtype.toUpperCase().includes(t)
      )
    )
  }), [schema]);

  const handleChartTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextType = event.target.value as ChartType;
    if (nextType === chart_type) {
      return;
    }

    if (nextType === "scatter") {
      const numericColumnNames = numericColumns.map((col) => col.name);
      const candidateColumns = [
        ...value_columns.filter((col): col is string => numericColumnNames.includes(col)),
        ...numericColumnNames
      ];
      const scatterValueColumns = Array.from(new Set(candidateColumns)).slice(0, 2);

      void setChartOptions({
        chart_type: nextType,
        time_column: null,
        value_columns: scatterValueColumns
      });
      return;
    }

    const defaultTimeColumn = timeColumns.length > 0 ? (time_column ?? timeColumns[0].name) : null;
    const defaultValueColumn = value_columns[0] ?? numericColumns[0]?.name ?? null;
    const nextValueColumns = defaultValueColumn ? [defaultValueColumn] : [];

    void setChartOptions({
      chart_type: nextType,
      time_column: defaultTimeColumn,
      value_columns: nextValueColumns
    });
  };

  const options = useMemo<EChartsOption>(() => {
    const isTimeSeries = chart_type === "line" || chart_type === "bar";

    let seriesData: EChartsOption['series'];
    let xAxis: EChartsOption['xAxis'];
    let yAxis: EChartsOption['yAxis'];

    if (isTimeSeries) {
      xAxis = { type: "time" };
      yAxis = { type: "value", scale: true };
      const safeTimeColumn = time_column ?? "";

      const coerceToAxisValue = (value: unknown): string | number | Date | null => {
        if (value === null || value === undefined) {
          return null;
        }
        if (value instanceof Date || typeof value === "string" || typeof value === "number") {
          return value;
        }
        if (typeof value === "boolean") {
          return value ? 1 : 0;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const coerceToNumber = (value: unknown): number | null => {
        if (typeof value === "number") {
          return Number.isFinite(value) ? value : null;
        }
        if (value === null || value === undefined) {
          return null;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const baseSeries = value_columns.map((col) => {
        const seriesPoints = data.reduce<Array<{ value: [string | number | Date, number]; rowIndex: number }>>(
          (acc, row, rowIndex) => {
            const x = coerceToAxisValue(row[safeTimeColumn]);
            const y = coerceToNumber(row[col]);
            if (x === null || y === null) {
              return acc;
            }
            acc.push({ value: [x, y], rowIndex });
            return acc;
          },
          []
        );
        const normalizedData = seriesPoints.map((point) => point.value);

        if (chart_type === "line") {
          const indexLookup = seriesPoints.map((point) => point.rowIndex);
          const lineSeries: SeriesOption = {
            name: col,
            type: "line",
            data: normalizedData,
            symbolSize: (_value, params) => {
              const originalIndex = indexLookup[params.dataIndex];
              const originalRow = typeof originalIndex === "number" ? data[originalIndex] : undefined;
              const isInterpolated =
                typeof originalRow === "object" && originalRow !== null
                  ? Boolean((originalRow as Record<string, unknown>)["is_interpolated"])
                  : false;
              return isInterpolated ? 0 : 6;
            },
            smooth: true
          };
          return lineSeries;
        }

        const barSeries: SeriesOption = {
          name: col,
          type: "bar",
          data: normalizedData
        };
        return barSeries;
      });

      seriesData = baseSeries;
    } else { // Scatter
      xAxis = { type: "value", scale: true };
      yAxis = { type: "value", scale: true };
      const [xColumn, yColumn] = value_columns;
      const coerceToNumber = (value: unknown): number | null => {
        if (typeof value === "number") {
          return Number.isFinite(value) ? value : null;
        }
        if (value === null || value === undefined) {
          return null;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const scatterPoints = xColumn && yColumn
        ? data
          .map((row) => {
            const x = coerceToNumber(row[xColumn]);
            const y = coerceToNumber(row[yColumn]);
            return x === null || y === null ? null : [x, y] as [number, number];
          })
          .filter((point): point is [number, number] => point !== null)
        : [];

      const scatterSeries: SeriesOption = {
        name: xColumn && yColumn ? `${xColumn} vs ${yColumn}` : "Scatter",
        type: "scatter",
        data: scatterPoints
      };
      seriesData = [scatterSeries];
    }

    return {
      grid: { top: 80, right: 24, bottom: 24, left: 60, containLabel: true },
      xAxis,
      yAxis,
      series: seriesData,
      tooltip: { trigger: isTimeSeries ? "axis" : "item" },
      legend: isTimeSeries
        ? {
            show: value_columns.length > 1,
            top: 40,
            left: "center",
            type: "scroll"
          }
        : { show: false },
    };
  }, [chart_type, data, time_column, value_columns]);

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Chart</h2>
      </header>
      <div className={styles.controls}>
        <label>
          Chart Type
          <select
            value={chart_type}
            onChange={handleChartTypeChange}
            disabled={isLoading}
          >
            {CHART_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
        {chart_type !== 'scatter' ? (
          <>
            <label>
              Time Column
              <select
                value={time_column ?? ''}
                onChange={(e) => setChartOptions({ time_column: e.target.value })}
                disabled={isLoading}
              >
                {timeColumns.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
            </label>
            <label>
              Value Column
              <select
                value={value_columns[0] ?? ''}
                onChange={(e) => setChartOptions({ value_columns: [e.target.value] })}
                disabled={isLoading || numericColumns.length === 0}
              >
                {numericColumns.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
            </label>
            <label>
              Time Bucket
              <select
                value={time_bucket}
                onChange={(e) => setChartOptions({ time_bucket: e.target.value })}
                disabled={isLoading}
              >
                {TIME_BUCKET_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label>
              Interpolation
              <select
                value={interpolation}
                onChange={(e) =>
                  setChartOptions({ interpolation: e.target.value as "none" | "forward_fill" })
                }
                disabled={isLoading}
              >
                {INTERPOLATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              X-Axis Column
              <select
                value={value_columns[0] ?? ''}
                onChange={(e) => setChartOptions({ value_columns: [e.target.value, value_columns[1]] })}
                disabled={isLoading || numericColumns.length === 0}
              >
                {numericColumns.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
            </label>
            <label>
              Y-Axis Column
              <select
                value={value_columns[1] ?? ''}
                onChange={(e) => setChartOptions({ value_columns: [value_columns[0], e.target.value] })}
                disabled={isLoading || numericColumns.length < 2}
              >
                {numericColumns.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className={styles.chartWrapper}>
        {error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <ReactECharts
            option={options}
            style={{ height: '400px', width: '100%' }}
            notMerge
            lazyUpdate
          />
        )}
        {isLoading && <div className={styles.loadingOverlay}>Loading chart...</div>}
      </div>
    </section>
  );
}
