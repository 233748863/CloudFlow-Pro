import React from 'react';
import { toast } from 'sonner';
import { Eye, Handshake, Plus, RefreshCcw, Send, TriangleAlert } from 'lucide-react';
import { crmApi } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { useCrmManagement } from './store';
import { renderStatus } from './helpers';

export const QuoteTab: React.FC = () => {
  const { quotes, openDialog, openCustomerWorkspace, setConfirm, goToContract, load } = useCrmManagement();
  return (
    <table className="unity-data-table admin-source-table admin-crm-table min-w-[980px]">
      <thead>
        <tr>
          <th>报价</th>
          <th>客户</th>
          <th>金额</th>
          <th>状态</th>
          <th>合同</th>
          <th className="text-right">操作</th>
        </tr>
      </thead>
      <tbody>
        {quotes.map((item) => (
          <tr key={item.quoteId}>
            <td>
              <strong>{item.quoteName}</strong>
              <small>{item.quoteNo || '-'}</small>
            </td>
            <td>{item.customerName || '-'}</td>
            <td>
              <strong>{item.totalAmount || 0}</strong>
              <small>{item.quoteLines?.length || 0} 行 / 税额 {item.taxAmount || 0}</small>
            </td>
            <td>{renderStatus(item.status)}</td>
            <td>{item.contractNo || '-'}</td>
            <td>
              <div className="admin-users-row-actions">
                <button type="button" title="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Eye size={15} /></button>
                <button type="button" title="编辑报价" onClick={() => openDialog({ type: 'quote', item })}><Handshake size={15} /></button>
                {item.status === 'DRAFT' || item.status === 'REJECTED' ? <button type="button" title="提交提审" onClick={() => setConfirm({ action: 'submitQuote', item })}><Send size={15} /></button> : null}
                {item.status === 'APPROVED' || item.status === 'DRAFT' || item.status === 'REJECTED' ? <button type="button" title="发送报价" onClick={() => setConfirm({ action: 'sendQuote', item })}><Send size={15} /></button> : null}
                {item.status === 'APPROVED' || item.status === 'SENT' ? <button type="button" title="接受报价" onClick={() => setConfirm({ action: 'acceptQuote', item })}><RefreshCcw size={15} /></button> : null}
                {item.status !== 'ACCEPTED' && item.status !== 'EXPIRED' ? <button type="button" title="标记过期" onClick={() => setConfirm({ action: 'expireQuote', item })}><TriangleAlert size={15} /></button> : null}
                <button
                  type="button"
                  title="转合同"
                  onClick={async () => {
                      try {
                        const contractId = await crmApi.createContractDraft(item.quoteId!);
                        toast.success(`已生成合同草稿 #${contractId}`);
                        await load();
                        goToContract(contractId);
                      } catch (error) {
                        toast.error(getErrorMessage(error, '生成合同草稿失败'));
                      }
                    }}
                >
                  <Plus size={15} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
