import React, { useState } from 'react';
import { Eye, Handshake, Plus, RefreshCcw, Send, TriangleAlert } from 'lucide-react';
import { useCrmManagement } from './store';
import { renderStatus } from './helpers';
import { EmailBusinessButton } from '../email/EmailPanel';
import { QuoteContractDialog } from './dialogs/QuoteContractDialog';

export const QuoteTab: React.FC = () => {
  const { quotes, openDialog, openCustomerWorkspace, setConfirm, goToContract, hasPermission } = useCrmManagement();
  const [converting, setConverting] = useState<number>();
  return (
    <>
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
                <EmailBusinessButton bizType="QUOTE" bizId={item.quoteId} />
                <button type="button" data-tooltip="客户360" aria-label="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Eye size={15} /></button>
                <button type="button" data-tooltip="编辑报价" aria-label="编辑报价" onClick={() => openDialog({ type: 'quote', item })}><Handshake size={15} /></button>
                {item.status === 'DRAFT' || item.status === 'REJECTED' ? <button type="button" data-tooltip="提交提审" aria-label="提交提审" onClick={() => setConfirm({ action: 'submitQuote', item })}><Send size={15} /></button> : null}
                {item.status === 'APPROVED' || item.status === 'DRAFT' || item.status === 'REJECTED' ? <button type="button" data-tooltip="发送报价" aria-label="发送报价" onClick={() => setConfirm({ action: 'sendQuote', item })}><Send size={15} /></button> : null}
                {item.status === 'APPROVED' || item.status === 'SENT' ? <button type="button" data-tooltip="接受报价" aria-label="接受报价" onClick={() => setConfirm({ action: 'acceptQuote', item })}><RefreshCcw size={15} /></button> : null}
                {item.status !== 'ACCEPTED' && item.status !== 'EXPIRED' ? <button type="button" data-tooltip="标记过期" aria-label="标记过期" onClick={() => setConfirm({ action: 'expireQuote', item })}><TriangleAlert size={15} /></button> : null}
                {(hasPermission('crm:contract:draft') || item.contractId && hasPermission('oa:contract:list')) && <button
                  type="button"
                  className="!min-h-[44px] !min-w-[44px]"
                  data-tooltip={item.contractId ? '打开合同' : '转合同'} aria-label={item.contractId ? '打开合同' : '转合同'}
                  onClick={() => { if (item.contractId && hasPermission('oa:contract:list')) goToContract(item.contractId); else setConverting(item.quoteId); }}
                >
                  <Plus size={15} />
                </button>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {converting != null && <QuoteContractDialog key={converting} quoteId={converting} onClose={() => setConverting(undefined)} />}
    </>
  );
};
