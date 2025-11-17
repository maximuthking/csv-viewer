import { useMemo } from "react";
import type { ChangeEvent } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption, SeriesOption } from "echarts";
import { useDashboardStore, ChartType } from "../../state/useDashboardStore";
import type { ChartOptions } from "../../state/useDashboardStore";
import styles from "./ChartPanel.module.css";

const TIME_BUCKET_OPTIONS = ["1 minute", "5 minutes", "15 minutes", "1 hour", "1 day", "1 week"];
const INTERPOLATION_OPTIONS: ChartOptions["interpolation"][] = [
  "none",
  "ffill",
  "bfill",
  "linear",
  "spline",
  "polynomial",
  "pchip",
  "akima"
];
const CHART_TYPE_OPTIONS: ChartType[] = ["line", "bar", "scatter"];

const PRESET_CONFIGS = [
  {
    id: "trend",
    label: "시간 추세",
    description: "시간 컬럼 + 대표 지표를 빠르게 시각화합니다.",
    apply: (timeColumn?: string, valueColumn?: string) => ({
      chart_type: "line" as const,
      time_column: timeColumn ?? null,
      value_columns: valueColumn ? [valueColumn] : []
    })
  },
  {
    id: "distribution",
    label: "막대 비교",
    description: "시간 단위로 집계된 분포를 비교합니다.",
    apply: (timeColumn?: string, valueColumn?: string) => ({
      chart_type: "bar" as const,
      time_column: timeColumn ?? null,
      value_columns: valueColumn ? [valueColumn] : []
    })
  },
  {
    id: "correlation",
    label: "상관 관계",
    description: "두 개의 수치 컬럼으로 산점도를 만듭니다.",
    apply: (_timeColumn: string | undefined, x?: string, y?: string) => ({
      chart_type: "scatter" as const,
      time_column: null,
      value_columns: [x ?? "", y ?? ""].filter(Boolean)
    })
  }
] as const;

