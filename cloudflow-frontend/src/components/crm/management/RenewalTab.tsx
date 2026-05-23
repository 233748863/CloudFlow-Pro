import React from 'react';
import { toast } from 'sonner';
import { Eye, Handshake, RefreshCcw, Send } from 'lucide-react';
import { TableHead, TableHeader, TableActionHead, TableRowActions } from '@/components/common';
import { crmApi } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { useCrmManagement } from './store';
import { renderHealthLabel, renderStatus } from './helpers';

export const RenewalTab: React.FC = () => {
  const { renewals, openDialog, openCustomerWorkspace, load } = useCrmManagement();
  return (
    <section className="cf-section-card">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-sm font-medium"><RefreshCcw size={16} />续约管理</div>
        <div className="mt-1 text-xs text-slate-500">主操作 = 新增续约。审批与编辑属于次操作，放在行内。</div>
      </div>
      <table className="w-full">
        <TableHeader>
          <tr>
            <TableHead>名称</TableHead>
            <TableHead>状态 / 风险</TableHead>
            <TableHead>金额</TableHead>
            <TableActionHead>操作</TableActionHead>
          </tr>
        </TableHeader>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {renewals.map((item) => (
            <tr key={item.renewalId}>
              <td className="px-4 py-3 text-sm">{item.renewalName}</td>
              <td className="px-4 py-3 text-sm">
                <div>{renderStatus(item.status)}</div>
                <div className="text-xs text-slate-500">{renderHealthLabel(item.riskLevel)} / {item.riskReason || '-'}</div>
              </td>
              <td className="px-4 py-3 text-sm">{item.renewalAmount || 0}</td>
              <td className="px-4 py-3 text-right">
                <TableRowActions
                  align="end"
                  overflowLabel="更多"
                  actions={[
                    { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                    { label: '编辑续约', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'renewal', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:renewal:edit' },
                    {
                      label: '提交提审',
                      icon: <Send size={14} />,
                      onClick: async () => {
                        try {
                          await crmApi.submitRenewal(item.renewalId!);
                          toast.success('续约已提审');
                          await load();
                        } catch (error) {
                          toast.error(getErrorMessage(error, '续约提审失败'));
                        }
                      },
                      hidden: item.status !== 'PLANNED' && item.status !== 'NEGOTIATING',
                      semantic: 'submit',
                      permissionKey: 'crm:renewal:submit',
                    },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
