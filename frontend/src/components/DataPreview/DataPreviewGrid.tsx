import { useCallback, useMemo, useRef } from "react";
import type {
  ColDef,
  GridReadyEvent,
  SortChangedEvent,
  FilterChangedEvent,
  FilterModel,
  ITextFilterParams
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import styles from "./DataPreviewGrid.module.css";
import type { ColumnSchema } from "../../types/api";
import type { FilterSpec, SortSpec } from "../../state/useDashboardStore";

type DataPreviewGridProps = {
  schema: ColumnSchema[];
  rows: Array<Record<string, unknown>>;
  totalRows: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error?: string;
  sort: SortSpec[];
  filters: FilterSpec[];
  onSortChange: (sort: SortSpec[]) => void;
  onFilterChange: (filters: FilterSpec[]) => void;
  onReload: () => void;
};

export function DataPreviewGrid({
  schema,
  rows,
  totalRows,
  page,
  pageSize,
  isLoading,
  error,
  sort,
  filters,
  onSortChange,
  onFilterChange,
  onReload
}: DataPreviewGridProps) {
  const gridRef = useRef<AgGridReact>(null);

  const columnDefs = useMemo<ColDef[]>(() => {
    if (schema.length === 0 && rows.length > 0) {
      return Object.keys(rows[0]).map((key) => ({
        headerName: key,
        field: key,
        filter: "agTextColumnFilter",
        sortable: true,
        resizable: true,
        minWidth: 120
      }));
    }

    return schema.map((column) => ({
      headerName: column.name,
      field: column.name,
      filter: "agTextColumnFilter",
      sortable: true,
      resizable: true,
      minWidth: 140,
      cellClass: column.nullable ? styles.nullableCell : undefined,
      filterParams: {
        buttons: ["reset", "apply"],
        debounceMs: 250,
        caseSensitive: false,
        textFormatter: (value: string | null) => value?.toLowerCase() ?? "",
        trimInput: true
      } satisfies ITextFilterParams
    }));
  }, [rows, schema]);

  const defaultColDef = useMemo<ColDef>(
    () => ({
      flex: 1,
      minWidth: 120,
      filter: "agTextColumnFilter",
      sortable: true,
      resizable: true
    }),
    []
  );

  const onGridReady = useCallback(
    (event: GridReadyEvent) => {
      const { api } = event;

      if (sort.length > 0) {
        api.applyColumnState({
          defaultState: { sort: null, sortIndex: null },
          state: sort.map((item, index) => ({
            colId: item.column,
            sort: item.direction,
            sortIndex: index
          }))
        });
      }

      if (filters.length > 0) {
        const model = filters.reduce<FilterModel>((acc, filterSpec) => {
          acc[filterSpec.column] = {
            filterType: "text",
            type: "contains",
            filter: String(filterSpec.value ?? "")
          };
          return acc;
        }, {});
        api.setFilterModel(model);
      }
    },
    [filters, sort]
  );

  const handleSortChanged = useCallback(
    (event: SortChangedEvent) => {
      const columnState = event.api
        .getColumnState()
        .filter((state) => !!state.sort)
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

      const nextSort: SortSpec[] = columnState.map((state) => ({
        column: state.colId,
        direction: (state.sort ?? "asc") as SortSpec["direction"]
      }));

      onSortChange(nextSort);
    },
    [onSortChange]
  );

  const handleFilterChanged = useCallback(
    (event: FilterChangedEvent) => {
      const filterModel = event.api.getFilterModel();
      const appliedFilters: FilterSpec[] = Object.entries(filterModel).flatMap(
        ([columnId, model]) => {
          if (model == null || typeof model !== "object") {
            return [];
          }
          const candidate = model as {
            filter?: string | number | null;
            type?: string | null;
          };
          if (!candidate.filter) {
            return [];
          }
          return [
            {
              column: columnId,
              operator: "contains",
              value: candidate.filter
            } satisfies FilterSpec
          ];
        }
      );

      onFilterChange(appliedFilters);
    },
    [onFilterChange]
  );

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Data Preview</h2>
          <p className={styles.subtitle}>
            Page {page} · Rows {rows.length} / {totalRows} (page size {pageSize})
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={onReload} className={styles.reloadButton}>
            Refresh
          </button>
        </div>
      </header>
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <div className={`ag-theme-quartz ${styles.gridWrapper}`}>
          <AgGridReact
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            animateRows
            suppressAggFuncInHeader
            enableCellTextSelection
            ensureDomOrder
            pagination={false}
            overlayLoadingTemplate="<span class='ag-overlay-loading-center'>Loading data...</span>"
            onGridReady={onGridReady}
            onSortChanged={handleSortChanged}
            onFilterChanged={handleFilterChanged}
            suppressFieldDotNotation
            suppressDragLeaveHidesColumns
            suppressMenuHide
            tooltipShowDelay={0}
          />
          {isLoading && <div className={styles.loadingOverlay}>Fetching data...</div>}
        </div>
      )}
    </section>
  );
}
