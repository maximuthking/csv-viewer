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

  const subtitle = useMemo(() => {
    if (!selectedPath) {
      return "데이터셋을 선택하면 즉시 탐색을 시작할 수 있습니다.";
    }
    return selectedPath;
  }, [selectedPath]);

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

  const kpis = useMemo(() => {
    const totalRows = previewTotalRows;
    const pageRatio =
      totalRows > 0
        ? `${((previewPage - 1) * previewPageSize + previewRows.length).toLocaleString()} / ${totalRows.toLocaleString()}`
        : " - ";
    const totalColumns = schema.length;

    const nullInsight = summaryData.reduce<{
      column?: string;
      rate: number;
    }>(
      (acc, item) => {
        const total = Number(item.total_rows ?? totalRows);
        if (!total || !Number.isFinite(total)) {
          return acc;
        }
        const nullCount = Number(item.null_count ?? 0);
        const rate = Math.max(0, nullCount / total);
        if (rate > acc.rate) {
          return { column: item.column, rate };
        }
        return acc;
      },
      { column: undefined, rate: -1 }
    );

    const nullMessage =
      nullInsight.rate >= 0 && nullInsight.column
        ? `${nullInsight.column} · ${(nullInsight.rate * 100).toFixed(1)}% null`
        : "충분한 통계가 없습니다.";

    const cards = [
      {
        label: "Rows previewed",
        value: totalRows > 0 ? totalRows.toLocaleString() : "-",
        description: totalRows > 0 ? `현재 페이지 범위 ${pageRatio}` : "미리보기 대기 중"
      },
      {
        label: "Columns",
        value: totalColumns.toLocaleString(),
        description: previewRows.length > 0 ? `${previewRows.length} rows loaded` : "스키마 분석 중"
      },
      {
        label: "Filters & Sort",
        value: `${previewFilters.length} / ${previewSort.length}`,
        description: previewFilters.length + previewSort.length > 0 ? "현재 탐색 컨텍스트" : "기본 순서"
      },
      {
        label: "Null Hotspot",
        value: summaryData.length > 0 ? nullMessage : "-",
        description: summaryData.length > 0 ? "누락률이 가장 높은 열" : "요약 통계 필요"
      }
    ];
    return cards;
  }, [previewFilters, previewSort, previewPage, previewPageSize, previewRows, previewTotalRows, schema, summaryData]);

  return (
    <div className={styles.page}>
      <header className={styles.globalHeader}>
        <div>
          <p className={styles.productTag}>CSV Explorer</p>
          <h1 className={styles.title}>데이터 EDA 콘솔</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <div className={styles.headerStatus}>
          {preview.isLoading ? <span className={styles.badge}>미리보기 로딩</span> : null}
          {summary.isLoading ? <span className={styles.badge}>통계 계산</span> : null}
          {preview.error ? <span className={styles.badgeError}>Preview Error</span> : null}
          {summary.error ? <span className={styles.badgeError}>Summary Error</span> : null}
        </div>
      </header>
      <section className={styles.kpiGrid}>
        {kpis.map((item) => (
          <article key={item.label} className={styles.kpiCard}>
            <p className={styles.kpiLabel}>{item.label}</p>
            <p className={styles.kpiValue}>{item.value}</p>
            <p className={styles.kpiDescription}>{item.description}</p>
          </article>
        ))}
      </section>
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
