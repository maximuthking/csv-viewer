import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./PreviewControls.module.css";

type PreviewControlsProps = {
  page: number;
  pageSize: number;
  totalRows: number;
  isLoading: boolean;
  columns: string[];
  searchColumn?: string;
  searchTerm: string;
  searchInProgress: boolean;
  searchError?: string;
  lastMatch?: {
    page: number;
    globalRowIndex: number;
    column: string;
    value: unknown;
  };
  onSearch: (options: { column: string; value: string; matchMode: "contains" | "exact" }) => void;
  onClearSearch: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

type HistoryEntry = {
  id: number;
  column: string;
  value: string;
  matchMode: "contains" | "exact";
};

export function PreviewControls({
  page,
  pageSize,
  totalRows,
  isLoading,
  columns,
  searchColumn,
  searchTerm,
  searchInProgress,
  searchError,
  lastMatch,
  onSearch,
  onClearSearch,
  onPageChange,
  onPageSizeChange
}: PreviewControlsProps) {
  const totalPages = totalRows > 0 ? Math.ceil(totalRows / pageSize) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const columnOptions = useMemo(
    () => (columns.length > 0 ? columns : []),
    [columns]
  );

  const [columnInput, setColumnInput] = useState<string>(
    () => searchColumn && columnOptions.includes(searchColumn) ? searchColumn : columnOptions[0] ?? ""
  );
  const [termInput, setTermInput] = useState<string>(searchTerm);
  const [matchMode, setMatchMode] = useState<"contains" | "exact">("contains");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pageJump, setPageJump] = useState<string>("");

  useEffect(() => {
    const preferredColumn =
      searchColumn && columnOptions.includes(searchColumn)
        ? searchColumn
        : columnOptions[0] ?? "";
    setColumnInput((prev) => (prev === preferredColumn ? prev : preferredColumn));
  }, [columnOptions, searchColumn]);

  useEffect(() => {
    setTermInput(searchTerm);
  }, [searchTerm]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!columnInput) {
      return;
    }
    const trimmed = termInput.trim();
    onSearch({
      column: columnInput,
      value: trimmed,
      matchMode
    });
    if (!trimmed) {
      return;
    }
    setHistory((prev) => {
      const existingIndex = prev.findIndex(
        (entry) => entry.column === columnInput && entry.value === trimmed && entry.matchMode === matchMode
      );
      const nextEntry: HistoryEntry = {
        id: Date.now(),
        column: columnInput,
        value: trimmed,
        matchMode
      };
      const base = existingIndex >= 0 ? [prev[existingIndex], ...prev.slice(0, existingIndex), ...prev.slice(existingIndex + 1)] : [nextEntry, ...prev];
      return base.slice(0, 5);
    });
  };

  const handleClear = () => {
    setTermInput("");
    setMatchMode("contains");
    onClearSearch();
  };

  const canSearch = columnInput.length > 0 && termInput.trim().length > 0;

  const lastMatchMessage = useMemo(() => {
    if (!lastMatch) {
      return null;
    }
    const withinPage = (lastMatch.globalRowIndex % pageSize) + 1;
    const absoluteRow = lastMatch.globalRowIndex + 1;
    return `${lastMatch.column} = ${String(lastMatch.value ?? "")} → 페이지 ${lastMatch.page} / 행 ${withinPage} (전체 #${absoluteRow})`;
  }, [lastMatch, pageSize]);

  const handleHistorySelect = (entryId: number) => {
    const entry = history.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }
    setColumnInput(entry.column);
    setTermInput(entry.value);
    setMatchMode(entry.matchMode);
    onSearch({
      column: entry.column,
      value: entry.value,
      matchMode: entry.matchMode
    });
  };

  const handleJump = () => {
    const target = Number(pageJump);
    if (!Number.isInteger(target) || target < 1 || target > totalPages || isLoading) {
      return;
    }
    onPageChange(target);
  };

  return (
    <div className={styles.controls}>
      <div className={styles.controlRow}>
        <div className={styles.paginationSection}>
          <div className={styles.pagination}>
            <button type="button" disabled={!canPrev || isLoading} onClick={() => onPageChange(1)}>
              ⏮︎ 처음
            </button>
            <button type="button" disabled={!canPrev || isLoading} onClick={() => onPageChange(page - 1)}>
              ← 이전
            </button>
            <span className={styles.pageInfo}>
              페이지 {page} / {totalPages}
            </span>
            <button type="button" disabled={!canNext || isLoading} onClick={() => onPageChange(page + 1)}>
              다음 →
            </button>
            <button type="button" disabled={!canNext || isLoading} onClick={() => onPageChange(totalPages)}>
              마지막 ⏭︎
            </button>
          </div>
          <div className={styles.jumpRow}>
            <label>
              행 이동
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageJump}
                onChange={(event) => setPageJump(event.target.value)}
                placeholder="page #"
              />
            </label>
            <button type="button" onClick={handleJump} disabled={isLoading}>
              이동
            </button>
          </div>
          <label className={styles.pageSize}>
            페이지 크기
            <select
              value={pageSize}
              disabled={isLoading}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size.toLocaleString()} 행
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className={styles.controlRow}>
        <form className={styles.search} onSubmit={handleSubmit}>
          <label className={styles.columnSelect}>
            열 선택
            <select
              value={columnInput}
              onChange={(event) => setColumnInput(event.target.value)}
              disabled={isLoading || searchInProgress || columnOptions.length === 0}
            >
              {columnOptions.length === 0 ? (
                <option value="">열 없음</option>
              ) : (
                columnOptions.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className={styles.searchInput}>
            값
            <input
              type="text"
              value={termInput}
              onChange={(event) => setTermInput(event.target.value)}
              placeholder="Search value"
              disabled={isLoading || searchInProgress}
            />
          </label>
          <label className={styles.matchMode}>
            매칭 방식
            <select
              value={matchMode}
              onChange={(event) => setMatchMode(event.target.value as "contains" | "exact")}
              disabled={isLoading || searchInProgress}
            >
              <option value="contains">포함</option>
              <option value="exact">정확히 일치</option>
            </select>
          </label>
          <div className={styles.searchButtons}>
            <button
              type="submit"
              disabled={!canSearch || isLoading || searchInProgress}
              className={styles.searchButton}
            >
              {searchInProgress ? "검색 중..." : "검색"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={searchInProgress}
              className={styles.clearButton}
            >
              초기화
            </button>
          </div>
        </form>
        <div className={styles.historyRow}>
          <label>
            최근 검색
            <select
              value=""
              onChange={(event) => {
                const selected = Number(event.target.value);
                if (Number.isNaN(selected)) {
                  return;
                }
                handleHistorySelect(selected);
              }}
              disabled={history.length === 0 || isLoading}
            >
              <option value="">히스토리 선택</option>
              {history.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.column} · {item.value} ({item.matchMode})
                </option>
              ))}
            </select>
          </label>
        </div>
        {searchError ? (
          <p className={styles.searchError}>{searchError}</p>
        ) : lastMatchMessage ? (
          <p className={styles.searchHint}>{lastMatchMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
