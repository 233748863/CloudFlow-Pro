import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  X, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Loader2,
  Download,
  FileCheck,
  FileX,
  FileWarning,
  Info,
  ArrowLeft
} from 'lucide-react';
import { 
  validateImportFile, 
  importWorkflow, 
  importWorkflows,
  ValidationResult,
  ImportResult 
} from '../../services/api/workflow';
import { toast } from 'sonner';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';

/**
 * 文件状态
 */
interface FileWithStatus {
  file: File;
  status: 'pending' | 'validating' | 'valid' | 'invalid' | 'importing' | 'success' | 'failed' | 'skipped';
  validation?: ValidationResult;
  importResult?: ImportResult;
  conflictStrategy?: 'overwrite' | 'rename' | 'skip';
}

/**
 * 工作流导入组件
 * 支持单个和批量导入，文件验证，冲突处理
 * 权限控制：
 * - 所有登录用户可以导入流程
 * - 仅管理员可以批量导入
 */
export const WorkflowImport: React.FC = () => {
  const navigate = useNavigate();
  
  // 权限控制
  const { canImport, canImportBatch } = useWorkflowPermission();
  
  // 文件列表
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 全局冲突策略
  const [globalConflictStrategy, setGlobalConflictStrategy] = useState<'overwrite' | 'rename' | 'skip'>('skip');
  
  // 导入状态
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // 导入结果摘要
  const [importSummary, setImportSummary] = useState<{
    total: number;
    success: number;
    failed: number;
    skipped: number;
  } | null>(null);

  /**
   * 处理文件选择
   */
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: FileWithStatus[] = Array.from(selectedFiles).map(file => ({
      file,
      status: 'pending',
      conflictStrategy: globalConflictStrategy
    }));

    // 先添加文件到列表
    setFiles(prev => {
      const updatedFiles = [...prev, ...newFiles];
      
      // 异步验证新添加的文件
      setTimeout(() => {
        newFiles.forEach((_, index) => {
          validateFile(prev.length + index);
        });
      }, 100);
      
      return updatedFiles;
    });
  }, [globalConflictStrategy]);

  /**
   * 验证单个文件
   */
  const validateFile = async (index: number) => {
    const fileWithStatus = files[index];
    if (!fileWithStatus) return;

    // 更新状态为验证中
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, status: 'validating' as const } : f
    ));

    try {
      const validation = await validateImportFile(fileWithStatus.file);
      
      // 更新验证结果
      setFiles(prev => prev.map((f, i) => 
        i === index ? {
          ...f,
          status: validation.valid ? 'valid' as const : 'invalid' as const,
          validation
        } : f
      ));

      if (!validation.valid) {
        toast.error(`文件 ${fileWithStatus.file.name} 验证失败`);
      }
    } catch (error) {
      console.error('文件验证失败:', error);
      setFiles(prev => prev.map((f, i) => 
        i === index ? {
          ...f,
          status: 'invalid' as const,
          validation: {
            valid: false,
            errors: ['验证请求失败，请检查网络连接'],
            warnings: []
          }
        } : f
      ));
      toast.error(`文件 ${fileWithStatus.file.name} 验证失败`);
    }
  };

  /**
   * 移除文件
   */
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * 更新文件的冲突策略
   */
  const updateConflictStrategy = (index: number, strategy: 'overwrite' | 'rename' | 'skip') => {
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, conflictStrategy: strategy } : f
    ));
  };

  /**
   * 拖拽处理
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  /**
   * 执行导入
   */
  const handleImport = async () => {
    // 过滤出有效的文件
    const validFiles = files.filter(f => f.status === 'valid');
    
    if (validFiles.length === 0) {
      toast.error('没有可导入的有效文件');
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: validFiles.length });
    setImportSummary(null);

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    try {
      // 逐个导入文件
      for (let i = 0; i < validFiles.length; i++) {
        const fileWithStatus = validFiles[i];
        const fileIndex = files.indexOf(fileWithStatus);

        // 更新状态为导入中
        setFiles(prev => prev.map((f, idx) => 
          idx === fileIndex ? { ...f, status: 'importing' as const } : f
        ));

        setImportProgress({ current: i + 1, total: validFiles.length });

        try {
          const result = await importWorkflow(
            fileWithStatus.file, 
            fileWithStatus.conflictStrategy || globalConflictStrategy
          );

          // 更新导入结果
          setFiles(prev => prev.map((f, idx) => 
            idx === fileIndex ? {
              ...f,
              status: result.success ? 'success' as const : 
                     (result.action === 'skipped' ? 'skipped' as const : 'failed' as const),
              importResult: result
            } : f
          ));

          if (result.success) {
            successCount++;
            if (result.action === 'skipped') {
              skippedCount++;
            }
          } else {
            failedCount++;
          }
        } catch (error: any) {
          console.error('导入失败:', error);
          failedCount++;
          
          setFiles(prev => prev.map((f, idx) => 
            idx === fileIndex ? {
              ...f,
              status: 'failed' as const,
              importResult: {
                success: false,
                workflowName: fileWithStatus.file.name,
                action: 'skipped' as const,
                errors: [error.message || '导入失败']
              }
            } : f
          ));
        }
      }

      // 设置导入摘要
      setImportSummary({
        total: validFiles.length,
        success: successCount,
        failed: failedCount,
        skipped: skippedCount
      });

      // 显示结果提示
      if (failedCount === 0) {
        toast.success(`成功导入 ${successCount} 个流程`);
      } else {
        toast.warning(`导入完成：成功 ${successCount} 个，失败 ${failedCount} 个`);
      }
    } catch (error) {
      console.error('批量导入失败:', error);
      toast.error('批量导入失败');
    } finally {
      setImporting(false);
    }
  };

  /**
   * 清空所有文件
   */
  const clearAll = () => {
    setFiles([]);
    setImportSummary(null);
  };

  /**
   * 重新导入失败的文件
   */
  const retryFailed = () => {
    setFiles(prev => prev.map(f => 
      f.status === 'failed' ? { ...f, status: 'valid' as const } : f
    ));
    setImportSummary(null);
  };

  // 统计各状态的文件数量
  const stats = {
    total: files.length,
    pending: files.filter(f => f.status === 'pending').length,
    validating: files.filter(f => f.status === 'validating').length,
    valid: files.filter(f => f.status === 'valid').length,
    invalid: files.filter(f => f.status === 'invalid').length,
    importing: files.filter(f => f.status === 'importing').length,
    success: files.filter(f => f.status === 'success').length,
    failed: files.filter(f => f.status === 'failed').length,
    skipped: files.filter(f => f.status === 'skipped').length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workflow/management')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="返回流程管理"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">流程导入</h2>
            <p className="text-slate-500 mt-1 text-sm">导入流程定义文件，支持批量导入和冲突处理</p>
          </div>
        </div>
      </div>

      {/* 全局设置 */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">全局冲突策略</h3>
            <p className="text-xs text-slate-500">当导入的流程名称已存在时的处理方式</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGlobalConflictStrategy('skip')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                globalConflictStrategy === 'skip'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              跳过
            </button>
            <button
              onClick={() => setGlobalConflictStrategy('rename')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                globalConflictStrategy === 'rename'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              重命名
            </button>
            <button
              onClick={() => setGlobalConflictStrategy('overwrite')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                globalConflictStrategy === 'overwrite'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              覆盖
            </button>
          </div>
        </div>

        {/* 策略说明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium">
                {globalConflictStrategy === 'skip' && '跳过：保留现有流程，不导入冲突的文件'}
                {globalConflictStrategy === 'rename' && '重命名：自动为导入的流程生成新名称（原名称_副本_序号）'}
                {globalConflictStrategy === 'overwrite' && '覆盖：替换现有流程，创建新版本（谨慎使用）'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 文件上传区域 */}
      <div
        className={`bg-white rounded-xl p-8 shadow-sm border-2 border-dashed transition-all ${
          isDragging 
            ? 'border-pink-400 bg-pink-50' 
            : 'border-slate-300 hover:border-pink-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <div className={`p-4 rounded-full ${isDragging ? 'bg-pink-100' : 'bg-slate-100'}`}>
            <Upload size={32} className={isDragging ? 'text-pink-500' : 'text-slate-400'} />
          </div>
          
          <div className="text-center">
            <p className="text-slate-700 font-medium mb-1">
              拖拽文件到此处，或点击选择文件
            </p>
            <p className="text-xs text-slate-500">
              支持 JSON 格式的流程定义文件，可同时选择多个文件
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".json,application/json"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2"
          >
            <Upload size={16} />
            选择文件
          </button>
        </div>
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* 列表头部 */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-600">
                共 <span className="font-bold text-slate-800">{stats.total}</span> 个文件
              </span>
              {stats.valid > 0 && (
                <span className="text-green-600">
                  <CheckCircle2 size={14} className="inline mr-1" />
                  {stats.valid} 个有效
                </span>
              )}
              {stats.invalid > 0 && (
                <span className="text-red-600">
                  <AlertCircle size={14} className="inline mr-1" />
                  {stats.invalid} 个无效
                </span>
              )}
              {stats.success > 0 && (
                <span className="text-blue-600">
                  <FileCheck size={14} className="inline mr-1" />
                  {stats.success} 个成功
                </span>
              )}
              {stats.failed > 0 && (
                <span className="text-orange-600">
                  <FileX size={14} className="inline mr-1" />
                  {stats.failed} 个失败
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {stats.failed > 0 && !importing && (
                <button
                  onClick={retryFailed}
                  className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all"
                >
                  重试失败
                </button>
              )}
              <button
                onClick={clearAll}
                disabled={importing}
                className="px-3 py-1.5 text-xs bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-all disabled:opacity-50"
              >
                清空列表
              </button>
            </div>
          </div>

          {/* 文件列表 */}
          <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
            {files.map((fileWithStatus, index) => (
              <FileItem
                key={index}
                fileWithStatus={fileWithStatus}
                onRemove={() => removeFile(index)}
                onUpdateStrategy={(strategy) => updateConflictStrategy(index, strategy)}
                disabled={importing}
              />
            ))}
          </div>

          {/* 导入按钮 */}
          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                {importing && (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-pink-500" />
                    正在导入 {importProgress.current}/{importProgress.total}...
                  </span>
                )}
              </div>
              
              <button
                onClick={handleImport}
                disabled={importing || stats.valid === 0}
                className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    开始导入 ({stats.valid})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入结果摘要 */}
      {importSummary && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-500" />
            导入完成
          </h3>
          
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-slate-800">{importSummary.total}</div>
              <div className="text-xs text-slate-500 mt-1">总计</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{importSummary.success}</div>
              <div className="text-xs text-green-600 mt-1">成功</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{importSummary.failed}</div>
              <div className="text-xs text-orange-600 mt-1">失败</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{importSummary.skipped}</div>
              <div className="text-xs text-blue-600 mt-1">跳过</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 文件项组件
 */
interface FileItemProps {
  fileWithStatus: FileWithStatus;
  onRemove: () => void;
  onUpdateStrategy: (strategy: 'overwrite' | 'rename' | 'skip') => void;
  disabled: boolean;
}

const FileItem: React.FC<FileItemProps> = ({ 
  fileWithStatus, 
  onRemove, 
  onUpdateStrategy,
  disabled 
}) => {
  const { file, status, validation, importResult, conflictStrategy } = fileWithStatus;

  // 状态图标
  const StatusIcon = () => {
    switch (status) {
      case 'pending':
        return <FileText size={16} className="text-slate-400" />;
      case 'validating':
        return <Loader2 size={16} className="animate-spin text-blue-500" />;
      case 'valid':
        return <CheckCircle2 size={16} className="text-green-500" />;
      case 'invalid':
        return <AlertCircle size={16} className="text-red-500" />;
      case 'importing':
        return <Loader2 size={16} className="animate-spin text-pink-500" />;
      case 'success':
        return <FileCheck size={16} className="text-blue-500" />;
      case 'failed':
        return <FileX size={16} className="text-orange-500" />;
      case 'skipped':
        return <FileWarning size={16} className="text-yellow-500" />;
      default:
        return <FileText size={16} className="text-slate-400" />;
    }
  };

  // 状态文本
  const statusText = {
    pending: '等待验证',
    validating: '验证中...',
    valid: '验证通过',
    invalid: '验证失败',
    importing: '导入中...',
    success: '导入成功',
    failed: '导入失败',
    skipped: '已跳过'
  }[status];

  return (
    <div className="p-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-3">
        {/* 状态图标 */}
        <div className="mt-1">
          <StatusIcon />
        </div>

        {/* 文件信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-800 truncate">
              {file.name}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              status === 'valid' ? 'bg-green-100 text-green-600' :
              status === 'invalid' ? 'bg-red-100 text-red-600' :
              status === 'success' ? 'bg-blue-100 text-blue-600' :
              status === 'failed' ? 'bg-orange-100 text-orange-600' :
              status === 'skipped' ? 'bg-yellow-100 text-yellow-600' :
              'bg-slate-100 text-slate-600'
            }`}>
              {statusText}
            </span>
          </div>

          {/* 文件大小 */}
          <div className="text-xs text-slate-500 mb-2">
            {(file.size / 1024).toFixed(2)} KB
          </div>

          {/* 验证信息 */}
          {validation && (
            <div className="space-y-1 mb-2">
              {validation.workflowName && (
                <div className="text-xs text-slate-600">
                  流程名称: <span className="font-medium">{validation.workflowName}</span>
                  {validation.version && ` (v${validation.version})`}
                </div>
              )}
              
              {/* 错误信息 */}
              {validation.errors && validation.errors.length > 0 && (
                <div className="space-y-1">
                  {validation.errors.map((error, idx) => (
                    <div key={idx} className="flex items-start gap-1 text-xs text-red-600">
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 警告信息 */}
              {validation.warnings && validation.warnings.length > 0 && (
                <div className="space-y-1">
                  {validation.warnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-1 text-xs text-yellow-600">
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 不支持的节点类型 */}
              {validation.unsupportedNodeTypes && validation.unsupportedNodeTypes.length > 0 && (
                <div className="text-xs text-red-600">
                  不支持的节点类型: {validation.unsupportedNodeTypes.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* 导入结果 */}
          {importResult && (
            <div className="space-y-1 mb-2">
              {importResult.message && (
                <div className="text-xs text-slate-600">{importResult.message}</div>
              )}
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="space-y-1">
                  {importResult.errors.map((error, idx) => (
                    <div key={idx} className="flex items-start gap-1 text-xs text-red-600">
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}
              {importResult.warnings && importResult.warnings.length > 0 && (
                <div className="space-y-1">
                  {importResult.warnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-1 text-xs text-yellow-600">
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 冲突策略选择（仅在验证通过时显示） */}
          {status === 'valid' && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500">冲突策略:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => onUpdateStrategy('skip')}
                  disabled={disabled}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    conflictStrategy === 'skip'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  跳过
                </button>
                <button
                  onClick={() => onUpdateStrategy('rename')}
                  disabled={disabled}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    conflictStrategy === 'rename'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  重命名
                </button>
                <button
                  onClick={() => onUpdateStrategy('overwrite')}
                  disabled={disabled}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    conflictStrategy === 'overwrite'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  覆盖
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 删除按钮 */}
        {!disabled && status !== 'importing' && (
          <button
            onClick={onRemove}
            className="text-slate-400 hover:text-red-500 transition-colors mt-1"
            title="移除"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default WorkflowImport;
