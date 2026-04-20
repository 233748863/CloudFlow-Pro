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
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/common';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspacePaginationBar,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
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
const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';

const FILE_TYPE_OPTIONS = [
  { value: ALL_FILE_TYPE, label: '全部类型' },
  { value: 'jpg', label: '图片' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'Word' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'zip', label: '压缩包' },
] as const;

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

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
    return <ImageIcon className="text-fuchsia-500 dark:text-fuchsia-300" size={20} />;
  }
  if (isPdfFile(normalizedType)) {
    return <FileText className="text-rose-500 dark:text-rose-300" size={20} />;
  }
  if (isWordFile(normalizedType)) {
    return <FileText className="text-sky-500 dark:text-sky-300" size={20} />;
  }
  if (isExcelFile(normalizedType)) {
    return <FileText className="text-emerald-500 dark:text-emerald-300" size={20} />;
  }
  return <FileIcon className="text-slate-500 dark:text-slate-300" size={20} />;
};

const getFileTypeBadgeClassName = (type: string) => {
  const normalizedType = getNormalizedFileType(type);
  if (isImageFile(normalizedType)) {
    return 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/70 dark:bg-fuchsia-950/30 dark:text-fuchsia-200';
  }
  if (isPdfFile(normalizedType)) {
    return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';
  }
  if (isWordFile(normalizedType)) {
    return 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200';
  }
  if (isExcelFile(normalizedType)) {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  if (isZipFile(normalizedType)) {
    return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200';
  }
  return 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
};

const getStorageTone = (percent: number) => {
  if (percent >= 90) {
    return {
      bar: 'bg-rose-500',
      text: 'text-rose-600 dark:text-rose-300',
      hint: '容量接近上限，建议优先清理或扩容',
    };
  }

  if (percent >= 70) {
    return {
      bar: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-300',
      hint: '容量已进入关注区，建议提前校准和排查',
    };
  }

  return {
    bar: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-300',
    hint: '容量处于安全区间',
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
      const response: any = await getFileList(nextQuery);
      if (response && Array.isArray(response.rows)) {
        setData(response.rows);
        setTotal(response.total || 0);
      } else {
        setData([]);
        setTotal(0);
      }
    } catch (err) {
      console.error(err);
      const message = '加载文件列表失败，请稍后重试';
      setError(message);
      toast.error(message);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const loadStorageSummary = async () => {
    setStorageLoading(true);
    try {
      const summary = await getFileStorageSummary();
      setStorageSummary(summary);
    } catch (err) {
      console.error(err);
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
    setQuery((prev) => ({
      ...prev,
      pageNum: 1,
      fileName: filters.fileName.trim(),
      fileType: filters.fileType === ALL_FILE_TYPE ? '' : filters.fileType,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      fileName: '',
      fileType: ALL_FILE_TYPE,
    });
    setQuery((prev) => ({
      ...prev,
      pageNum: 1,
      fileName: '',
      fileType: '',
    }));
  };

  const handleRefreshList = () => {
    setQuery((prev) => ({ ...prev }));
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

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
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || '上传失败');
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
    } catch (err) {
      console.error(err);
      toast.error('删除失败');
    }
  };

  const handleRefreshStorage = async () => {
    setStorageLoading(true);
    try {
      const summary = await refreshFileStorageSummary();
      setStorageSummary(summary);
      toast.success('存储空间已校准');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || '校准存储失败');
    } finally {
      setStorageLoading(false);
    }
  };

  const storagePercent = useMemo(() => {
    if (!storageSummary || !storageSummary.storageLimit) {
      return 0;
    }
    return Math.min(storageSummary.storageUsagePercent || 0, 100);
  }, [storageSummary]);

  const currentPageTotalSize = useMemo(
    () => data.reduce((sum, file) => sum + Number(file.fileSize || 0), 0),
    [data],
  );
  const imageCount = useMemo(
    () => data.filter((file) => isImageFile(file.fileType)).length,
    [data],
  );
  const docCount = useMemo(
    () => data.filter((file) => isPdfFile(file.fileType) || isWordFile(file.fileType) || isExcelFile(file.fileType)).length,
    [data],
  );
  const archiveCount = useMemo(
    () => data.filter((file) => isZipFile(file.fileType)).length,
    [data],
  );

  const storageTone = getStorageTone(storagePercent);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasActiveFilters = Boolean(query.fileName || query.fileType);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const currentTypeLabel =
    FILE_TYPE_OPTIONS.find((option) => option.value === filters.fileType)?.label || '全部类型';

  const overviewItems = [
    { label: '当前结果', value: `${data.length} 个文件` },
    { label: '图片', value: `${imageCount} 个` },
    { label: '文档', value: `${docCount} 个` },
    { label: '压缩包', value: `${archiveCount} 个` },
  ];
  const heroMetrics = [
    {
      label: '存储占用',
      value: `${storagePercent.toFixed(0)}%`,
      hint: storageSummary
        ? `已使用 ${formatStorage(storageSummary.storageUsed)} / ${formatStorage(storageSummary.storageLimit)}`
        : '正在加载租户存储概览',
      icon: <HardDrive size={17} />,
    },
    {
      label: '当前页文件',
      value: `${data.length}`,
      hint: `本页合计 ${formatSize(currentPageTotalSize)}`,
      icon: <FileIcon size={17} />,
    },
    {
      label: '上传上限',
      value: `${maxFileSizeMB}MB`,
      hint: '单文件上传大小限制',
      icon: <Upload size={17} />,
    },
    {
      label: '剩余空间',
      value: storageSummary ? formatStorage(storageSummary.remainingStorage) : '--',
      hint: storageSummary ? storageTone.hint : '等待存储概览返回',
      icon: <RefreshCw size={17} />,
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <HardDrive size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="文件管理"
          description="文件页同时承载上传、容量监控、搜索筛选和列表操作，所以重点统一信息模块和表格反馈，让它也进入同一套工作台系统。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="lg"
                onClick={handleRefreshStorage}
                disabled={storageLoading}
              >
                <RefreshCw size={15} className={cn(storageLoading && 'animate-spin')} />
                {storageLoading ? '校准中' : '校准空间'}
              </Button>
              <Button
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={15} />
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
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 文件工作台
            </span>
            <span className={surfaceChipClassName}>当前类型：{currentTypeLabel}</span>
            <span className={surfaceChipClassName}>
              关键词：{query.fileName || '未设置'}
            </span>
            <span className={surfaceChipClassName}>
              上传上限 {maxFileSizeMB}MB
            </span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="文件筛选"
          title="文件工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>支持按类型快速筛选</span>
              <span className={surfaceChipClassName}>当前页 {data.length} 个</span>
              <span className={surfaceChipClassName}>
                本页大小 {formatSize(currentPageTotalSize)}
              </span>
            </div>
          )}
          quickFilterAside={(
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  清空筛选
                </Button>
              ) : (
                <span className={surfaceChipClassName}>当前显示全部文件</span>
              )}
            </div>
          )}
          filterBar={(
            <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                <Input
                  type="text"
                  placeholder="搜索文件名"
                  className="pl-10"
                  value={filters.fileName}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, fileName: event.target.value }))
                  }
                />
              </div>

              <Select
                value={filters.fileType}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, fileType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="文件类型" />
                </SelectTrigger>
                <SelectContent>
                  {FILE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button type="submit" className="xl:min-w-[120px]">
                <Search size={15} />
                执行搜索
              </Button>

              <Button
                type="button"
                variant="outline"
                className="xl:min-w-[120px]"
                onClick={handleRefreshList}
                disabled={loading}
              >
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
            </form>
          )}
        />

        <WorkspaceResultCard
          total={total}
          title="当前文件"
          description="上传、筛选、容量监控和文件操作都归到同一套工作台视觉语言下。"
          footer={(
            <WorkspacePaginationBar
              total={total}
              pageNum={query.pageNum}
              totalPages={totalPages}
              onPrev={() =>
                setQuery((prev) => ({
                  ...prev,
                  pageNum: Math.max(1, prev.pageNum - 1),
                }))
              }
              onNext={() =>
                setQuery((prev) => ({
                  ...prev,
                  pageNum: Math.min(totalPages, prev.pageNum + 1),
                }))
              }
              prevDisabled={query.pageNum === 1}
              nextDisabled={query.pageNum >= totalPages}
            />
          )}
        >
          <div className="space-y-4 px-4 py-4">
            <div className={subtlePanelClassName}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">存储与结果概况</div>
                  <div className="flex flex-wrap gap-2">
                    <span className={surfaceChipClassName}>文件总数 {total} 个</span>
                    <span className={surfaceChipClassName}>当前页 {data.length} 个</span>
                    <span className={surfaceChipClassName}>图片 {imageCount} 个</span>
                    <span className={surfaceChipClassName}>文档 {docCount} 个</span>
                    <span className={surfaceChipClassName}>压缩包 {archiveCount} 个</span>
                  </div>
                  <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                    文件页已经和 System 其他标准 CRUD 页统一为同一套壳层、表格和反馈规则，上传、删除和容量校准也同步纳入 Light/Dark 语法。
                  </div>
                </div>

                <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">租户存储占用</div>
                    <span className={cn('text-xs font-semibold', storageTone.text)}>
                      {storagePercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={cn('h-2 rounded-full transition-all', storageTone.bar)}
                      style={{ width: `${storagePercent}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={surfaceChipClassName}>
                      已使用 {storageSummary ? formatStorage(storageSummary.storageUsed) : '--'}
                    </span>
                    <span className={surfaceChipClassName}>
                      剩余 {storageSummary ? formatStorage(storageSummary.remainingStorage) : '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Table className="min-w-[1120px]">
              <TableHeader>
                <tr>
                  <TableHead className="w-[38%]">文件名</TableHead>
                  <TableHead className="w-32">大小</TableHead>
                  <TableHead className="w-40">类型</TableHead>
                  <TableHead className="w-32">上传者</TableHead>
                  <TableHead className="w-48">上传时间</TableHead>
                  <TableActionHead className="w-44">操作</TableActionHead>
                </tr>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={6} type="loading" title="正在加载文件数据..." />
                ) : error ? (
                  <WorkspaceTableStateRow
                    colSpan={6}
                    title="文件数据加载失败"
                    description={error}
                  />
                ) : data.length === 0 ? (
                  <WorkspaceTableStateRow
                    colSpan={6}
                    title="暂无文件数据"
                    description="可以先上传文件，再按名称或类型进行管理。"
                  />
                ) : (
                  data.map((file) => (
                    <TableRow key={file.fileId}>
                      <TableCell className="py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                            'rounded-full px-2.5 py-1 text-xs font-semibold uppercase',
                            getFileTypeBadgeClassName(file.fileType),
                          )}
                        >
                          {getFileTypeLabel(file.fileType)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        {file.createBy}
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">
                        {formatDateTime(file.createTime)}
                      </TableCell>
                      <TableCell className="py-4 text-right whitespace-nowrap">
                        <TableRowActions
                          align="end"
                          wrap={false}
                          className="whitespace-nowrap"
                          actions={[
                            {
                              label: '下载',
                              icon: <Download size={14} />,
                              onClick: () =>
                                window.open(file.url, '_blank', 'noopener,noreferrer'),
                              tone: 'info',
                            },
                            {
                              label: '删除',
                              icon: <Trash2 size={14} />,
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
          </div>
        </WorkspaceResultCard>

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
      </WorkspacePageContent>
    </div>
  );
};

export default FileList;
