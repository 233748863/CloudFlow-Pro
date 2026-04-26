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
import { ConfirmDialog, Pagination } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableRowActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { SYS_UPLOAD_MAX_FILE_SIZE } from '../../constants/sysConfig';
import { useConfigInt } from '../../hooks/useSystemConfig';
import {
  deleteFile,
  getFileList,
  getFileStorageSummary,
  refreshFileStorageSummary,
  uploadFile,
} from '../../services/api/file';
import type { TenantStorageSummary } from '../../services/api/tenant';
import { cn } from '@/utils/cn';

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
  { value: 'jpg', label: '图片' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'Word' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'zip', label: '压缩包' },
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

const getNormalizedFileType = (type: string) => type.toLowerCase().replace(/^\./, '');

const isImageFile = (type: string) =>
  ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(getNormalizedFileType(type));

const isPdfFile = (type: string) => getNormalizedFileType(type) === 'pdf';

const isWordFile = (type: string) => ['doc', 'docx'].includes(getNormalizedFileType(type));

const isExcelFile = (type: string) => ['xls', 'xlsx', 'csv'].includes(getNormalizedFileType(type));

const isZipFile = (type: string) => ['zip', 'rar', '7z', 'tar', 'gz'].includes(getNormalizedFileType(type));

const getFileTypeLabel = (type: string) => {
  const normalizedType = getNormalizedFileType(type);
  if (isImageFile(normalizedType)) return '图片';
  if (isPdfFile(normalizedType)) return 'PDF';
  if (isWordFile(normalizedType)) return 'Word';
  if (isExcelFile(normalizedType)) return 'Excel';
  if (isZipFile(normalizedType)) return '压缩包';
  return normalizedType.toUpperCase() || '文件';
};

const getFileIcon = (type: string) => {
  const normalizedType = getNormalizedFileType(type);
  if (isImageFile(normalizedType)) {
    return <ImageIcon size={16} className="text-slate-500 dark:text-slate-400" />;
  }
  if (isPdfFile(normalizedType) || isWordFile(normalizedType) || isExcelFile(normalizedType)) {
    return <FileText size={16} className="text-slate-500 dark:text-slate-400" />;
  }
  return <FileIcon size={16} className="text-slate-500 dark:text-slate-400" />;
};

const getFileTypeBadgeClassName = () =>
  'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
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
    pageSize: 10,
    fileName: '',
    fileType: '',
  });
  const [filters, setFilters] = useState<FilterState>({
    fileName: '',
    fileType: ALL_FILE_TYPE,
  });

  const [maxFileSizeMB] = useConfigInt(SYS_UPLOAD_MAX_FILE_SIZE, 50);

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
      toast.error('删除失败');
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

  return (
    <>
      <TablePageLayout
        className="gap-4"
        filters={
          <div className="flex flex-wrap items-start justify-between gap-3">
            <form
              onSubmit={handleSearch}
              className="flex flex-1 flex-wrap items-center gap-3"
            >
              <div className="relative w-full sm:w-60">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.fileName}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, fileName: event.target.value }))
                  }
                  placeholder="搜索文件名"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-40">
                <Select
                  value={filters.fileType}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, fileType: value }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  重置
                </Button>
              ) : null}
            </form>

            <div className="flex flex-wrap items-center gap-2">
              {storageSummary ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatStorage(storageSummary.storageUsed)} / {formatStorage(storageSummary.storageLimit)}
                </span>
              ) : null}
              <Button variant="outline" size="sm" onClick={handleRefreshList} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshStorage}
                disabled={storageLoading}
              >
                <HardDrive size={15} className={cn(storageLoading && 'animate-spin')} />
                {storageLoading ? '校准中' : '校准空间'}
              </Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload size={15} />
                {uploading ? '上传中' : '上传文件'}
              </Button>
              {/* 复用原生文件选择器，避免再叠一层独立上传壳层。 */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </div>
          </div>
        }
        table={
          <>
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[38%]">文件名</TableHead>
                  <TableHead className="w-32">大小</TableHead>
                  <TableHead className="w-32">类型</TableHead>
                  <TableHead className="w-32">上传者</TableHead>
                  <TableHead className="w-48">上传时间</TableHead>
                  <TableActionHead className="w-32">操作</TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={6} title="正在加载文件列表..." loading />
                ) : error ? (
                  <TableStateRow colSpan={6} title="文件列表加载失败" description={error} />
                ) : data.length === 0 ? (
                  <TableStateRow colSpan={6} title="暂无文件数据" />
                ) : (
                  data.map((file) => (
                    <TableRow key={file.fileId}>
                      <TableCell className="py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/70">
                            {getFileIcon(file.fileType)}
                          </div>
                          <div className="min-w-0">
                            <div
                              className="max-w-md truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
                              title={file.fileName}
                            >
                              {file.fileName}
                            </div>
                            <div
                              className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500"
                              title={file.filePath}
                            >
                              {file.filePath}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {formatSize(file.fileSize)}
                      </TableCell>
                      <TableCell className="py-4">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase',
                            getFileTypeBadgeClassName(),
                          )}
                        >
                          {getFileTypeLabel(file.fileType)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        {file.createBy || '-'}
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">
                        {formatDateTime(file.createTime)}
                      </TableCell>
                      <TableCell>
                        <TableRowActions
                          align="end"
                          iconOnly
                          actions={[
                            {
                              label: '下载文件',
                              icon: <Download size={15} />,
                              onClick: () => window.open(file.url, '_blank', 'noopener,noreferrer'),
                              tone: 'neutral',
                            },
                            {
                              label: '删除文件',
                              icon: <Trash2 size={15} />,
                              onClick: () => setPendingDeleteFile(file),
                              tone: 'danger',
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        }
        pagination={
          total > 0 ? (
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
          ) : null
        }
      />

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
