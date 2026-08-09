import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  File as FileIcon,
  FileText,
  HardDrive,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { SYS_UPLOAD_MAX_FILE_SIZE, SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { useConfigInt, getConfigIntSync } from '../../hooks/useSystemConfig';
import { useDict } from '@/hooks/useDict';
import {
  deleteFile,
  getFileList,
  getFileStorageSummary,
  refreshFileStorageSummary,
  uploadFile,
} from '../../services/api/file';
import type { TenantStorageSummary } from '../../services/api/tenant';
import { cn } from '@/utils/cn';
import {
  getSystemFileTypeCategory,
  getSystemFileTypeLabel,
  SYSTEM_FILE_TYPE_CATEGORY,
  SYSTEM_FILE_TYPE_FILTER_OPTIONS,
} from '@/utils/enumLabels';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

interface SysFile {
  fileId: number;
  fileName: string;
  filePath: string;
  url: string;
  fileSize: number;
  fileType: string;
  createBy: string;
  createTime: string;
}

type QueryState = {
  pageNum: number;
  pageSize: number;
  fileName: string;
  fileType: string;
};

type FilterState = {
  fileName: string;
  fileType: string;
};

const ALL_FILE_TYPE = '__ALL_FILE_TYPE__';

const FILE_TYPE_OPTIONS = [
  { value: ALL_FILE_TYPE, label: '全部类型' },
  ...SYSTEM_FILE_TYPE_FILTER_OPTIONS,
] as const;

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const formatStorage = (mb?: number) => {
  if (!mb || mb <= 0) return '0 MB';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb} MB`;
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getFileIcon = (type: string) => {
  const category = getSystemFileTypeCategory(type);
  if (category === SYSTEM_FILE_TYPE_CATEGORY.IMAGE) {
    return <ImageIcon size={16} className="text-cf-subtle" />;
  }
  if (
    category === SYSTEM_FILE_TYPE_CATEGORY.PDF ||
    category === SYSTEM_FILE_TYPE_CATEGORY.WORD ||
    category === SYSTEM_FILE_TYPE_CATEGORY.EXCEL ||
    category === SYSTEM_FILE_TYPE_CATEGORY.PPT ||
    category === SYSTEM_FILE_TYPE_CATEGORY.TEXT
  ) {
    return <FileText size={16} className="text-cf-subtle" />;
  }
  return <FileIcon size={16} className="text-cf-subtle" />;
};

const getFileTypeBadgeClassName = () =>
  'border border-slate-200 bg-[var(--cf-surface-muted)] text-cf-muted dark:border-slate-700 dark:bg-slate-900/70';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr className="hover:bg-transparent dark:hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-cf-title">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-cf-subtle">
            {description}
          </div>
        ) : null}
      </div>
    </td>
  </tr>
);

const normalizeListResponse = (response: any): { rows: SysFile[]; total: number } => {
  if (Array.isArray(response?.rows)) {
    return {
      rows: response.rows,
      total: typeof response.total === 'number' ? response.total : response.rows.length,
    };
  }

  if (Array.isArray(response)) {
    return {
      rows: response,
      total: response.length,
    };
  }

  return {
    rows: [],
    total: 0,
  };
};

export const FileList = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTypeDict = useDict('sys_file_type');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SysFile[]>([]);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageSummary, setStorageSummary] = useState<TenantStorageSummary | null>(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<SysFile | null>(null);
  const [query, setQuery] = useState<QueryState>({
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    fileName: '',
    fileType: '',
  });
  const [filters, setFilters] = useState<FilterState>({
    fileName: '',
    fileType: ALL_FILE_TYPE,
  });

  const [maxFileSizeMB] = useConfigInt(SYS_UPLOAD_MAX_FILE_SIZE, 50);
  const fileTypeOptions = useMemo(() => {
    const dictOptions = fileTypeDict.getOptions();
    return [FILE_TYPE_OPTIONS[0], ...(dictOptions.length > 0 ? dictOptions : FILE_TYPE_OPTIONS.slice(1))];
  }, [fileTypeDict]);

  const getFileTypeDisplayLabel = (type: string) => {
    const category = getSystemFileTypeCategory(type);
    const dictLabel = fileTypeDict.getLabel(category);
    return dictLabel === category ? getSystemFileTypeLabel(type) : dictLabel;
  };

  const fetchData = async (nextQuery: QueryState) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getFileList(nextQuery);
      const normalized = normalizeListResponse(response);
      setData(normalized.rows);
      setTotal(normalized.total);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载文件列表失败，请稍后重试';
      setError(message);
      setData([]);
      setTotal(0);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const loadStorageSummary = async () => {
    setStorageLoading(true);

    try {
      const summary = await getFileStorageSummary();
      setStorageSummary(summary);
    } catch (fetchError) {
      console.error(fetchError);
      setStorageSummary(null);
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    void fetchData(query);
  }, [query]);

  useEffect(() => {
    void loadStorageSummary();
  }, []);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      fileName: filters.fileName.trim(),
      fileType: filters.fileType === ALL_FILE_TYPE ? '' : filters.fileType,
    }));
  };

  const handleReset = () => {
    setFilters({
      fileName: '',
      fileType: ALL_FILE_TYPE,
    });
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      fileName: '',
      fileType: '',
    }));
  };

  const handleRefreshList = () => {
    setQuery((current) => ({ ...current }));
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > maxFileSizeMB * 1024 * 1024) {
      toast.error(`文件大小不能超过 ${maxFileSizeMB}MB`);
      input.value = '';
      return;
    }

    setUploading(true);

    try {
      await uploadFile(file);
      toast.success('上传成功');
      await Promise.all([fetchData(query), loadStorageSummary()]);
    } catch (uploadError: any) {
      console.error(uploadError);
      toast.error(uploadError?.message || '上传失败');
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteFile) {
      return;
    }

    try {
      await deleteFile([pendingDeleteFile.fileId]);
      toast.success('删除成功');
      setPendingDeleteFile(null);
      await Promise.all([fetchData(query), loadStorageSummary()]);
    } catch (deleteError) {
      console.error(deleteError);
      toast.error(getErrorMessage(deleteError, '删除失败'));
    }
  };

  const handleRefreshStorage = async () => {
    setStorageLoading(true);

    try {
      const summary = await refreshFileStorageSummary();
      setStorageSummary(summary);
      toast.success('存储空间已校准');
    } catch (refreshError: any) {
      console.error(refreshError);
      toast.error(refreshError?.message || '校准存储失败');
    } finally {
      setStorageLoading(false);
    }
  };

  const hasActiveFilters = Boolean(query.fileName || query.fileType);
  const stats = useMemo(
    () => [
      {
        label: '文件总数',
        value: String(total),
        meta: `当前页 ${data.length}`,
        icon: <FileIcon size={18} />,
        tone: 'blue',
      },
      {
        label: '已用空间',
        value: formatStorage(storageSummary?.storageUsed),
        meta: `上限 ${formatStorage(storageSummary?.storageLimit)}`,
        icon: <HardDrive size={18} />,
        tone: 'green',
      },
      {
        label: '类型分布',
        value: String(new Set(data.map((file) => getSystemFileTypeCategory(file.fileType))).size),
        meta: query.fileType ? getFileTypeDisplayLabel(query.fileType) : '本页统计',
        icon: <FileText size={18} />,
        tone: 'amber',
      },
      {
        label: '上传状态',
        value: uploading ? '上传中' : '就绪',
        meta: `单文件 ${maxFileSizeMB} MB`,
        icon: <Upload size={18} />,
        tone: 'violet',
      },
    ],
    [data, maxFileSizeMB, query.fileType, storageSummary, total, uploading],
  );

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">FILE MANAGEMENT</p>
          <h2>文件管理</h2>
          <span>维护上传文件、类型、容量占用和存储校准</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefreshList} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshStorage}
            disabled={storageLoading}
          >
            <HardDrive size={16} className={cn(storageLoading && 'animate-spin')} />
            {storageLoading ? '校准中' : '校准空间'}
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={16} />
            {uploading ? '上传中' : '上传文件'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="admin-files-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">文件名</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.fileName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, fileName: event.target.value }))
              }
              placeholder="按文件名搜索"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className="input-label">文件类型</span>
          <Select
            value={filters.fileType}
            onValueChange={(value) =>
              setFilters((current) => ({ ...current, fileType: value }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              {fileTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">当前 {total} 项</span>
          <Button type="submit" size="sm">
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters}
          >
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-files-table-panel">
      <table
          className="unity-data-table admin-source-table admin-files-table min-w-[1040px]"
          style={{ minWidth: 1040 }}
        >
          <thead>
            <tr>
              <th className="w-[38%]">文件名</th>
              <th>大小</th>
              <th>类型</th>
              <th>上传者</th>
              <th>上传时间</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={6} title="正在加载文件列表..." loading />
            ) : error ? (
              <TableStateRow colSpan={6} title="文件列表加载失败" description={error} />
            ) : data.length === 0 ? (
              <TableStateRow colSpan={6} title="暂无文件数据" />
            ) : (
              data.map((file) => (
                <tr key={file.fileId}>
                  <td>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-2 dark:border-slate-800 dark:bg-slate-950">
                        {getFileIcon(file.fileType)}
                      </div>
                      <div className="min-w-0">
                        <div
                          className="max-w-md truncate text-sm font-semibold text-cf-title"
                          data-tooltip={file.fileName}
                        >
                          {file.fileName}
                        </div>
                        <div
                          className="mt-1 truncate text-xs text-cf-faint"
                          data-tooltip={file.filePath}
                        >
                          {file.filePath}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-cf-subtle">
                    {formatSize(file.fileSize)}
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getFileTypeBadgeClassName(),
                      )}
                    >
                      {getFileTypeDisplayLabel(file.fileType)}
                    </span>
                  </td>
                  <td className="text-sm text-cf-muted">
                    {file.createBy || '-'}
                  </td>
                  <td className="text-sm text-cf-subtle">
                    {formatDateTime(file.createTime)}
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button
                        type="button"
                        data-tooltip="下载文件" aria-label="下载文件"
                        onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                      >
                        <Download size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        data-tooltip="删除文件" aria-label="删除文件"
                        onClick={() => setPendingDeleteFile(file)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={query.pageNum}
      pageSize={query.pageSize}
      onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))}
      onPageSizeChange={(pageSize) =>
        setQuery((current) => ({
          ...current,
          pageNum: 1,
          pageSize,
        }))
      }
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-files-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <ConfirmDialog
        open={Boolean(pendingDeleteFile)}
        title="确认删除文件"
        message={
          pendingDeleteFile
            ? `确定要删除文件“${pendingDeleteFile.fileName}”吗？此操作不可恢复。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger={true}
        onCancel={() => setPendingDeleteFile(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default FileList;
