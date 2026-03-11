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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button, Input } from '@/components/ui';
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
      const res: any = await getFileList(params);
      if (res && Array.isArray(res.rows)) {
        setData(res.rows);
        setTotal(res.total || 0);
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
    if (!file) {
      return;
    }

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
      toast.error(error?.message || '存储校准失败');
    } finally {
      setStorageLoading(false);
    }
  };

  const formatSize = (size: number) => {
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatStorage = (mb?: number) => {
    if (!mb || mb <= 0) {
      return '0 MB';
    }
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb} MB`;
  };

  const getFileIcon = (type: string) => {
    const normalizedType = type.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(normalizedType)) {
      return <ImageIcon className="text-purple-500" size={20} />;
    }
    if (normalizedType === 'pdf') {
      return <FileText className="text-red-500" size={20} />;
    }
    if (['doc', 'docx'].includes(normalizedType)) {
      return <FileText className="text-blue-500" size={20} />;
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

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">文件管理</h1>
          <p className="text-slate-500 mt-1">管理当前租户上传的附件文件和存储空间</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => void handleRefreshStorage()}
            className="gap-2"
            disabled={storageLoading}
          >
            <RefreshCw size={18} className={storageLoading ? 'animate-spin' : ''} />
            <span>{storageLoading ? '校准中...' : '校准空间'}</span>
          </Button>
          <label
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-xl hover:bg-pink-600 transition-all cursor-pointer shadow-lg shadow-pink-400/20 text-sm font-medium ${
              uploading ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            <Upload size={18} />
            <span>{uploading ? '上传中...' : '上传文件'}</span>
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <HardDrive size={18} className="text-pink-500" />
                <span>租户存储概览</span>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                {storageSummary
                  ? `已使用 ${formatStorage(storageSummary.storageUsed)} / ${formatStorage(storageSummary.storageLimit)}`
                  : '正在加载当前租户的存储使用情况'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">{storagePercent.toFixed(0)}%</div>
              <div className="text-xs text-slate-500">当前占用率</div>
            </div>
          </div>
          <div className="mt-4 w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${
                storagePercent >= 90 ? 'bg-red-500' : storagePercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="text-sm text-slate-500">剩余空间</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {storageSummary ? formatStorage(storageSummary.remainingStorage) : '--'}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            单文件上传上限 {maxFileSizeMB}MB，超过租户配额时会被直接拦截。
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap gap-4 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input
            type="text"
            placeholder="搜索文件名..."
            className="pl-10 w-64"
            value={params.fileName}
            onChange={(event) => setParams({ ...params, fileName: event.target.value })}
          />
        </div>

        <Select value={params.fileType || 'all'} onValueChange={(value) => setParams({ ...params, fileType: value === 'all' ? '' : value })}>
          <SelectTrigger className="w-[180px]">
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

        <Button
          variant="ghost"
          size="icon"
          onClick={() => void handleSearch()}
          className="hover:bg-slate-100"
          title="搜索"
        >
          <Search size={20} className="text-slate-600" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setParams({ ...params, fileName: '', fileType: '' });
            void fetchData();
          }}
          className="hover:bg-slate-100"
          title="重置"
        >
          <RefreshCw size={20} className="text-slate-600" />
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 font-semibold text-slate-700 text-sm">文件名</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-sm w-32">大小</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-sm w-32">类型</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-sm w-48">上传者</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-sm w-48">上传时间</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-sm w-32 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    加载中...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    暂无文件数据
                  </td>
                </tr>
              ) : (
                data.map((file) => (
                  <tr key={file.fileId} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg">{getFileIcon(file.fileType)}</div>
                        <div className="max-w-md truncate font-medium text-slate-700" title={file.fileName}>
                          {file.fileName}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm font-mono">{formatSize(file.fileSize)}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md uppercase font-bold">
                        {file.fileType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">{file.createBy}</td>
                    <td className="px-6 py-4 text-slate-500 text-sm">{file.createTime}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-pink-500 hover:bg-slate-100"
                          title="下载"
                          onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                        >
                          <Download size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => void handleDelete(file.fileId)}
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-500">共 {total} 条记录</div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={params.pageNum === 1}
              onClick={() => setParams({ ...params, pageNum: params.pageNum - 1 })}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.length < params.pageSize}
              onClick={() => setParams({ ...params, pageNum: params.pageNum + 1 })}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};