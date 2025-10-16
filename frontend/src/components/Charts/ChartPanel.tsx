import { useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
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

  const handleValueColumnChange = (colName: string, checked: boolean) => {
    const newCols = checked
      ? [...value_columns, colName]
      : value_columns.filter((c) => c !== colName);
    void setChartOptions({ value_columns: newCols });
  };

  const onDataZoom = useCallback(
    (e: any) => {
      const { startValue, endValue } = e.batch[0];
      const newRange: [string, string] = [
        new Date(startValue).toISOString(),
        new Date(endValue).toISOString()
      ];
      void setChartOptions({ time_range: newRange });
    },
    [setChartOptions]
  );

  const options = useMemo<EChartsOption>(() => {
    const isTimeSeries = chart_type === "line" || chart_type === "bar";

    let seriesData: EChartsOption['series'];
    let xAxis: EChartsOption['xAxis'];
    let yAxis: EChartsOption['yAxis'];

    if (isTimeSeries) {
      xAxis = {
        type: "category",
        data: data.map((row) =>
          typeof row[time_column!] === "string"
            ? new Date(row[time_column!]).toLocaleString()
            : String(row[time_column!])
        )
      };
      yAxis = { type: "value", scale: true };
      seriesData = value_columns.map((col) => ({
        name: col,
        type: chart_type,
        data: data.map((row) => [row[time_column!], row[col]]),
        symbolSize: (value: any[], params: any) => {
          const isInterpolated = data[params.dataIndex]?.is_interpolated;
          return isInterpolated ? 0 : 6;
        },
        smooth: true
      }));
    } else { // Scatter
      xAxis = { type: "value", scale: true };
      yAxis = { type: "value", scale: true };
      seriesData = [{
        type: 'scatter',
        data: data.map((row) => [row[value_columns[0]], row[value_columns[1]]])
      }];
    }

    return {
      grid: { top: 80, right: 24, bottom: 60, left: 60 },
      xAxis,
      yAxis,
      series: seriesData,
      tooltip: { trigger: "axis" },
      legend: {
        show: value_columns.length > 1,
        top: 40,
        left: "center",
        type: "scroll"
      },
      dataZoom: [
        {
          type: "slider",
          show: isTimeSeries,
          filterMode: "weakFilter",
          showDetail: false,
          bottom: 10
        }
      ]
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
            onChange={(e) => setChartOptions({ chart_type: e.target.value as ChartType })}
            disabled={isLoading}
          >
            {CHART_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
        {chart_type !== 'scatter' && (
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
        )}
        <div className={styles.multiSelect}>
          <p>Value Column(s)</p>
          <div className={styles.checkboxGroup}>
            {numericColumns.map((col) => (
              <label key={col.name} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={value_columns.includes(col.name)}
                  onChange={(e) => handleValueColumnChange(col.name, e.target.checked)}
                  disabled={isLoading}
                />
                {col.name}
              </label>
            ))}
          </div>
        </div>
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
            onEvents={{ dataZoom: onDataZoom }}
          />
        )}
        {isLoading && <div className={styles.loadingOverlay}>Loading chart...</div>}
      </div>
    </section>
  );
}
