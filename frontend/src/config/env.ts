const fallback = {
  apiBaseUrl: "http://localhost:8000",
  defaultPageSize: 200
} as const;

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? fallback.apiBaseUrl,
  defaultPageSize: Number(import.meta.env.VITE_DEFAULT_PAGE_SIZE ?? fallback.defaultPageSize)
};

if (!env.apiBaseUrl) {
  // eslint-disable-next-line no-console
  console.warn("VITE_API_BASE_URL가 설정되지 않아 기본값을 사용합니다.");
}

if (Number.isNaN(env.defaultPageSize) || env.defaultPageSize <= 0) {
  env.defaultPageSize = fallback.defaultPageSize;
}
