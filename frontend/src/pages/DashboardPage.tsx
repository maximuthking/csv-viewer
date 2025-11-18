import { useEffect, useMemo, useState } from "react";
import { FileBrowser } from "../components/FileBrowser/FileBrowser";
import { DataPreviewGrid } from "../components/DataPreview/DataPreviewGrid";
import { PreviewControls } from "../components/DataPreview/PreviewControls";
import { SummaryPanel } from "../components/Summary/SummaryPanel";
import { useDashboardStore } from "../state/useDashboardStore";
import styles from "./DashboardPage.module.css";
import { ChartPanel } from "../components/Charts/ChartPanel";

type TabKey = "data" | "chart" | "summary";

const TAB_ITEMS: ReadonlyArray<{ id: TabKey; label: string }> = [
  { id: "data", label: "데이터 미리보기" },
  { id: "chart", label: "차트" },
  { id: "summary", label: "요약 통계" }
];

export function DashboardPage() {
  const {
    files,
    selectedPath,
    schema,
    filesLoading,
    filesError,
    preview,
    chart,
    summary,
    recentFiles,
    init,
    selectFile,
    refreshPreview,
    refreshSummary,
    setPage,
    setPageSize,
    updateSort,
    updateFilters,
    locatePreviewValue,
    clearPreviewSearch
  } = useDashboardStore((state) => ({
    files: state.files,
    selectedPath: state.selectedPath,
    schema: state.schema,
    filesLoading: state.filesLoading,
    filesError: state.filesError,
    preview: state.preview,
    summary: state.summary,
    chart: state.chart,
    recentFiles: state.recentFiles,
    init: state.init,
    selectFile: state.selectFile,
    refreshPreview: state.refreshPreview,
    refreshSummary: state.refreshSummary,
    setPage: state.setPage,
    setPageSize: state.setPageSize,
    updateSort: state.updateSort,
    updateFilters: state.updateFilters,
    locatePreviewValue: state.locatePreviewValue,
    clearPreviewSearch: state.clearPreviewSearch
  }));

  useEffect(() => {
    void init();
  }, [init]);

  const [activeTab, setActiveTab] = useState<TabKey>("data");

  const previewFilters = preview.filters;
  const previewSort = preview.sort;
  const previewRows = preview.rows;
  const previewTotalRows = preview.totalRows;
  const previewPage = preview.page;
  const previewPageSize = preview.pageSize;
  const summaryData = summary.data;
  const chartValueColumns = chart.options.value_columns;

  const tabBadges = useMemo(() => {
    const activeFilters = previewFilters.length;
    const activeSorts = previewSort.length;
    const seriesCount = chartValueColumns.length;
    const summaryCount = summaryData.length;
    return {
      data:
        activeFilters + activeSorts > 0
          ? `${activeFilters}F / ${activeSorts}S`
          : undefined,
      chart:
        previewRows.length > 0 && schema.length > 0
          ? `${seriesCount} view`
          : undefined,
      summary: summaryCount > 0 ? `${summaryCount}` : undefined
    } as Record<TabKey, string | undefined>;
  }, [previewFilters, previewSort, previewRows, schema, summaryData, chartValueColumns]);

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <FileBrowser
            files={files}
            recentFiles={recentFiles}
            selectedPath={selectedPath}
            isLoading={filesLoading}
            error={filesError}
            onSelect={(path) => void selectFile(path)}
            onReload={() => void init()}
          />
        </aside>
        <div className={styles.mainContent}>
          <div className={styles.tabContainer}>
            <div className={styles.tabList} role="tablist" aria-label="Data exploration views">
              {TAB_ITEMS.map((tab) => {
                const isActive = activeTab === tab.id;
                const tabId = `${tab.id}-tab`;
                const panelId = `${tab.id}-panel`;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={tabId}
                    aria-selected={isActive}
                    aria-controls={panelId}
                    className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span>{tab.label}</span>
                    {tabBadges[tab.id] ? (
                      <span className={styles.tabBadge}>{tabBadges[tab.id]}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className={styles.tabContent}>
              {activeTab === "data" ? (
                <div
                  id="data-panel"
                  role="tabpanel"
                  aria-labelledby="data-tab"
                  className={styles.tabPanel}
                >
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
                    highlightRowIndex={preview.highlight?.rowIndexInPage}
                    highlightColumn={preview.highlight?.column}
                    highlightToken={preview.highlight?.token}
                    onSortChange={(model) => void updateSort(model)}
                    onFilterChange={(model) => void updateFilters(model)}
                    onReload={() => void refreshPreview()}
                  />
                  <PreviewControls
                    page={preview.page}
                    pageSize={preview.pageSize}
                    totalRows={preview.totalRows}
                    isLoading={preview.isLoading}
                    columns={schema.map((column) => column.name)}
                    searchColumn={preview.searchColumn}
                    searchTerm={preview.searchTerm}
                    searchInProgress={preview.searchInProgress}
                    searchError={preview.searchError}
                    lastMatch={preview.lastSearchMatch}
                    onSearch={(payload) => void locatePreviewValue(payload)}
                    onClearSearch={() => void clearPreviewSearch()}
                    onPageChange={(page) => void setPage(page)}
                    onPageSizeChange={(size) => void setPageSize(size)}
                  />
                </div>
              ) : null}
              {activeTab === "chart" ? (
                <div
                  id="chart-panel"
                  role="tabpanel"
                  aria-labelledby="chart-tab"
                  className={styles.tabPanel}
                >
                  <ChartPanel />
                </div>
              ) : null}
              {activeTab === "summary" ? (
                <div
                  id="summary-panel"
                  role="tabpanel"
                  aria-labelledby="summary-tab"
                  className={styles.tabPanel}
                >
                  <SummaryPanel
                    schema={schema}
                    summaries={summary.data}
                    isLoading={summary.isLoading}
                    error={summary.error}
                    onRefresh={() => void refreshSummary()}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
