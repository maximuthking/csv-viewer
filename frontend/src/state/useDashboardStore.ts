import { create } from "zustand";
import type {
  ChartDataRequest,
  ChartDataResponse,
  ColumnSchema,
  CsvFileInfo,
  FilterOperator,
  SortDirection
} from "../types/api";
import {
  fetchChartData,
  fetchCsvFiles,
  fetchPreview,
  fetchSchema,
  fetchSummary
} from "../services/csvService";
import type { PreviewResponse, SummaryResponse } from "../types/api";
import { env } from "../config/env";

export type SortSpec = { column: string; direction: SortDirection };
export type FilterSpec = {
  column: string;
  operator: FilterOperator;
  value?: unknown;
};

type PreviewState = {
  rows: PreviewResponse["rows"];
  columns: string[];
  totalRows: number;
  page: number;
  pageSize: number;
  sort: SortSpec[];
  filters: FilterSpec[];
  isLoading: boolean;
  error?: string;
};

type SummaryState = {
  data: SummaryResponse["summaries"];
  isLoading: boolean;
  error?: string;
};

export type ChartType = "line" | "bar" | "scatter";

export type ChartOptions = {
  chart_type: ChartType;
  time_column: string | null;
  value_columns: string[];
  time_bucket: string;
  interpolation: "none" | "forward_fill";
};

type ChartState = {
  data: ChartDataResponse["rows"];
  columns: ChartDataResponse["columns"];
  options: ChartOptions;
  isLoading: boolean;
  error?: string;
};

type DashboardState = {
  files: CsvFileInfo[];
  recentFiles: string[];
  selectedPath?: string;
  schema: ColumnSchema[];
  filesLoading: boolean;
  filesError?: string;
  preview: PreviewState;
  summary: SummaryState;
  chart: ChartState;
  init: () => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  refreshPreview: () => Promise<void>;
  setPage: (page: number) => Promise<void>;
  setPageSize: (pageSize: number) => Promise<void>;
  updateSort: (sort: SortSpec[]) => Promise<void>;
  updateFilters: (filters: FilterSpec[]) => Promise<void>;
  refreshSummary: () => Promise<void>;
  refreshChart: () => Promise<void>;
  setChartOptions: (options: Partial<ChartOptions>) => Promise<void>;
};

const initialPreviewState: PreviewState = {
  rows: [],
  columns: [],
  totalRows: 0,
  page: 1,
  pageSize: env.defaultPageSize,
  sort: [],
  filters: [],
  isLoading: false
};

const initialSummaryState: SummaryState = {
  data: [],
  isLoading: false
};

const initialChartState: ChartState = {
  data: [],
  columns: [],
  options: {
    chart_type: "line",
    time_column: null,
    value_columns: [],
    time_bucket: "5 minutes",
    interpolation: "none"
  },
  isLoading: false
};

