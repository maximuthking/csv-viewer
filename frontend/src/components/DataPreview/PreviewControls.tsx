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
    onSearch({
      column: columnInput,
      value: termInput.trim(),
      matchMode
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

  return (
    <div className={styles.controls}>
      <div className={styles.pagination}>
        <button type="button" disabled={!canPrev || isLoading} onClick={() => onPageChange(1)}>
          First
        </button>
        <button type="button" disabled={!canPrev || isLoading} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        <span className={styles.pageInfo}>
          Page {page} / {totalPages}
        </span>
        <button type="button" disabled={!canNext || isLoading} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
        <button type="button" disabled={!canNext || isLoading} onClick={() => onPageChange(totalPages)}>
          Last
        </button>
      </div>
      <div className={styles.search}>
        <form className={styles.searchForm} onSubmit={handleSubmit}>
          <label className={styles.columnSelect}>
            Column
            <select
              value={columnInput}
              onChange={(event) => setColumnInput(event.target.value)}
              disabled={isLoading || searchInProgress || columnOptions.length === 0}
            >
              {columnOptions.length === 0 ? (
                <option value="">No columns</option>
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
            Value
            <input
              type="text"
              value={termInput}
              onChange={(event) => setTermInput(event.target.value)}
              placeholder="Search value"
              disabled={isLoading || searchInProgress}
            />
          </label>
          <label className={styles.matchMode}>
            Match
            <select
              value={matchMode}
              onChange={(event) => setMatchMode(event.target.value as "contains" | "exact")}
              disabled={isLoading || searchInProgress}
            >
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
            </select>
          </label>
          <div className={styles.searchButtons}>
            <button
              type="submit"
              disabled={!canSearch || isLoading || searchInProgress}
              className={styles.searchButton}
            >
              {searchInProgress ? "Searching..." : "Find"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={searchInProgress}
              className={styles.clearButton}
            >
              Clear
            </button>
          </div>
        </form>
        {searchError ? (
          <p className={styles.searchError}>{searchError}</p>
        ) : lastMatchMessage ? (
          <p className={styles.searchHint}>{lastMatchMessage}</p>
        ) : null}
      </div>
      <label className={styles.pageSize}>
        Page size
        <select
          value={pageSize}
          disabled={isLoading}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size.toLocaleString()} rows
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
