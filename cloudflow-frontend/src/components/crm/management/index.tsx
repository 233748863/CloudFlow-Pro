import React from 'react';
import { BaseDialog, Button, ConfirmDialog } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { CrmManagementProvider, useCrmManagement } from './store';
import { DashboardTab } from './DashboardTab';
import { CustomerTab } from './CustomerTab';
import { OpportunityTab } from './OpportunityTab';
import { QuoteTab } from './QuoteTab';
import { ReceivableTab } from './ReceivableTab';
import { RenewalTab } from './RenewalTab';
import { TicketTab } from './TicketTab';
import { FilterBar } from './FilterBar';
import { CustomerDialogContent } from './dialogs/CustomerDialogContent';
import { ContactDialogContent } from './dialogs/ContactDialogContent';
import { FollowUpDialogContent } from './dialogs/FollowUpDialogContent';
import { OpportunityDialogContent } from './dialogs/OpportunityDialogContent';
import { QuoteDialogContent } from './dialogs/QuoteDialogContent';
import { ReceivableDialogContent } from './dialogs/ReceivableDialogContent';
import { RenewalDialogContent } from './dialogs/RenewalDialogContent';
import { TicketDialogContent } from './dialogs/TicketDialogContent';

const DialogShell: React.FC = () => {
  const {
    dialog,
    openDialog,
    saving,
    saveDialog,
    customerForm,
    contactForm,
    followUpForm,
    opportunityForm,
    quoteForm,
    receivableForm,
    renewalForm,
    ticketForm,
  } = useCrmManagement();

  if (!dialog) return null;

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" onClick={() => openDialog(null)}>取消</Button>
      <Button onClick={() => void saveDialog()} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
    </div>
  );

  if (dialog.type === 'customer') {
    return (
      <BaseDialog open title={customerForm.customerId ? '编辑客户' : '新增客户'} onClose={() => openDialog(null)} footer={footer} width="wide">
        <CustomerDialogContent />
      </BaseDialog>
    );
  }
  if (dialog.type === 'contact') {
    return (
      <BaseDialog open title={contactForm.contactId ? '编辑联系人' : '新增联系人'} onClose={() => openDialog(null)} footer={footer} width="wide">
        <ContactDialogContent />
      </BaseDialog>
    );
  }
  if (dialog.type === 'followUp') {
    return (
      <BaseDialog open title={followUpForm.followUpId ? '编辑跟进' : '新增跟进'} onClose={() => openDialog(null)} footer={footer} width="wide">
        <FollowUpDialogContent />
      </BaseDialog>
    );
  }
  if (dialog.type === 'opportunity') {
    return (
      <BaseDialog open title={opportunityForm.opportunityId ? '编辑商机' : '新增商机'} onClose={() => openDialog(null)} footer={footer} width="wide">
        <OpportunityDialogContent />
      </BaseDialog>
    );
  }
  if (dialog.type === 'quote') {
    return (
      <BaseDialog open title={quoteForm.quoteId ? '编辑报价' : '新增报价'} onClose={() => openDialog(null)} footer={footer} width="wide">
        <QuoteDialogContent />
      </BaseDialog>
    );
  }
  if (dialog.type === 'receivable') {
    return (
      <BaseDialog open title={receivableForm.receivableId ? '编辑回款' : '新增回款'} onClose={() => openDialog(null)} footer={footer} width="wide">
        <ReceivableDialogContent />
      </BaseDialog>
    );
  }
  if (dialog.type === 'renewal') {
    return (
      <BaseDialog open title={renewalForm.renewalId ? '编辑续约' : '新增续约'} onClose={() => openDialog(null)} footer={footer} width="wide">
        <RenewalDialogContent />
      </BaseDialog>
    );
  }
  return (
    <BaseDialog
      open
      title={ticketForm.ticketId ? '编辑工单' : '新增工单'}
      onClose={() => openDialog(null)}
      footer={footer}
      width="wide"
      bodyClassName="overflow-visible"
      panelClassName="overflow-visible"
    >
      <TicketDialogContent />
    </BaseDialog>
  );
};

const CrmManagementShell: React.FC = () => {
  const { tab, confirm, setConfirm, executeConfirm } = useCrmManagement();

  return (
    <div className="space-y-4 animate-fade-in">
      <DashboardTab />

      {tab === 'opportunity' ? (
        <div className="space-y-6">
          <FilterBar />
          <OpportunityTab />
        </div>
      ) : null}

      {tab !== 'dashboard' && tab !== 'opportunity' ? (
        <TablePageLayout
          filters={<FilterBar />}
          table={(
            <>
              {tab === 'customer' ? <TableSurfaceCard className="overflow-x-auto"><CustomerTab /></TableSurfaceCard> : null}
              {tab === 'quote' ? <TableSurfaceCard className="overflow-x-auto"><QuoteTab /></TableSurfaceCard> : null}
              {tab === 'receivable' ? <ReceivableTab /> : null}
              {tab === 'renewal' ? <RenewalTab /> : null}
              {tab === 'ticket' ? <TableSurfaceCard className="overflow-x-auto"><TicketTab /></TableSurfaceCard> : null}
            </>
          )}
        />
      ) : null}

      <DialogShell />

      <ConfirmDialog
        open={Boolean(confirm)}
        title="确认操作"
        message="执行后将更新 CRM 当前状态。"
        confirmText="确认"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void executeConfirm()}
      />
    </div>
  );
};

const CrmManagementPage: React.FC = () => (
  <CrmManagementProvider>
    <CrmManagementShell />
  </CrmManagementProvider>
);

export default CrmManagementPage;