export function ChartPanel() {
  const {
    chart,
    schema,
    setChartOptions,
    refreshChart
  } = useDashboardStore((state) => ({
    chart: state.chart,
    schema: state.schema,
    setChartOptions: state.setChartOptions,
    refreshChart: state.refreshChart
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

  const handleToggleValueColumn = (columnName: string) => {
    if (chart_type === "scatter") {
      return;
    }
    const current = new Set(value_columns);
    if (current.has(columnName)) {
      const next = value_columns.filter((col) => col !== columnName);
      void setChartOptions({ value_columns: next });
      return;
    }
    const updated = [...value_columns, columnName].slice(-3);
    void setChartOptions({ value_columns: updated });
  };

  const applyPreset = (presetId: (typeof PRESET_CONFIGS)[number]["id"]) => {
    const preset = PRESET_CONFIGS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    const defaultTimeColumn = timeColumns[0]?.name;
    const firstNumeric = numericColumns[0]?.name;
    const secondNumeric = numericColumns[1]?.name;
    const payload = preset.apply(defaultTimeColumn, firstNumeric, secondNumeric);
    void setChartOptions(payload);
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

      const parseTimeBucketToMs = (bucket: string | undefined): number | null => {
        if (!bucket) {
          return null;
        }
        const match = bucket.trim().toLowerCase().match(/^(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)$/);
        if (!match) {
          return null;
        }
        const amount = Number(match[1]);
        if (!Number.isFinite(amount)) {
          return null;
        }
        const unit = match[2];
        const minuteMs = 60 * 1000;
        switch (unit) {
          case "minute":
          case "minutes":
            return amount * minuteMs;
          case "hour":
          case "hours":
            return amount * 60 * minuteMs;
          case "day":
          case "days":
            return amount * 24 * 60 * minuteMs;
          case "week":
          case "weeks":
            return amount * 7 * 24 * 60 * minuteMs;
          default:
            return null;
        }
      };

      const axisValueToTimestamp = (axisValue: string | number | Date): number | null => {
        if (typeof axisValue === "number") {
          return Number.isFinite(axisValue) ? axisValue : null;
        }
        if (typeof axisValue === "string") {
          const parsed = Date.parse(axisValue);
          return Number.isNaN(parsed) ? null : parsed;
        }
        if (axisValue instanceof Date) {
          return axisValue.getTime();
        }
        return null;
      };

      const bucketSizeMs = parseTimeBucketToMs(time_bucket);

      const baseSeries = value_columns.map((col) => {
        type SeriesPoint = {
          axisValue: string | number | Date;
          numericValue: number;
          rowIndex: number;
          isInterpolated: boolean;
          timestamp: number | null;
        };

        const seriesPoints = data.reduce<SeriesPoint[]>(
          (acc, row, rowIndex) => {
            const x = coerceToAxisValue(row[safeTimeColumn]);
            const y = coerceToNumber(row[col]);
            if (x === null || y === null) {
              return acc;
            }
            const isInterpolated = Boolean(
              typeof row === "object" && row !== null
                ? (row as Record<string, unknown>)["is_interpolated"]
                : false
            );
            const timestamp = axisValueToTimestamp(x);
            acc.push({
              axisValue: x,
              numericValue: y,
              rowIndex,
              isInterpolated,
              timestamp
            });
            return acc;
          },
          []
        );

        if (chart_type === "line") {
          type LineDatum = {
            value: [string | number | Date, number | null];
            symbolSize: number;
            itemStyle: { color: string };
          };

          const seriesDataWithGaps: Array<LineDatum | null> = [];
          let previousTimestamp: number | null = null;

          seriesPoints.forEach((point, index) => {
            const isGap =
              index > 0 &&
              bucketSizeMs &&
              previousTimestamp !== null &&
              point.timestamp !== null &&
              point.timestamp - previousTimestamp > bucketSizeMs * 1.5;

            if (isGap) {
              seriesDataWithGaps.push(null);
            }

          const symbolSize = point.isInterpolated ? 3 : 8;
          seriesDataWithGaps.push({
            value: [point.axisValue, point.numericValue],
            symbolSize,
            itemStyle: { color: point.isInterpolated ? "#64b5f6" : "#1976d2" }
          });

            previousTimestamp = point.timestamp;
          });

          const lineSeries: SeriesOption = {
            name: col,
            type: "line",
            data: seriesDataWithGaps,
            smooth: true,
            connectNulls: false,
            lineStyle: { color: "#1976d2", width: 2 },
            itemStyle: { color: "#1976d2" },
            markLine: {
              silent: true,
              data: [{ type: "average", name: "평균" }]
            }
          };

          return lineSeries;
        }

        const barSeriesData: Array<
          | {
              value: [string | number | Date, number];
              itemStyle: { color: string };
            }
          | null
        > = [];

        let previousTimestamp: number | null = null;

        seriesPoints.forEach((point, index) => {
          const prevPoint = seriesPoints[index - 1];
          const isGap =
            index > 0 &&
            bucketSizeMs &&
            prevPoint?.timestamp !== null &&
            point.timestamp !== null &&
            point.timestamp - (prevPoint?.timestamp ?? 0) > bucketSizeMs * 1.5;

          if (isGap) {
            const expectedTimestamp = (prevPoint?.timestamp ?? 0) + bucketSizeMs!;
            const gapAxisValue =
              typeof prevPoint?.axisValue === "number"
                ? expectedTimestamp
                : new Date(expectedTimestamp).toISOString();

            barSeriesData.push({
              value: [gapAxisValue, 0],
              itemStyle: {
                color: "#bbdefb"
              }
            });
          }

          barSeriesData.push({
            value: [point.axisValue, point.numericValue],
            itemStyle: {
              color: point.isInterpolated ? "#64b5f6" : "#1976d2"
            }
          });
          previousTimestamp = point.timestamp;
        });

        const barSeries: SeriesOption = {
          name: col,
          type: "bar",
          data: barSeriesData,
          markLine: {
            silent: true,
            data: [{ type: "average", name: "평균" }]
          }
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

    const dataZoom = isTimeSeries
      ? [
          { type: "inside", xAxisIndex: 0 },
          { type: "slider", xAxisIndex: 0, height: 60, bottom: 16 }
        ]
      : [
          { type: "inside", xAxisIndex: 0 },
          { type: "inside", yAxisIndex: 0 }
        ];

    const toolbox = {
      right: 16,
      feature: {
        dataZoom: {},
        restore: {},
        saveAsImage: {}
      }
    };

    const gridBottom = isTimeSeries ? 96 : 24;

    return {
      grid: { top: 80, right: 24, bottom: gridBottom, left: 60, containLabel: true },
      xAxis,
      yAxis,
      series: seriesData,
      dataZoom,
      toolbox,
      tooltip: { trigger: isTimeSeries ? "axis" : "item" },
      brush: isTimeSeries
        ? {
            toolbox: ["rect", "polygon", "keep", "clear"],
            xAxisIndex: "all"
          }
        : {
            toolbox: ["rect", "polygon", "keep", "clear"],
            xAxisIndex: "all",
            yAxisIndex: "all"
          },
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
        <div>
          <h2 className={styles.title}>시각 분석</h2>
          <p className={styles.description}>차트 영역을 활용해 시간 추세, 분포, 상관관계를 빠르게 비교하세요.</p>
        </div>
        <div className={styles.statusBadges}>
          <span className={styles.badge}>{data.length.toLocaleString()} pts</span>
          <button type="button" onClick={() => void refreshChart()} className={styles.refreshButton} disabled={isLoading}>
            데이터 새로고침
          </button>
        </div>
      </header>
      <div className={styles.content}>
        <aside className={styles.controlPanel}>
          <label className={styles.controlField}>
            차트 유형
            <select value={chart_type} onChange={handleChartTypeChange} disabled={isLoading}>
              {CHART_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          {chart_type !== "scatter" ? (
            <>
              <label className={styles.controlField}>
                시간 컬럼
                <select
                  value={time_column ?? ""}
                  onChange={(e) => setChartOptions({ time_column: e.target.value })}
                  disabled={isLoading}
                >
                  {timeColumns.map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.valueMatrix}>
                <p>지표 선택 (최대 3개)</p>
                {numericColumns.map((col) => (
                  <label key={col.name}>
                    <input
                      type="checkbox"
                      checked={value_columns.includes(col.name)}
                      onChange={() => handleToggleValueColumn(col.name)}
                      disabled={isLoading}
                    />
                    <span>{col.name}</span>
                  </label>
                ))}
              </div>
              <label className={styles.controlField}>
                시간 버킷
                <select
                  value={time_bucket}
                  onChange={(e) => setChartOptions({ time_bucket: e.target.value })}
                  disabled={isLoading}
                >
                  {TIME_BUCKET_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.controlField}>
                보간 방식
                <select
                  value={interpolation}
                  onChange={(e) =>
                    setChartOptions({ interpolation: e.target.value as ChartOptions["interpolation"] })
                  }
                  disabled={isLoading}
                >
                  {INTERPOLATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label className={styles.controlField}>
                X 컬럼
                <select
                  value={value_columns[0] ?? ""}
                  onChange={(e) => setChartOptions({ value_columns: [e.target.value, value_columns[1]] })}
                  disabled={isLoading || numericColumns.length === 0}
                >
                  {numericColumns.map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.controlField}>
                Y 컬럼
                <select
                  value={value_columns[1] ?? ""}
                  onChange={(e) => setChartOptions({ value_columns: [value_columns[0], e.target.value] })}
                  disabled={isLoading || numericColumns.length < 2}
                >
                  {numericColumns.map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className={styles.presets}>
            <p>프리셋</p>
            {PRESET_CONFIGS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={styles.presetButton}
                disabled={isLoading}
              >
                <span>{preset.label}</span>
                <small>{preset.description}</small>
              </button>
            ))}
          </div>
        </aside>
        <div className={styles.chartColumn}>
          <div className={styles.chartWrapper}>
            {error ? (
              <div className={styles.error}>{error}</div>
            ) : (
              <ReactECharts option={options} style={{ height: "70vh", width: "100%" }} notMerge lazyUpdate />
            )}
            {isLoading && <div className={styles.loadingOverlay}>차트를 계산 중...</div>}
          </div>
          <div className={styles.chartSummary}>
            <div>
              <p className={styles.summaryLabel}>선택된 지표</p>
              <p className={styles.summaryValue}>
                {value_columns.length > 0 ? value_columns.join(", ") : "선택된 수치 컬럼이 없습니다."}
              </p>
            </div>
            {chart_type !== "scatter" ? (
              <div>
                <p className={styles.summaryLabel}>시간 버킷</p>
                <p className={styles.summaryValue}>{time_bucket}</p>
              </div>
            ) : null}
            <div>
              <p className={styles.summaryLabel}>보간/프리셋</p>
              <p className={styles.summaryValue}>
                {chart_type === "scatter" ? "산점도" : interpolation}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
