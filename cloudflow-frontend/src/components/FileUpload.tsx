import React, { useState, useRef } from 'react';
import { Upload, X, FileText, Image as ImageIcon, Loader2, Paperclip } from 'lucide-react';
import { uploadFile } from '../services/api/file';
import { toast } from 'sonner';

/** 已上传文件信息 */
interface UploadedFile {
  url: string;
  name: string;
}

interface FileUploadProps {
  /** 当前附件URL（多个用逗号分隔） */
  value?: string;
  /** 附件变更回调，返回逗号分隔的URL字符串 */
  onChange: (urls: string) => void;
  /** 最大文件数量，默认5 */
  maxCount?: number;
  /** 允许的文件类型，默认常见文档和图片 */
  accept?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 提示文字 */
  hint?: string;
}

/**
 * 通用附件上传组件
 * 支持多文件上传，显示已上传文件列表，支持删除
 */
export const FileUpload: React.FC<FileUploadProps> = ({
  value = '',
  onChange,
  maxCount = 5,
  accept = '.jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar',
  disabled = false,
  hint = '支持图片、文档、压缩包等格式',
}) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 解析当前已上传的文件列表
  const fileList: UploadedFile[] = value
    ? value.split(',').filter(Boolean).map(url => ({
        url: url.trim(),
        name: url.trim().split('/').pop() || '附件',
      }))
    : [];

  // 判断文件是否为图片
  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);

  // 上传文件处理
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 检查数量限制
    if (fileList.length + files.length > maxCount) {
      toast.error(`最多上传 ${maxCount} 个文件`);
      return;
    }

    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // 单文件大小限制 20MB
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`文件 ${file.name} 超过20MB限制`);
          continue;
        }
        const res: any = await uploadFile(file);
        // 后端返回的文件URL，兼容不同返回格式
        const url = res?.url || res?.data?.url || res?.filePath || res;
        if (url) {
          newUrls.push(typeof url === 'string' ? url : String(url));
        }
      }
      if (newUrls.length > 0) {
        const allUrls = [...fileList.map(f => f.url), ...newUrls];
        onChange(allUrls.join(','));
        toast.success(`成功上传 ${newUrls.length} 个文件`);
      }
    } catch {
      toast.error('文件上传失败');
    } finally {
      setUploading(false);
      // 清空input，允许重复选择同一文件
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // 删除文件
  const handleRemove = (index: number) => {
    const newList = fileList.filter((_, i) => i !== index);
    onChange(newList.map(f => f.url).join(','));
  };

  return (
    <div className="space-y-2">
      {/* 已上传文件列表 */}
      {fileList.length > 0 && (
        <div className="space-y-1.5">
          {fileList.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 group"
            >
              {/* 文件图标 */}
              {isImage(file.url) ? (
                <ImageIcon size={16} className="text-blue-500 flex-shrink-0" />
              ) : (
                <FileText size={16} className="text-slate-500 flex-shrink-0" />
              )}
              {/* 文件名 */}
              <span className="text-sm text-slate-700 truncate flex-1" title={file.name}>
                {decodeURIComponent(file.name)}
              </span>
              {/* 删除按钮 */}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="删除"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 上传按钮 */}
      {!disabled && fileList.length < maxCount && (
        <label
          className={`
            flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg
            cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors
            ${uploading ? 'opacity-60 cursor-not-allowed' : ''}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            multiple={maxCount > 1}
            onChange={handleUpload}
            disabled={uploading || disabled}
          />
          {uploading ? (
            <Loader2 size={16} className="animate-spin text-indigo-500" />
          ) : (
            <Paperclip size={16} className="text-slate-400" />
          )}
          <span className="text-sm text-slate-500">
            {uploading ? '上传中...' : '点击上传附件'}
          </span>
          <span className="text-xs text-slate-400 ml-auto">
            {fileList.length}/{maxCount}
          </span>
        </label>
      )}

      {/* 提示文字 */}
      {hint && (
        <p className="text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
};

export default FileUpload;
