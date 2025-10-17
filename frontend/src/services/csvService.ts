import { httpClient } from "./httpClient";
import type {
  ChartDataRequest,
  ChartDataResponse,
  ColumnSchema,
  CsvFileInfo,
  PreviewLocateRequest,
  PreviewLocateResponse,
  PreviewRequest,
  PreviewResponse,
  SummaryResponse
} from "../types/api";

export async function fetchCsvFiles(): Promise<CsvFileInfo[]> {
  const response = await httpClient.get<CsvFileInfo[]>("/files");
  return response.data;
}

export async function fetchSchema(path: string): Promise<ColumnSchema[]> {
  const response = await httpClient.get<ColumnSchema[]>("/tables", {
    params: { path }
  });
  return response.data;
}

export async function fetchPreview(payload: PreviewRequest): Promise<PreviewResponse> {
  const response = await httpClient.post<PreviewResponse>("/preview", payload);
  return response.data;
}

export async function fetchSummary(path: string, columns?: string[]): Promise<SummaryResponse> {
  const response = await httpClient.post<SummaryResponse>("/summary", {
    path,
    columns
  });
  return response.data;
}

export async function fetchChartData(payload: ChartDataRequest): Promise<ChartDataResponse> {
  const response = await httpClient.post<ChartDataResponse>("/chart-data", payload);
  return response.data;
}

export async function locatePreviewValue(payload: PreviewLocateRequest): Promise<PreviewLocateResponse> {
  const response = await httpClient.post<PreviewLocateResponse>("/preview/locate", payload);
  return response.data;
}