function getDefaultChartOptions(schema: ColumnSchema[]): Partial<ChartOptions> {
  if (schema.length === 0) {
    return {};
  }
  const timeColumn = schema.find((c) => c.dtype.includes("TIMESTAMP"));
  const valueColumn = schema.find((c) =>
    ["BIGINT", "DOUBLE", "FLOAT", "INTEGER", "REAL"].some((t) =>
      c.dtype.toUpperCase().includes(t)
    )
  );

  return {
    time_column: timeColumn?.name ?? null,
    value_columns: valueColumn ? [valueColumn.name] : []
  };
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  files: [],
  recentFiles: [],
  schema: [],
  filesLoading: false,
  filesError: undefined,
  preview: initialPreviewState,
  summary: initialSummaryState,
  chart: initialChartState,
  async init() {
    set({ filesLoading: true, filesError: undefined });
    try {
      const files = await fetchCsvFiles();
      set({ files, filesLoading: false });
      if (files.length > 0) {
        await get().selectFile(files[0].path);
      }
    } catch (error) {
      set({
        filesLoading: false,
        filesError: error instanceof Error ? error.message : String(error)
      });
    }
  },
  async selectFile(path) {
    const { selectedPath } = get();
    if (selectedPath === path) {
      return;
    }
    set({
      selectedPath: path,
      schema: [],
      preview: { ...initialPreviewState, isLoading: true },
      summary: { ...initialSummaryState, isLoading: true },
      chart: { ...initialChartState, isLoading: true }
    });

    const updateRecent = (prev: string[]) => {
      const next = prev.filter((item) => item !== path);
      next.unshift(path);
      return next.slice(0, 5);
    };

    set((state) => ({ recentFiles: updateRecent(state.recentFiles) }));

    try {
      const schema = await fetchSchema(path);
      const defaultChartOpts = getDefaultChartOptions(schema);
      set((state) => ({
        schema,
        chart: {
          ...state.chart,
          options: { ...initialChartState.options, ...defaultChartOpts }
        }
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "컬럼 스키마를 불러오지 못했습니다.";
      set({
        schema: [],
        preview: { ...initialPreviewState, isLoading: false, error: errorMessage },
        summary: { ...initialSummaryState, isLoading: false, error: errorMessage },
        chart: { ...initialChartState, isLoading: false, error: errorMessage }
      });
      return;
    }

    await Promise.all([
      get().refreshPreview(),
      get().refreshSummary(),
      get().refreshChart()
    ]);
  },
  async refreshPreview() {
    const { selectedPath, preview } = get();
    if (!selectedPath) {
      return;
    }

    set({ preview: { ...preview, isLoading: true, error: undefined } });

    try {
      const payload = {
        path: selectedPath,
        limit: preview.pageSize,
        offset: (preview.page - 1) * preview.pageSize,
        order_by: preview.sort,
        filters: preview.filters
      };
      const result = await fetchPreview(payload);
      set({
        preview: {
          ...preview,
          rows: result.rows,
          columns: result.columns,
          totalRows: result.total_rows,
          isLoading: false,
          error: undefined
        }
      });
    } catch (error) {
      set({
        preview: {
          ...preview,
          rows: [],
          columns: [],
          totalRows: 0,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to load preview data."
        }
      });
    }
  },
  async setPage(page) {
    set((state) => ({ preview: { ...state.preview, page } }));
    await get().refreshPreview();
  },
  async setPageSize(pageSize) {
    set((state) => ({ preview: { ...state.preview, pageSize, page: 1 } }));
    await get().refreshPreview();
  },
  async updateSort(sort) {
    set((state) => ({ preview: { ...state.preview, sort, page: 1 } }));
    await get().refreshPreview();
  },
  async updateFilters(filters) {
    set((state) => ({ preview: { ...state.preview, filters, page: 1 } }));
    await get().refreshPreview();
  },
  async refreshSummary() {
    const { selectedPath, schema } = get();
    if (!selectedPath || schema.length === 0) {
      return;
    }
    set({ summary: { ...initialSummaryState, isLoading: true } });
    try {
      const response = await fetchSummary(selectedPath);
      set({ summary: { data: response.summaries, isLoading: false } });
    } catch (error) {
      set({
        summary: {
          ...initialSummaryState,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to load summary data."
        }
      });
    }
  },
  async setChartOptions(options) {
    set((state) => ({
      chart: { ...state.chart, options: { ...state.chart.options, ...options } }
    }));
    await get().refreshChart();
  },
  async refreshChart() {
    const { selectedPath, chart } = get();
    const { chart_type, time_column, value_columns } = chart.options;

    const isTimeSeries = chart_type === "line" || chart_type === "bar";

    if (!selectedPath || value_columns.length === 0) {
      return; // Not ready to fetch
    }
    if (isTimeSeries && !time_column) {
      set((state) => ({ chart: { ...state.chart, isLoading: false, error: "Time column not selected." } }));
      return;
    }

    set({ chart: { ...chart, isLoading: true, error: undefined } });

    try {
      const payload: ChartDataRequest = {
        path: selectedPath,
        chart_type,
        time_column,
        value_columns,
        time_bucket: chart.options.time_bucket,
        interpolation: chart.options.interpolation
      };
      const result = await fetchChartData(payload);
      set({
        chart: {
          ...chart,
          data: result.rows,
          columns: result.columns,
          isLoading: false
        }
      });
    } catch (error) {
      set({
        chart: {
          ...chart,
          data: [],
          columns: [],
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to load chart data."
        }
      });
    }
  }
}));
