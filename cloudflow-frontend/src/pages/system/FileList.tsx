import React, { useEffect, useMemo, useState } from 'react';
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
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceBackdrop, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
import { SYS_UPLOAD_MAX_FILE_SIZE } from '../../constants/sysConfig';
import { useConfigInt } from '../../hooks/useSystemConfig';
import { deleteFile, getFileList, getFileStorageSummary, refreshFileStorageSummary, uploadFile } from '../../services/api/file';
import type { TenantStorageSummary } from '../../services/api/tenant';

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

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const FileList = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SysFile[]>([]);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageSummary, setStorageSummary] = useState<TenantStorageSummary | null>(null);
  const [params, setParams] = useState({
    pageNum: 1,
    pageSize: 10,
    fileName: '',
    fileType: '',
  });

  const [maxFileSizeMB] = useConfigInt(SYS_UPLOAD_MAX_FILE_SIZE, 50);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response: any = await getFileList(params);
      if (response && Array.isArray(response.rows)) {
        setData(response.rows);
        setTotal(response.total || 0);
      } else {
        setData([]);
        setTotal(0);
      }
    } catch (error) {
      console.error(error);
      toast.error('加载文件列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadStorageSummary = async () => {
    setStorageLoading(true);
    try {
      const summary = await getFileStorageSummary();
      setStorageSummary(summary);
    } catch (error) {
      console.error(error);
      setStorageSummary(null);
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize]);

  useEffect(() => {
    void loadStorageSummary();
  }, []);

  const handleSearch = async () => {
    setParams((prev) => ({ ...prev, pageNum: 1 }));
    await fetchData();
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > maxFileSizeMB * 1024 * 1024) {
      toast.error(`文件大小不能超过 ${maxFileSizeMB}MB`);
      return;
    }

    setUploading(true);
    try {
      await uploadFile(file);
      toast.success('上传成功');
      await Promise.all([fetchData(), loadStorageSummary()]);
    } catch (error: any) {
      toast.error(error?.message || '上传失败');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDelete = async (fileId: number) => {
    if (!window.confirm('确定要删除该文件吗？')) {
      return;
    }

    try {
      await deleteFile([fileId]);
      toast.success('删除成功');
      await Promise.all([fetchData(), loadStorageSummary()]);
    } catch (error) {
      console.error(error);
      toast.error('删除失败');
    }
  };

  const handleRefreshStorage = async () => {
    setStorageLoading(true);
    try {
      const summary = await refreshFileStorageSummary();
      setStorageSummary(summary);
      toast.success('存储空间已校准');
    } catch (error: any) {
      toast.error(error?.message || '校准存储失败');
    } finally {
      setStorageLoading(false);
    }
  };

  const formatSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatStorage = (mb?: number) => {
    if (!mb || mb <= 0) return '0 MB';
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb} MB`;
  };

  const getFileIcon = (type: string) => {
    const normalizedType = type.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(normalizedType)) {
      return <ImageIcon className="text-fuchsia-500" size={20} />;
    }
    if (normalizedType === 'pdf') {
      return <FileText className="text-rose-500" size={20} />;
    }
    if (['doc', 'docx'].includes(normalizedType)) {
      return <FileText className="text-sky-500" size={20} />;
    }
    if (['xls', 'xlsx'].includes(normalizedType)) {
      return <FileText className="text-emerald-500" size={20} />;
    }
    return <FileIcon className="text-slate-500" size={20} />;
  };

  const storagePercent = useMemo(() => {
    if (!storageSummary || !storageSummary.storageLimit) {
      return 0;
    }
    return Math.min(storageSummary.storageUsagePercent || 0, 100);
  }, [storageSummary]);

  const imageCount = useMemo(
    () => data.filter((file) => ['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(file.fileType.toLowerCase())).length,
    [data],
  );
  const docCount = useMemo(
    () => data.filter((file) => ['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(file.fileType.toLowerCase())).length,
    [data],
  );
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasActiveFilters = Boolean(params.fileName || params.fileType);
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));

  const overviewItems = [
    { label: '当前结果', value: `${data.length} 个文件` },
    { label: '图片', value: `${imageCount} 个` },
    { label: '文档', value: `${docCount} 个` },
    { label: '剩余空间', value: storageSummary ? formatStorage(storageSummary.remainingStorage) : '--' },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <HardDrive size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="文件管理"
          description="文件页同时承载上传、容量监控、搜索筛选和列表操作，所以重点统一信息模块和表格反馈，让它也进入同一套工作台系统。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleRefreshStorage()} disabled={storageLoading}>
                <RefreshCw size={15} className={storageLoading ? 'animate-spin' : ''} />
                {storageLoading ? '校准中' : '校准空间'}
              </Button>
              <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-4 py-2 text-sm font-medium text-white shadow-[0_14px_28px_rgba(236,72,153,0.22)] transition ${uploading ? 'pointer-events-none opacity-70' : ''}`}>
                <Upload size={15} />
                {uploading ? '上传中' : '上传文件'}
                <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="存储占用"
              value={`${storagePercent.toFixed(0)}%`}
              hint={storageSummary ? `已使用 ${formatStorage(storageSummary.storageUsed)} / ${formatStorage(storageSummary.storageLimit)}` : '正在加载租户存储概览'}
              aside={<HardDrive size={18} className="text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前页文件"
              value={data.length}
              hint="当前分页下已加载文件数量"
              aside={<FileIcon size={18} className="text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="上传上限"
              value={`${maxFileSizeMB}MB`}
              hint="单文件上传大小限制"
              aside={<Upload size={18} className="text-emerald-500" />}
            />
            <WorkspaceMetricCard
              label="剩余空间"
              value={storageSummary ? formatStorage(storageSummary.remainingStorage) : '--'}
              hint="租户级剩余可用空间"
              aside={<RefreshCw size={18} className="text-amber-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className="rounded-[28px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,250,252,0.72))] p-3.5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="文件列表"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              headerBadges={(
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    支持按类型快速筛选
                  </span>
                </div>
              )}
              quickFilterAside={hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setParams((prev) => ({ ...prev, fileName: '', fileType: '', pageNum: 1 }));
                    void fetchData();
                  }}
                >
                  清空筛选
                </Button>
              ) : (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前显示全部文件
                </span>
              )}
              filterBar={(
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      type="text"
                      placeholder="搜索文件名"
                      className="pl-10"
                      value={params.fileName}
                      onChange={(event) => setParams({ ...params, fileName: event.target.value })}
                    />
                  </div>

                  <Select value={params.fileType || 'all'} onValueChange={(value) => setParams({ ...params, fileType: value === 'all' ? '' : value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="文件类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      <SelectItem value="jpg">图片</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="docx">Word</SelectItem>
                      <SelectItem value="xlsx">Excel</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button type="button" onClick={() => void handleSearch()}>
                    <Search size={15} />
                    执行搜索
                  </Button>
                </div>
              )}
            />

            <WorkspaceResultCard
              total={total}
              description="上传、筛选、容量监控和文件操作都归到同一套工作台视觉语言下。"
              footer={(
                <WorkspacePaginationBar
                  total={total}
                  pageNum={params.pageNum}
                  totalPages={totalPages}
                  onPrev={() => setParams((prev) => ({ ...prev, pageNum: Math.max(1, prev.pageNum - 1) }))}
                  onNext={() => setParams((prev) => ({ ...prev, pageNum: Math.min(totalPages, prev.pageNum + 1) }))}
                  prevDisabled={params.pageNum === 1}
                  nextDisabled={params.pageNum >= totalPages}
                />
              )}
            >
              <div className="overflow-x-auto">
                <table className="min-w-[1120px] w-full table-auto text-left">
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
                  <tbody className="divide-y divide-white/60">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={6} type="loading" title="正在加载文件数据..." />
                    ) : data.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={6} title="暂无文件数据" description="可以先上传文件，再按名称或类型进行管理。" />
                    ) : (
                      data.map((file) => (
                        <tr key={file.fileId} className="border-b border-white/60 transition-colors hover:bg-white/60">
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="rounded-[14px] bg-white/84 p-2 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                                {getFileIcon(file.fileType)}
                              </div>
                              <div className="min-w-0">
                                <div className="max-w-md truncate text-sm font-medium text-slate-900" title={file.fileName}>
                                  {file.fileName}
                                </div>
                                <div className="mt-1 truncate text-xs text-slate-400" title={file.filePath}>
                                  {file.filePath}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-slate-500">{formatSize(file.fileSize)}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-white/82 px-2.5 py-1 text-xs font-semibold uppercase text-slate-600 ring-1 ring-slate-200/80">
                              {file.fileType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{file.createBy}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{file.createTime}</td>
                          <td className="px-4 py-3 text-right">
                            <TableRowActions
                              align="end"
                              wrap={false}
                              className="whitespace-nowrap"
                              actions={[
                                {
                                  label: '下载',
                                  icon: <Download size={14} />,
                                  onClick: () => window.open(file.url, '_blank', 'noopener,noreferrer'),
                                  tone: 'info',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => void handleDelete(file.fileId),
                                  tone: 'danger',
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default FileList;
