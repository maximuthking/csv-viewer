import { create } from "zustand";
import type {
  ColumnSchema,
  CsvFileInfo,
  FilterOperator,
  SortDirection
} from "../types/api";
import { fetchCsvFiles, fetchPreview, fetchSchema, fetchSummary } from "../services/csvService";
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

type DashboardState = {
  files: CsvFileInfo[];
  recentFiles: string[];
  selectedPath?: string;
  schema: ColumnSchema[];
  filesLoading: boolean;
  filesError?: string;
  preview: PreviewState;
  summary: SummaryState;
  init: () => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  refreshPreview: () => Promise<void>;
  setPage: (page: number) => Promise<void>;
  setPageSize: (pageSize: number) => Promise<void>;
  updateSort: (sort: SortSpec[]) => Promise<void>;
  updateFilters: (filters: FilterSpec[]) => Promise<void>;
  refreshSummary: () => Promise<void>;
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

export const useDashboardStore = create<DashboardState>((set, get) => ({
  files: [],
  recentFiles: [],
  schema: [],
  filesLoading: false,
  filesError: undefined,
  preview: initialPreviewState,
  summary: initialSummaryState,
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
      summary: { ...initialSummaryState, isLoading: true }
    });

    const updateRecent = (prev: string[]) => {
      const next = prev.filter((item) => item !== path);
      next.unshift(path);
      return next.slice(0, 5);
    };

    set((state) => ({
      recentFiles: updateRecent(state.recentFiles)
    }));

    try {
      const schema = await fetchSchema(path);
      set({ schema });
    } catch (error) {
      set({
        schema: [],
        preview: {
          ...initialPreviewState,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "컬럼 스키마를 불러오지 못했습니다."
        }
      });
      return;
    }

    await Promise.all([get().refreshPreview(), get().refreshSummary()]);
  },
  async refreshPreview() {
    const { selectedPath, preview } = get();
    if (!selectedPath) {
      return;
    }

    set({
      preview: {
        ...preview,
        isLoading: true,
        error: undefined
      }
    });

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
          error:
            error instanceof Error
              ? error.message
              : "Failed to load preview data."
        }
      });
    }
  },
  async setPage(page) {
    set((state) => ({
      preview: { ...state.preview, page }
    }));
    await get().refreshPreview();
  },
  async setPageSize(pageSize) {
    set((state) => ({
      preview: { ...state.preview, pageSize, page: 1 }
    }));
    await get().refreshPreview();
  },
  async updateSort(sort) {
    set((state) => ({
      preview: { ...state.preview, sort, page: 1 }
    }));
    await get().refreshPreview();
  },
  async updateFilters(filters) {
    set((state) => ({
      preview: { ...state.preview, filters, page: 1 }
    }));
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
      set({
        summary: { data: response.summaries, isLoading: false }
      });
    } catch (error) {
      set({
        summary: {
          ...initialSummaryState,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load summary data."
        }
      });
    }
  }
}));
