import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import request from '@/services/api/request';
import { Button } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { VersionHistory } from './VersionHistory';

interface WorkflowInfo {
  processName?: string;
  workflowName?: string;
  name?: string;
  description?: string;
  createBy?: string;
  createdBy?: string;
}

const InvalidState: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <section className="admin-source-page">
    <TablePageLayout
      actions={(
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">WORKFLOW VERSIONS</p>
            <h2>版本历史</h2>
            <span>未能从当前地址中识别流程编号</span>
          </div>
          <div className="admin-source-controls">
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回上一页
            </Button>
          </div>
        </header>
      )}
      table={(
        <InnerTableSurface>
          <div className="px-6 py-9 text-center">
            <div className="admin-source-stat-icon mx-auto mb-3 flex h-10 w-10 items-center justify-center text-slate-400 dark:text-slate-500">
              <History className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">无效的流程 ID</div>
            <div className="mt-1.5 text-xs leading-6 text-slate-500 dark:text-slate-400">未能从当前地址中识别流程编号。</div>
          </div>
        </InnerTableSurface>
      )}
    />
  </section>
);

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
        const data = await request.get<WorkflowInfo>(`/workflow/wf/definition/${workflowId}`, {
          silent: true,
        });
        setWorkflowInfo(data || null);
      } catch (error) {
        console.error('加载流程信息失败:', error);
      }
    };

    void loadWorkflowInfo();
  }, [workflowId]);

  if (!workflowId) {
    return <InvalidState onBack={() => navigate(-1)} />;
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
