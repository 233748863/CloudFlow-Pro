import React from 'react';
import { LifeBuoy, ReceiptText, Target, Users2 } from 'lucide-react';
import { BaseDialog, Button, ConfirmDialog, PageLoading } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { CrmManagementProvider, useCrmManagement } from './store';
import { DashboardTab } from './DashboardTab';
import { CustomerTab } from './CustomerTab';
import { OpportunityTab } from './OpportunityTab';
import { QuoteTab } from './QuoteTab';
import { ReceivableTab } from './ReceivableTab';
import { RenewalTab } from './RenewalTab';
import { TicketTab } from './TicketTab';
import { CrmManagementToolbar } from './CrmManagementToolbar';
import { CustomerDialogContent } from './dialogs/CustomerDialogContent';
import { ContactDialogContent } from './dialogs/ContactDialogContent';
import { FollowUpDialogContent } from './dialogs/FollowUpDialogContent';
import { OpportunityDialogContent } from './dialogs/OpportunityDialogContent';
import { QuoteDialogContent } from './dialogs/QuoteDialogContent';
import { ReceivableDialogContent } from './dialogs/ReceivableDialogContent';
import { RenewalDialogContent } from './dialogs/RenewalDialogContent';
import { TicketDialogContent } from './dialogs/TicketDialogContent';
import { tabLabelMap } from './constants';

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
  const {
    tab,
    confirm,
    setConfirm,
    executeConfirm,
    loading,
    dashboard,
    customers,
    opportunities,
    quotes,
    tickets,
    board,
  } = useCrmManagement();

  // 首屏加载（仅在 dashboard 数据尚未到达且正在加载时显示，避免切换 tab 时反复闪烁）
  if (loading && !dashboard) {
    return <PageLoading tip="销售数据加载中…" />;
  }

  const pageDescriptions: Record<typeof tab, string> = {
    dashboard: '集中查看客户经营指标、风险待办和成交推进',
    customer: '维护客户档案、联系人、跟进记录和客户状态',
    opportunity: '通过看板和列表推进商机阶段与成交动作',
    quote: '管理报价草稿、审批、发送和客户接受状态',
    receivable: '跟踪合同回款、发票绑定和到账确认',
    renewal: '管理续约窗口、续约金额和合同延续动作',
    ticket: '处理客户服务工单、严重度和关闭状态',
  };

  const activeTicketCount = tickets.filter((item) => !['RESOLVED', 'CLOSED'].includes(String(item.status || '').toUpperCase())).length;
  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">CRM MANAGEMENT</p>
          <h2>{tabLabelMap[tab]}</h2>
          <span>{pageDescriptions[tab]}</span>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <div className="admin-source-stat-icon"><Users2 size={18} /></div>
          <div><p>客户档案</p><strong>{customers.length}</strong><span>客户与联系人统一维护</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <div className="admin-source-stat-icon"><Target size={18} /></div>
          <div><p>商机管道</p><strong>{opportunities.length}</strong><span>看板阶段 {board.length || 0} 列</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <div className="admin-source-stat-icon"><ReceiptText size={18} /></div>
          <div><p>报价单</p><strong>{quotes.length}</strong><span>审批、发送、成交联动</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <div className="admin-source-stat-icon"><LifeBuoy size={18} /></div>
          <div><p>待处理工单</p><strong>{activeTicketCount}</strong><span>服务风险与客户响应</span></div>
        </article>
      </section>
    </div>
  );

  const pageFilters = tab === 'dashboard' ? undefined : <CrmManagementToolbar />;

  const pageContent = (
    <>
      {tab === 'dashboard' ? (
        <div className="admin-source-content admin-crm-dashboard-content">
          <DashboardTab />
        </div>
      ) : null}

      {tab === 'opportunity' ? (
        <div className="admin-source-content admin-crm-opportunity-content">
          <OpportunityTab />
        </div>
      ) : null}

      {tab !== 'dashboard' && tab !== 'opportunity' ? (
        <InnerTableSurface className="admin-crm-table-panel">
          {tab === 'customer' ? <CustomerTab /> : null}
          {tab === 'quote' ? <QuoteTab /> : null}
          {tab === 'receivable' ? <ReceivableTab /> : null}
          {tab === 'renewal' ? <RenewalTab /> : null}
          {tab === 'ticket' ? <TicketTab /> : null}
        </InnerTableSurface>
      ) : null}
    </>
  );

  return (
    <section className="admin-source-page admin-crm-page admin-crm-management-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />

      <DialogShell />

      <ConfirmDialog
        open={Boolean(confirm)}
        title="确认操作"
        message="执行后将更新 CRM 当前状态。"
        confirmText="确认"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void executeConfirm()}
      />
    </section>
  );
};

const CrmManagementPage: React.FC = () => (
  <CrmManagementProvider>
    <CrmManagementShell />
  </CrmManagementProvider>
);

export default CrmManagementPage;
