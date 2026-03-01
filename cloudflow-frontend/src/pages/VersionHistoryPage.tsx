import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { VersionHistory } from './VersionHistory';

/**
 * 版本历史页面包装器
 * 从 URL 参数中获取 workflowId 并传递给 VersionHistory 组件
 */
export const VersionHistoryPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const [workflowInfo, setWorkflowInfo] = useState<any>(null);

  // 加载流程基本信息
  useEffect(() => {
    const loadWorkflowInfo = async () => {
      if (!workflowId) return;
      
      try {
        const response = await fetch(`/api/workflow/process/${workflowId}`);
        const result = await response.json();
        
        if (result.code === 200) {
          setWorkflowInfo(result.data);
        }
      } catch (error) {
        console.error('加载流程信息失败:', error);
      }
    };

    loadWorkflowInfo();
  }, [workflowId]);

  if (!workflowId) {
    return (
      <div className="p-6">
        <div className="text-center text-slate-500">无效的流程ID</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white rounded-xl shadow-sm border border-slate-200">
      {/* 页面头部 */}
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="返回"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {workflowInfo?.name || '流程'} - 版本历史
            </h1>
            {workflowInfo?.description && (
              <p className="text-sm text-slate-500 mt-1">{workflowInfo.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* 版本历史内容 */}
      <div className="overflow-y-auto" style={{ height: 'calc(100% - 73px)' }}>
        <VersionHistory 
          workflowId={workflowId} 
          workflowCreatorId={workflowInfo?.createdBy}
        />
      </div>
    </div>
  );
};

export default VersionHistoryPage;
