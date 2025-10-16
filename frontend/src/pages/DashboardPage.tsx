import { useEffect, useMemo } from "react";
import { FileBrowser } from "../components/FileBrowser/FileBrowser";
import { DataPreviewGrid } from "../components/DataPreview/DataPreviewGrid";
import { PreviewControls } from "../components/DataPreview/PreviewControls";
import { SummaryPanel } from "../components/Summary/SummaryPanel";
import { ChartBuilder } from "../components/Charts/ChartBuilder";
import { useDashboardStore } from "../state/useDashboardStore";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const {
    files,
    recentFiles,
    selectedPath,
    schema,
    filesLoading,
    filesError,
    preview,
    summary,
    chart,
    init,
    selectFile,
    refreshPreview,
    refreshSummary,
    refreshChart,
    setChartLimit,
    setPage,
    setPageSize,
    updateSort,
    updateFilters
  } = useDashboardStore((state) => ({
    files: state.files,
    recentFiles: state.recentFiles,
    selectedPath: state.selectedPath,
    schema: state.schema,
    filesLoading: state.filesLoading,
    filesError: state.filesError,
    preview: state.preview,
    summary: state.summary,
    chart: state.chart,
    init: state.init,
    selectFile: state.selectFile,
    refreshPreview: state.refreshPreview,
    refreshSummary: state.refreshSummary,
    refreshChart: state.refreshChart,
    setChartLimit: state.setChartLimit,
    setPage: state.setPage,
    setPageSize: state.setPageSize,
    updateSort: state.updateSort,
    updateFilters: state.updateFilters
  }));

  useEffect(() => {
    void init();
  }, [init]);

  const subtitle = useMemo(() => {
    if (!selectedPath) {
      return "Select a file to explore preview data.";
    }
    return selectedPath;
  }, [selectedPath]);

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.title}>CSV Viewer &amp; Visualizer</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <div className={styles.status}>
          {preview.isLoading ? <span className={styles.badge}>Loading</span> : null}
          {preview.error ? <span className={styles.badgeError}>Error</span> : null}
        </div>
      </header>
      <div className={styles.layout}>
        <FileBrowser
          files={files}
          recentFiles={recentFiles}
          selectedPath={selectedPath}
          isLoading={filesLoading}
          error={filesError}
          onSelect={(path) => void selectFile(path)}
          onReload={() => void init()}
        />
        <div className={styles.mainContent}>
          <DataPreviewGrid
            schema={schema}
            rows={preview.rows}
            totalRows={preview.totalRows}
            page={preview.page}
            pageSize={preview.pageSize}
            isLoading={preview.isLoading}
            error={preview.error}
            sort={preview.sort}
            filters={preview.filters}
            onSortChange={(model) => void updateSort(model)}
            onFilterChange={(model) => void updateFilters(model)}
            onReload={() => void refreshPreview()}
          />
          <PreviewControls
            page={preview.page}
            pageSize={preview.pageSize}
            totalRows={preview.totalRows}
            isLoading={preview.isLoading}
            onPageChange={(page) => void setPage(page)}
            onPageSizeChange={(size) => void setPageSize(size)}
          />
          <div className={styles.analytics}>
            <SummaryPanel
              schema={schema}
              summaries={summary.data}
              isLoading={summary.isLoading}
              error={summary.error}
              onRefresh={() => void refreshSummary()}
            />
            <ChartBuilder
              schema={schema}
              data={chart.data}
              limit={chart.limit}
              isLoading={chart.isLoading}
              error={chart.error}
              onLimitChange={(value) => void setChartLimit(value)}
              onRun={(dimensions, metric, limitValue) =>
                void refreshChart(dimensions, [
                  {
                    name: metric.alias,
                    agg: metric.agg,
                    column: metric.column ?? null
                  }
                ], limitValue)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
