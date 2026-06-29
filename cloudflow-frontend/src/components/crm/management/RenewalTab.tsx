import React from 'react';
import { toast } from 'sonner';
import { Eye, Handshake, Send } from 'lucide-react';
import { crmApi } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { useCrmManagement } from './store';
import { renderHealthLabel, renderStatus } from './helpers';

export const RenewalTab: React.FC = () => {
  const { renewals, openDialog, openCustomerWorkspace, load } = useCrmManagement();
  return (
    <table className="unity-data-table admin-source-table admin-crm-table min-w-[760px]">
      <thead>
          <tr>
            <th>名称</th>
            <th>状态 / 风险</th>
            <th>金额</th>
            <th className="text-right">操作</th>
          </tr>
      </thead>
      <tbody>
          {renewals.map((item) => (
            <tr key={item.renewalId}>
              <td><strong>{item.renewalName}</strong></td>
              <td>
                <strong>{renderStatus(item.status)}</strong>
                <small>{renderHealthLabel(item.riskLevel)} / {item.riskReason || '-'}</small>
              </td>
              <td>{item.renewalAmount || 0}</td>
              <td>
                <div className="admin-users-row-actions">
                  <button type="button" title="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Eye size={15} /></button>
                  <button type="button" title="编辑续约" onClick={() => openDialog({ type: 'renewal', item })}><Handshake size={15} /></button>
                  {item.status === 'PLANNED' || item.status === 'NEGOTIATING' ? (
                    <button
                      type="button"
                      title="提交提审"
                      onClick={async () => {
                        try {
                          await crmApi.submitRenewal(item.renewalId!);
                          toast.success('续约已提审');
                          await load();
                        } catch (error) {
                          toast.error(getErrorMessage(error, '续约提审失败'));
                        }
                      }}
                    >
                      <Send size={15} />
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
  );
};
