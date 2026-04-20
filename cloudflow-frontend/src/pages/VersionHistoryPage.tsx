import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import request from '@/services/api/request';
import { Button } from '@/components/ui';
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
        icon={<AlertTriangle size={28} className="text-amber-500" />}
        title="无效的流程 ID"
        description="未能从当前地址中识别流程编号，请返回流程详情页后重试。"
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="rounded-xl"
          >
            返回上一页
          </Button>
        }
        iconWrapClassName="bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-300"
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
