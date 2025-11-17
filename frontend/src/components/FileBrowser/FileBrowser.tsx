import { useMemo, useState } from "react";
import clsx from "clsx";
import { Clock3, SearchCheck } from "lucide-react";
import styles from "./FileBrowser.module.css";
import type { CsvFileInfo } from "../../types/api";

type FileBrowserProps = {
  files: CsvFileInfo[];
  recentFiles: string[];
  selectedPath?: string;
  isLoading: boolean;
  error?: string;
  onSelect: (path: string) => void;
  onReload?: () => void;
};

export function FileBrowser({
  files,
  recentFiles,
  selectedPath,
  isLoading,
  error,
  onSelect,
  onReload
}: FileBrowserProps) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "name" | "size" | "modified">("recent");

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const recentOrder = new Map(recentFiles.map((path, index) => [path, index]));
    const visible = files
      .filter((file) =>
        normalizedQuery.length === 0
          ? true
          : file.name.toLowerCase().includes(normalizedQuery) ||
            file.path.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => {
        switch (sortMode) {
          case "name":
            return a.name.localeCompare(b.name);
          case "size":
            return (b.size_bytes ?? 0) - (a.size_bytes ?? 0);
          case "modified":
            return new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime();
          case "recent":
          default: {
            const rankA = recentOrder.has(a.path) ? recentOrder.get(a.path)! : Number.POSITIVE_INFINITY;
            const rankB = recentOrder.has(b.path) ? recentOrder.get(b.path)! : Number.POSITIVE_INFINITY;
            if (rankA === rankB) {
              return new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime();
            }
            return rankA - rankB;
          }
        }
      });
    return visible;
  }, [files, query, sortMode, recentFiles]);

  const totalSize = useMemo(() => {
    const bytes = filteredFiles.reduce((acc, file) => acc + (file.size_bytes ?? 0), 0);
    return formatSize(bytes);
  }, [filteredFiles]);

  return (
    <aside className={styles.browser}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>데이터 카탈로그</h2>
          <p className={styles.subtitle}>EDA에 사용할 CSV 자산을 빠르게 탐색하세요.</p>
        </div>
        <div className={styles.headerButtons}>
          <select
            className={styles.sortSelect}
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as typeof sortMode)}
            disabled={isLoading}
          >
            <option value="recent">최근 사용</option>
            <option value="name">파일명</option>
            <option value="size">파일 크기</option>
            <option value="modified">수정일</option>
          </select>
          <button
            type="button"
            className={styles.reloadButton}
            onClick={onReload}
            disabled={isLoading}
          >
            Refresh
          </button>
        </div>
      </div>
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.search}
          placeholder="파일명, 경로나 태그로 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.catalogMeta}>
          <span>{filteredFiles.length} files</span>
          <span>{totalSize}</span>
        </div>
      </div>
      {isLoading ? (
        <div className={styles.state}>Loading files...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : filteredFiles.length === 0 ? (
        <div className={styles.state}>No CSV files detected.</div>
      ) : (
        <ul className={styles.list}>
          {filteredFiles.map((file) => {
            const isSelected = selectedPath === file.path;
            const displayName = stripExtension(file.name);
            const recentRank = recentFiles.indexOf(file.path);
            const isRecent = recentRank >= 0 && recentRank < 3;
            const badges = [
              isRecent ? { key: "recent", Icon: Clock3, label: "최근 사용" } : null,
              file.path === selectedPath ? { key: "active", Icon: SearchCheck, label: "현재 선택" } : null
            ].filter(Boolean) as Array<{ key: string; Icon: typeof Clock3; label: string }>;
            return (
              <li key={file.path}>
                <button
                  type="button"
                  className={clsx(styles.item, isSelected && styles.selected)}
                  onClick={() => onSelect(file.path)}
                >
                  <div className={styles.itemHeader}>
                    <span className={styles.fileName}>{displayName}</span>
                    <div className={styles.itemTags}>
                      {badges.map(({ key, Icon, label }) => (
                        <span key={key} className={styles.iconBadge} title={label} aria-label={label}>
                          <Icon aria-hidden="true" size={14} strokeWidth={2} />
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className={styles.path}>{file.path}</p>
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
                  <div className={styles.itemActions}>
                    <span className={styles.quickStat}>
                      행 수 정보는 로딩 후 요약 탭에서 제공합니다.
                    </span>
                    <div className={styles.actionButtons}>
                      <button
                        type="button"
                        onClick={() => onSelect(file.path)}
                        className={styles.primaryAction}
                      >
                        분석 전환
                      </button>
                      <button
                        type="button"
                        onClick={() => onReload?.()}
                        className={styles.secondaryAction}
                      >
                        메타데이터 새로고침
                      </button>
                    </div>
                  </div>
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
