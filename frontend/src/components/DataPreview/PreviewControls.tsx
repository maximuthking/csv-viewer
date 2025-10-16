import styles from "./PreviewControls.module.css";

type PreviewControlsProps = {
  page: number;
  pageSize: number;
  totalRows: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

export function PreviewControls({
  page,
  pageSize,
  totalRows,
  isLoading,
  onPageChange,
  onPageSizeChange
}: PreviewControlsProps) {
  const totalPages = totalRows > 0 ? Math.ceil(totalRows / pageSize) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

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
