import React, { useState, useRef } from 'react';
import { Upload, X, FileText, Image as ImageIcon, Loader2, Paperclip } from 'lucide-react';
import { uploadFile } from '../services/api/file';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { getAttachmentDisplayName, getAttachmentRawValue, isAttachmentImage } from '@/utils/attachment';
import { useConfigInt, useConfigValue } from '../hooks/useSystemConfig';
import { SYS_UPLOAD_MAX_FILE_SIZE, SYS_UPLOAD_ALLOWED_TYPES } from '../constants/sysConfig';
import { cn } from '@/utils/cn';

/** 已上传文件信息 */
interface UploadedFile {
  url: string;
  raw: string;
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
  accept,
  disabled = false,
  hint,
}) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 从系统配置动态读取文件上传限制
  const [maxFileSizeMB] = useConfigInt(SYS_UPLOAD_MAX_FILE_SIZE, 50);
  const [allowedTypes] = useConfigValue(SYS_UPLOAD_ALLOWED_TYPES, 'jpg,jpeg,png,gif,bmp,doc,docx,xls,xlsx,ppt,pptx,pdf,txt,zip,rar');

  // 如果外部未传入 accept，则根据系统配置生成
  const resolvedAccept = accept ?? allowedTypes.split(',').map(t => `.${t.trim()}`).join(',');
  // 如果外部未传入 hint，则根据配置动态生成
  const resolvedHint = hint ?? `支持 ${allowedTypes} 格式，单文件不超过 ${maxFileSizeMB}MB`;

  // 解析当前已上传的文件列表
  const fileList: UploadedFile[] = value
    ? value.split(',').filter(Boolean).map((item) => {
        const raw = item.trim();
        return {
          url: raw,
          raw,
          name: getAttachmentDisplayName(raw),
        };
      })
    : [];

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
        // 单文件大小限制，从系统配置读取
        if (file.size > maxFileSizeMB * 1024 * 1024) {
          toast.error(`文件 ${file.name} 超过${maxFileSizeMB}MB限制`);
          continue;
        }
        const res: any = await uploadFile(file);
        const path = res?.filePath || res?.data?.filePath || res?.path;
        if (path) {
          newUrls.push(typeof path === 'string' ? path : String(path));
        }
      }
      if (newUrls.length > 0) {
        const allUrls = [...fileList.map((f) => f.raw), ...newUrls];
        onChange(allUrls.join(','));
        toast.success(`成功上传 ${newUrls.length} 个文件`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '文件上传失败'));
    } finally {
      setUploading(false);
      // 清空input，允许重复选择同一文件
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // 删除文件
  const handleRemove = (index: number) => {
    const newList = fileList.filter((_, i) => i !== index);
    onChange(newList.map((f) => f.raw).join(','));
  };

  return (
    <div className="admin-dialog-stack gap-2.5">
      {/* 已上传文件列表 */}
      {fileList.length > 0 && (
        <div className="grid gap-2">
          {fileList.map((file, index) => (
            <div
              key={index}
              className="p-4 group flex items-center gap-2 border border-slate-200 bg-[var(--cf-surface-muted)] p-2 transition dark:border-slate-800 dark:bg-slate-900"
            >
              {/* 文件图标 */}
              {isAttachmentImage(file.raw) ? (
                <ImageIcon size={16} className="text-cyan-500 flex-shrink-0" />
              ) : (
                <FileText size={16} className="text-cf-subtle flex-shrink-0" />
              )}
              {/* 文件名 */}
              <span className="text-sm text-cf-body truncate flex-1" data-tooltip={file.name}>
                {decodeURIComponent(file.name)}
              </span>
              {/* 删除按钮 */}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="flex-shrink-0 text-cf-faint opacity-100 transition-opacity hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:text-red-300"
                  data-tooltip="删除" aria-label="删除"
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
          className={cn(
            'p-4 flex cursor-pointer items-center gap-2 border-2 border-dashed border-slate-300 px-3 py-2 transition-colors hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:hover:border-cyan-800 dark:hover:bg-slate-900/70',
            uploading && 'cursor-not-allowed opacity-60',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={resolvedAccept}
            multiple={maxCount > 1}
            onChange={handleUpload}
            disabled={uploading || disabled}
          />
          {uploading ? (
            <Loader2 size={16} className="animate-spin text-cyan-500" />
          ) : (
            <Paperclip size={16} className="text-cyan-500" />
          )}
          <span className="text-sm text-cf-subtle">
            {uploading ? '上传中...' : '点击上传附件'}
          </span>
          <span className="ml-auto text-xs text-cf-faint">
            {fileList.length}/{maxCount}
          </span>
        </label>
      )}

      {/* 提示文字 */}
      {resolvedHint && (
        <p className="text-xs text-cf-faint">{resolvedHint}</p>
      )}
    </div>
  );
};

export default FileUpload;
