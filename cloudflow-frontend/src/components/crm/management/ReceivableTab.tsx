import React, { useState } from 'react';
import { Eye, Handshake, ReceiptText, Wallet } from 'lucide-react';
import type { CrmReceivable } from '@/services/api/crm';
import { RefundDialog } from './dialogs/RefundDialog';
import { useCrmManagement } from './store';
import { renderInvoiceStatus, renderStatus } from './helpers';
import { BaseDialog, Button } from '@/components/common';
import FinancePublicationPanel from '@/components/finance/FinancePublicationPanel';

export const ReceivableTab: React.FC = () => {
  const { receivables, load, openDialog, openCustomerWorkspace, setConfirm, loadReceivableInvoices, hasPermission } = useCrmManagement();
  const [refundItem, setRefundItem] = useState<CrmReceivable | null>(null);
  const [financeItem, setFinanceItem] = useState<CrmReceivable | null>(null);
  const [financeProtected, setFinanceProtected] = useState(false);
  const closeFinance = () => {
    if (financeProtected) return;
    setFinanceItem(null);
    void load();
  };

  return (
    <>
      <table className="unity-data-table admin-source-table admin-crm-table min-w-[760px]">
        <thead>
            <tr>
              <th>名称</th>
              <th>状态 / 发票</th>
              <th>金额</th>
              <th className="text-right">操作</th>
            </tr>
        </thead>
        <tbody>
            {receivables.map((item) => (
              <tr key={item.receivableId}>
                <td><strong>{item.receivableName}</strong></td>
                <td>
                  <strong>{renderStatus(item.status)}</strong>
                  <small>{renderInvoiceStatus(item.invoiceStatus)}</small>
                  {item.invoiceId != null && <small>已绑定发票，请在发票页面登记收款；此处只查看到账结果。</small>}
                </td>
                <td><strong>计划 {item.plannedAmount || 0}</strong><small>到账 {item.receivedAmount || 0}；未收 {item.outstandingAmount || 0}</small></td>
                <td>
                  <div className="admin-users-row-actions">
                    {hasPermission('crm:portal-finance:manage') && <button className="!min-h-[44px] !min-w-[44px]" type="button" data-tooltip="财务公开详情" aria-label="财务公开详情" onClick={() => setFinanceItem(item)}><ReceiptText size={15} /></button>}
                    <button className="!min-h-[44px] !min-w-[44px]" type="button" data-tooltip="客户360" aria-label="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Eye size={15} /></button>
                    {hasPermission('crm:receivable:edit') && <button className="!min-h-[44px] !min-w-[44px]" type="button" data-tooltip="编辑回款" aria-label="编辑回款" onClick={() => openDialog({ type: 'receivable', item })}><Handshake size={15} /></button>}
                    {hasPermission('crm:receivable:confirm') && item.invoiceId == null && Number(item.outstandingAmount || 0) > 0 ? <button className="!min-h-[44px] !min-w-[44px]" type="button" data-tooltip="确认回款" aria-label="确认回款" onClick={() => setConfirm({ action: 'confirmReceivable', item })}><Wallet size={15} /></button> : null}
                    {hasPermission('crm:approval:refund') && Number(item.receivedAmount || 0) > 0 ? <button className="!min-h-[44px] !min-w-[44px]" type="button" data-tooltip="退款审批" aria-label="退款审批" onClick={() => setRefundItem(item)}><Wallet size={15} /></button> : null}
                    {hasPermission('crm:receivable:bind-invoice') && <button
                      className="!min-h-[44px] !min-w-[44px]"
                      type="button"
                      data-tooltip="绑定发票" aria-label="绑定发票"
                      onClick={async () => {
                          await loadReceivableInvoices(item);
                          openDialog({ type: 'receivable', item });
                        }}
                    >
                      <ReceiptText size={15} />
                    </button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

      {refundItem && <RefundDialog key={refundItem.receivableId} item={refundItem} onClose={() => setRefundItem(null)} onSubmitted={load} />}
      <BaseDialog open={!!financeItem} title="回款详情与财务公开" width="wide" panelClassName="finance-controls"
        hideCloseButton={financeProtected} closeOnEscape={!financeProtected} onClose={closeFinance}
        footer={<Button variant="outline" disabled={financeProtected} onClick={closeFinance}>关闭</Button>}>
        {financeItem?.receivableId && <FinancePublicationPanel key={financeItem.receivableId} kind="RECEIVABLE" id={financeItem.receivableId}
          onProtectionChange={setFinanceProtected} onSaved={value => setFinanceItem(previous => previous ? { ...previous, version: value.version } : previous)} />}
      </BaseDialog>
    </>
  );
};
