import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import request from '@/services/api/request';
import { WorkspaceStatusPage } from '@/components/workspace/WorkspacePrimitives';
import { VersionHistory } from './VersionHistory';

interface WorkflowInfo {
  processName?: string;
  workflowName?: string;
  name?: string;
  description?: string;
  createBy?: string;
  createdBy?: string;
}

export const VersionHistoryPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const [workflowInfo, setWorkflowInfo] = useState<WorkflowInfo | null>(null);

  useEffect(() => {
    const loadWorkflowInfo = async () => {
      if (!workflowId) {
        return;
      }

      try {
        const data = await request.get<WorkflowInfo>(`/workflow/definition/${workflowId}`, {
          silent: true,
        });
        setWorkflowInfo(data || null);
      } catch (error) {
        console.error('加载流程信息失败:', error);
      }
    };

    loadWorkflowInfo();
  }, [workflowId]);

  if (!workflowId) {
    return (
      <WorkspaceStatusPage
        icon={<AlertTriangle size={28} />}
        title="无效的流程 ID"
        description="未能从当前地址中识别流程编号，请返回流程详情页后重试。"
        actions={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            返回上一页
          </button>
        }
      />
    );
  }

  return (
    <VersionHistory
      workflowId={workflowId}
      workflowCreatorId={workflowInfo?.createBy || workflowInfo?.createdBy}
      workflowName={workflowInfo?.processName || workflowInfo?.workflowName || workflowInfo?.name}
      workflowDescription={workflowInfo?.description}
      onBack={() => navigate(-1)}
    />
  );
};

export default VersionHistoryPage;
