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

  return (
    <div className={styles.metaBar}>
      {schema.map((column) => (
        <button
          key={column.name}
          type="button"
          className={styles.chip}
          onClick={() => onFocusColumn?.(column.name)}
          title={column.name}
        >
          {column.name}
        </button>
      ))}
    </div>
  );
}
