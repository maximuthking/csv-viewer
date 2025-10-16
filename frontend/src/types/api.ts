export type CsvFileInfo = {
  name: string;
  path: string;
  size_bytes: number;
  modified_at: string;
};

export type ColumnSchema = {
  name: string;
  dtype: string;
  nullable: boolean;
};

export type FilterOperator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "contains";

export type SortDirection = "asc" | "desc";

export type PreviewRequest = {
  path: string;
  limit: number;
  offset: number;
  order_by?: Array<{ column: string; direction: SortDirection }>;
  filters?: Array<{ column: string; operator: FilterOperator; value?: unknown }>;
};

export type PreviewResponse = {
  rows: Array<Record<string, unknown>>;
  total_rows: number;
  columns: string[];
};

export type SummaryResponse = {
  summaries: Array<{
    column: string;
    dtype: string;
    total_rows: number;
    null_count: number;
    non_null_count: number;
    distinct_count: number;
    min_value?: number | string | null;
    max_value?: number | string | null;
    mean_value?: number | null;
    stddev_value?: number | null;
  }>;
};
