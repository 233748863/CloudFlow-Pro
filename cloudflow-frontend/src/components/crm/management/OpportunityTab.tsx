import React from 'react';
import { toast } from 'sonner';
import { FolderKanban, Handshake, Send, Target, TriangleAlert } from 'lucide-react';
import { Card, TableHead, TableHeader, TableActionHead, TableRowActions } from '@/components/common';
import { crmApi } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { useCrmManagement } from './store';
import { renderStatus } from './helpers';
import { OpportunityBoard } from './kanban/OpportunityBoard';

export const OpportunityTab: React.FC = () => {
  const { opportunities, openDialog, openCustomerWorkspace, setConfirm, goToProject, load } = useCrmManagement();
  return (
    <div className="space-y-4">
      <OpportunityBoard />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <TableHeader>
              <tr>
                <TableHead>商机</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>阶段</TableHead>
                <TableHead>金额 / 赢率</TableHead>
                <TableHead>最近跟进</TableHead>
                <TableHead>负责人</TableHead>
                <TableActionHead>操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {opportunities.map((item) => (
                <tr key={item.opportunityId}>
                  <td className="px-4 py-3 text-sm">{item.opportunityName}</td>
                  <td className="px-4 py-3 text-sm">{item.customerName || '-'}</td>
                  <td className="px-4 py-3 text-sm">{renderStatus(item.stage)}</td>
                  <td className="px-4 py-3 text-sm">{item.expectedAmount || 0} / {item.winRate || 0}%</td>
                  <td className="px-4 py-3 text-sm">{formatDateTimeDisplay(item.latestFollowUpTime)}</td>
                  <td className="px-4 py-3 text-sm">{item.ownerName || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      overflowLabel="更多"
                      actions={[
                        { label: '客户360', icon: <Handshake size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                        { label: '编辑商机', icon: <Target size={14} />, onClick: () => openDialog({ type: 'opportunity', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:opportunity:edit' },
                        { label: '赢单', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'winOpportunity', item }), semantic: 'process', permissionKey: 'crm:opportunity:win' },
                        { label: '输单审批', icon: <TriangleAlert size={14} />, onClick: () => setConfirm({ action: 'loseOpportunity', item: { ...item, lostReason: item.lostReason || '客户放弃' } }), semantic: 'disable', permissionKey: 'crm:approval:opportunity-downgrade' },
                        {
                          label: '转项目',
                          icon: <FolderKanban size={14} />,
                          onClick: async () => {
                            try {
                              const projectId = await crmApi.createProjectDraft(item.opportunityId!);
                              toast.success(`已生成项目草稿 #${projectId}`);
                              await load();
                              goToProject(projectId);
                            } catch (error) {
                              toast.error(getErrorMessage(error, '生成项目草稿失败'));
                            }
                          },
                          semantic: 'custom',
                          permissionKey: 'crm:project:draft',
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
