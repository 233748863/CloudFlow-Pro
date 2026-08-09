import React from 'react';
import { toast } from 'sonner';
import { FolderKanban, Handshake, Send, Target, TriangleAlert } from 'lucide-react';
import { crmApi } from '@/services/api/crm';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { useCrmManagement } from './store';
import { renderStatus } from './helpers';
import { OpportunityBoard } from './kanban/OpportunityBoard';

export const OpportunityTab: React.FC = () => {
  const { opportunities, openDialog, openCustomerWorkspace, setConfirm, goToProject, load } = useCrmManagement();
  return (
    <div className="admin-crm-opportunity-grid">
      <OpportunityBoard />

      <InnerTableSurface className="admin-crm-table-panel">
        <table className="unity-data-table admin-source-table admin-crm-table min-w-[900px]">
            <thead>
              <tr>
                <th>商机</th>
                <th>客户</th>
                <th>阶段</th>
                <th>金额 / 赢率</th>
                <th>最近跟进</th>
                <th>负责人</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((item) => (
                <tr key={item.opportunityId}>
                  <td><strong>{item.opportunityName}</strong></td>
                  <td>{item.customerName || '-'}</td>
                  <td>{renderStatus(item.stage)}</td>
                  <td><strong>{item.expectedAmount || 0}</strong><small>赢率 {item.winRate || 0}%</small></td>
                  <td>{formatDateTimeDisplay(item.latestFollowUpTime)}</td>
                  <td>{item.ownerName || '-'}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="客户360" aria-label="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Handshake size={15} /></button>
                      <button type="button" data-tooltip="编辑商机" aria-label="编辑商机" onClick={() => openDialog({ type: 'opportunity', item })}><Target size={15} /></button>
                      <button type="button" data-tooltip="赢单" aria-label="赢单" onClick={() => setConfirm({ action: 'winOpportunity', item })}><Send size={15} /></button>
                      <button type="button" data-tooltip="输单审批" aria-label="输单审批" onClick={() => setConfirm({ action: 'loseOpportunity', item: { ...item, lostReason: item.lostReason || '客户放弃' } })}><TriangleAlert size={15} /></button>
                      <button
                        type="button"
                        data-tooltip="转项目" aria-label="转项目"
                        onClick={async () => {
                            try {
                              const projectId = await crmApi.createProjectDraft(item.opportunityId!);
                              toast.success(`已生成项目草稿 #${projectId}`);
                              await load();
                              goToProject(projectId);
                            } catch (error) {
                              toast.error(getErrorMessage(error, '生成项目草稿失败'));
                            }
                          }}
                      >
                        <FolderKanban size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </InnerTableSurface>
    </div>
  );
};
