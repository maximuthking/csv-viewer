import { httpClient } from "./httpClient";
import type {
  ColumnSchema,
  CsvFileInfo,
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
