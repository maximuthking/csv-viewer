import axios from "axios";
import { env } from "../config/env";

export const httpClient = axios.create({
  baseURL: `${env.apiBaseUrl}/api/v1`,
  timeout: 30_000
});

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const message =
        error.response.data?.detail ??
        error.response.data?.message ??
        error.message;
      return Promise.reject(new Error(String(message)));
    }

    if (error.request) {
      return Promise.reject(new Error("서버 응답이 없습니다. 네트워크를 확인하세요."));
    }

    return Promise.reject(error);
  }
);
