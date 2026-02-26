import React, { useEffect, useState } from 'react';
import { 
  FileText, Upload, Trash2, Search, 
  Image as ImageIcon, File as FileIcon, MoreVertical,
  Download, RefreshCw
} from 'lucide-react';
import { getFileList, uploadFile, deleteFile } from '../../services/api/file';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { toast } from 'sonner';
import { useConfigInt } from '../../hooks/useSystemConfig';
import { SYS_UPLOAD_MAX_FILE_SIZE } from '../../constants/sysConfig';

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
  const [params, setParams] = useState({
    pageNum: 1,
    pageSize: 10,
    fileName: '',
    fileType: ''
  });
  const [uploading, setUploading] = useState(false);

  // 从系统配置动态读取文件上传大小限制（MB）
  const [maxFileSizeMB] = useConfigInt(SYS_UPLOAD_MAX_FILE_SIZE, 50);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res: any = await getFileList(params);
      if (res && res.rows) {
        setData(res.rows);
        setTotal(res.total);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [params.pageNum, params.pageSize]);

  const handleSearch = () => {
    setParams({ ...params, pageNum: 1 });
    fetchData();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxFileSizeMB * 1024 * 1024) {
      toast.error(`文件大小不能超过${maxFileSizeMB}MB`);
      return;
    }

    setUploading(true);
    try {
      await uploadFile(file);
      toast.success("上传成功");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "上传失败");
    } finally {
      setUploading(false);
      // Clear input
      e.target.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该文件吗？')) return;
    try {
      await deleteFile([id]);
      toast.success("删除成功");
      fetchData();
    } catch (e: any) {
      toast.error("删除失败");
    }
  };

  const formatSize = (size: number) => {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB';
    return (size / 1024 / 1024).toFixed(2) + ' MB';
  };

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (['jpg', 'png', 'jpeg', 'gif', 'bmp'].includes(t)) return <ImageIcon className="text-purple-500" size={20} />;
    if (['pdf'].includes(t)) return <FileText className="text-red-500" size={20} />;
    if (['doc', 'docx'].includes(t)) return <FileText className="text-pink-400" size={20} />;
    if (['xls', 'xlsx'].includes(t)) return <FileText className="text-green-500" size={20} />;
    return <FileIcon className="text-slate-500" size={20} />;
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">文件管理</h1>
          <p className="text-slate-500 mt-1">管理系统上传的所有附件文件</p>
        </div>
        <div className="flex gap-3">
          <label className={`
            flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-xl hover:bg-pink-400 transition-colors cursor-pointer shadow-lg shadow-pink-400/20
            ${uploading ? 'opacity-70 cursor-not-allowed' : ''}
          `}>
            <Upload size={18} />
            <span>{uploading ? '上传中...' : '上传文件'}</span>
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap gap-4 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="搜索文件名..." 
            className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-pink-400/20 focus:rder-pink-400 transition-all"
            value={params.fileName}
            onChange={e => setParams({ ...params, fileName: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>
        
        <Select value={params.fileType} onValueChange={v => setParams({ ...params, fileType: v })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="所有类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">所有类型</SelectItem>
            <SelectItem value="png">PNG 图片</SelectItem>
            <SelectItem value="jpg">JPG 图片</SelectItem>
            <SelectItem value="pdf">PDF 文档</SelectItem>
            <SelectItem value="docx">Word 文档</SelectItem>
            <SelectItem value="xlsx">Excel 表格</SelectItem>
          </SelectContent>
        </Select>

        <button 
          onClick={handleSearch}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
        >
          <Search size={20} />
        </button>
        
        <button 
          onClick={() => {
              setParams({ ...params, fileName: '', fileType: '' });
              fetchData();
          }}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
          title="重置"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Table */}
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
                        <div className="p-2 bg-slate-100 rounded-lg">
                          {getFileIcon(file.fileType)}
                        </div>
                        <div className="max-w-md truncate font-medium text-slate-700" title={file.fileName}>
                          {file.fileName}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm font-mono">
                      {formatSize(file.fileSize)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md uppercase font-bold">
                        {file.fileType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {file.createBy}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {file.createTime}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-pink-500 rounded-lg transition-colors"
                            title="下载"
                        >
                            <Download size={16} />
                        </button>
                        <button 
                            className="p-1.5 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-colors"
                            onClick={() => handleDelete(file.fileId)}
                            title="删除"
                        >
                            <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            共 {total} 条记录
          </div>
          <div className="flex gap-2">
            <button 
              className="px-3 py-1 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
              disabled={params.pageNum === 1}
              onClick={() => setParams({ ...params, pageNum: params.pageNum - 1 })}
            >
              上一页
            </button>
            <button 
              className="px-3 py-1 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
              disabled={data.length < params.pageSize}
              onClick={() => setParams({ ...params, pageNum: params.pageNum + 1 })}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
