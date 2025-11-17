import styles from "./ColumnMetaBar.module.css";
import type { ColumnSchema } from "../../types/api";
import type { FilterSpec, SortSpec } from "../../state/useDashboardStore";

type ColumnMetaBarProps = {
  schema: ColumnSchema[];
  sort: SortSpec[];
  filters: FilterSpec[];
  onFocusColumn?: (column: string) => void;
};

export function ColumnMetaBar({ schema, sort, filters, onFocusColumn }: ColumnMetaBarProps) {
  if (schema.length === 0) {
    return (
      <div className={styles.emptyState}>
        스키마 정보를 불러오는 중입니다. 파일을 선택하면 컬럼 프로파일이 표시됩니다.
      </div>
    );
  }

  const sortMap = new Map(sort.map((item, index) => [item.column, { ...item, index }]));
  const filterSet = new Set(filters.map((item) => item.column));

  return (
    <div className={styles.metaBar}>
      {schema.map((column) => {
        const sortInfo = sortMap.get(column.name);
        const filterActive = filterSet.has(column.name);
        const nullable = column.nullable ?? false;
        const dtype = column.dtype?.toUpperCase() ?? "UNKNOWN";
        return (
          <button
            key={column.name}
            type="button"
            className={styles.chip}
            onClick={() => onFocusColumn?.(column.name)}
          >
            <div className={styles.chipTop}>
              <span className={styles.chipName}>{column.name}</span>
              <span className={styles.dtype}>{dtype}</span>
            </div>
            <div className={styles.chipBottom}>
              {nullable ? <span className={styles.nullable}>nullable</span> : <span className={styles.notNull}>required</span>}
              {sortInfo ? (
                <span className={styles.sortBadge}>
                  {sortInfo.direction === "asc" ? "▲" : "▼"} {sortInfo.index + 1}
                </span>
              ) : null}
              {filterActive ? <span className={styles.filterBadge}>filter</span> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
