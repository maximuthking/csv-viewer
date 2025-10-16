import { useEffect, useRef, useState } from "react";
import type { Layout, Data, Config } from "plotly.js-dist-min";
import styles from "./PlotlyChart.module.css";

type PlotlyChartProps = {
  data: Partial<Data>[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  isLoading?: boolean;
  emptyMessage?: string;
};

type PlotlyLib = typeof import("plotly.js-dist-min");

export function PlotlyChart({
  data,
  layout,
  config,
  isLoading,
  emptyMessage = "No data to display."
}: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [plotly, setPlotly] = useState<PlotlyLib | null>(null);

  useEffect(() => {
    let isMounted = true;
    void import("plotly.js-dist-min").then((module) => {
      if (!isMounted) {
        return;
      }
      const loaded = (module as { default?: PlotlyLib })?.default ?? (module as PlotlyLib);
      setPlotly(loaded);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !plotly) {
      return;
    }

    if (!data || data.length === 0) {
      element.innerHTML = "";
      return;
    }

    const plotLayout: Partial<Layout> = {
      autosize: true,
      margin: { l: 50, r: 25, t: 32, b: 48 },
      paper_bgcolor: "rgba(17, 24, 39, 0.4)",
      plot_bgcolor: "rgba(17, 24, 39, 0.4)",
      font: { color: "#e2e8f0" },
      ...layout
    };

    const plotConfig: Partial<Config> = {
      displaylogo: false,
      responsive: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
      ...config
    };

    plotly.react(element, data, plotLayout, plotConfig);

    return () => {
      plotly.purge(element);
    };
  }, [config, data, layout, plotly]);

  const isEngineLoading = !plotly;
  const showEmpty = !isEngineLoading && (!data || data.length === 0) && !isLoading;

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.chartArea} />
      {showEmpty ? <div className={styles.empty}>{emptyMessage}</div> : null}
      {(isLoading || isEngineLoading) && (
        <div className={styles.loading}>
          {isEngineLoading ? "Loading chart engine..." : "Rendering chart..."}
        </div>
      )}
    </div>
  );
}
