import clsx from "clsx";
import styles from "./FileBrowser.module.css";
import type { CsvFileInfo } from "../../types/api";

type FileBrowserProps = {
  files: CsvFileInfo[];
  selectedPath?: string;
  isLoading: boolean;
  error?: string;
  onSelect: (path: string) => void;
  onReload?: () => void;
};

export function FileBrowser({
  files,
  selectedPath,
  isLoading,
  error,
  onSelect,
  onReload
}: FileBrowserProps) {
  return (
    <aside className={styles.browser}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>CSV Files</h2>
          <p className={styles.subtitle}>Select a dataset to load preview and analytics.</p>
        </div>
        <button
          type="button"
          className={styles.reloadButton}
          onClick={onReload}
          disabled={isLoading}
        >
          Refresh
        </button>
      </div>
      {isLoading ? (
        <div className={styles.state}>Loading files...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : files.length === 0 ? (
        <div className={styles.state}>No CSV files detected.</div>
      ) : (
        <ul className={styles.list}>
          {files.map((file) => {
            const isSelected = selectedPath === file.path;
            const displayName = stripExtension(file.name);
            return (
              <li key={file.path}>
                <button
                  type="button"
                  className={clsx(styles.item, isSelected && styles.selected)}
                  onClick={() => onSelect(file.path)}
                >
                  <div className={styles.itemHeader}>
                    <span className={styles.fileName}>{displayName}</span>
                  </div>
                  <dl className={styles.meta}>
                    <div>
                      <dt>Size</dt>
                      <dd>{formatSize(file.size_bytes)}</dd>
                    </div>
                    <div>
                      <dt>Modified</dt>
                      <dd>{formatDate(file.modified_at)}</dd>
                    </div>
                  </dl>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function stripExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) {
    return name;
  }
  return name.slice(0, dotIndex);
}
