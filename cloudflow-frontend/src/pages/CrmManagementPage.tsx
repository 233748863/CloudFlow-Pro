import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Eye, FolderKanban, Handshake, LifeBuoy, Plus, ReceiptText, RefreshCcw, Send, ShieldAlert, Target, TriangleAlert, UserRound, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { TableRowActions } from '@/components/common/table-row-actions';
import { crmApi, CrmContact, CrmCustomer, CrmDashboardSummary, CrmFollowUp, CrmOpportunity, CrmOpportunityBoardCard, CrmOpportunityBoardColumn, CrmQuote, CrmReceivable, CrmRenewal, CrmTicket } from '@/services/api/crm';
import { contractApi, OaContract } from '@/services/api/contractRisk';
import { invoiceApi, Invoice } from '@/services/api/invoice';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';

type CrmTab = 'customer' | 'opportunity' | 'quote' | 'receivable' | 'renewal' | 'ticket';

type DialogState =
  | { type: 'customer'; item?: CrmCustomer | null }
  | { type: 'opportunity'; item?: CrmOpportunity | null }
  | { type: 'quote'; item?: CrmQuote | null }
  | { type: 'receivable'; item?: CrmReceivable | null }
  | { type: 'renewal'; item?: CrmRenewal | null }
  | { type: 'ticket'; item?: CrmTicket | null }
  | { type: 'contact'; item?: CrmContact | null }
  | { type: 'followUp'; item?: CrmFollowUp | null }
  | null;

type ConfirmState =
  | { action: 'submitQuote' | 'sendQuote' | 'acceptQuote' | 'expireQuote' | 'winOpportunity' | 'loseOpportunity' | 'confirmReceivable' | 'resolveTicket' | 'closeTicket'; item: any }
  | null;

const emptyCustomer: CrmCustomer = { customerName: '', customerType: 'ENTERPRISE', status: 'ACTIVE' };
const emptyOpportunity: CrmOpportunity = { customerId: 0, opportunityName: '', stage: 'LEAD', status: 'OPEN', expectedAmount: 0, winRate: 0 };
const emptyQuote: CrmQuote = { customerId: 0, quoteName: '', totalAmount: 0, taxAmount: 0, currency: 'CNY', status: 'DRAFT' };
const emptyReceivable: CrmReceivable = { customerId: 0, receivableName: '', plannedAmount: 0, invoiceStatus: 'NONE', status: 'PLANNED' };
const emptyRenewal: CrmRenewal = { customerId: 0, renewalName: '', renewalAmount: 0, status: 'PLANNED' };
const emptyTicket: CrmTicket = { customerId: 0, ticketTitle: '', severity: 'LOW', issueType: 'OTHER', status: 'OPEN' };
const emptyContact: CrmContact = { customerId: 0, contactName: '', status: 'ACTIVE', primaryFlag: 0 };
const emptyFollowUp: CrmFollowUp = { customerId: 0, content: '', followUpType: 'VISIT' };

const HEALTH_TONE: Record<string, string> = {
  GREEN: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  YELLOW: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  RED: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

const healthLabelMap: Record<string, string> = {
  GREEN: '健康',
  YELLOW: '关注',
  RED: '高风险',
};

const stageLabelMap: Record<string, string> = {
  LEAD: '线索',
  QUALIFIED: '已确认',
  PROPOSAL: '方案报价',
  NEGOTIATION: '商务谈判',
  WON: '赢单',
  LOST: '输单',
};

const statusLabelMap: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  SENT: '已发送',
  ACCEPTED: '已接受',
  EXPIRED: '已过期',
  PLANNED: '计划中',
  RECEIVED: '已回款',
  PARTIAL_RECEIVED: '部分回款',
  OPEN: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
  NEGOTIATING: '洽谈中',
  WON: '赢单',
  LOST: '输单',
  IN_PROGRESS: '执行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  ARCHIVED: '已归档',
};

const invoiceStatusLabelMap: Record<string, string> = {
  NONE: '未关联合同发票',
  REGISTERED: '已登记',
  BOUND: '已绑定',
  WRITEOFF_PARTIAL: '部分核销',
  WRITEOFF_FULL: '全部核销',
  VOID: '已作废',
};

const severityLabelMap: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '严重',
};

const commonFooter = (
  <div className="flex items-center justify-end gap-2" />
);

const renderHealthBadge = (level?: string) => (
  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${HEALTH_TONE[level || 'GREEN'] || HEALTH_TONE.GREEN}`}>
    {healthLabelMap[level || 'GREEN'] || level || '健康'}
  </span>
);

const renderStatus = (status?: string) => statusLabelMap[status || ''] || stageLabelMap[status || ''] || status || '-';
const renderInvoiceStatus = (status?: string) => invoiceStatusLabelMap[status || ''] || status || '-';
const renderSeverity = (severity?: string) => severityLabelMap[severity || ''] || severity || '-';
const renderHealthLabel = (level?: string) => healthLabelMap[level || ''] || level || '-';

const DraggableOpportunityCard: React.FC<{
  item: CrmOpportunityBoardCard;
  onClick: () => void;
}> = ({ item, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `opp:${item.opportunityId}` });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.8 : 1,
  } as React.CSSProperties;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      <div>{item.opportunityName}</div>
      <div className="mt-1 text-xs text-slate-500">{item.customerName || '-'} / 停留 {item.stageStayDays || 0} 天</div>
      <div className="mt-1 text-xs text-slate-500">{item.expectedAmount || 0} / 赢率 {item.winRate || 0}%</div>
    </button>
  );
};

const DroppableStageColumn: React.FC<{
  column: CrmOpportunityBoardColumn;
  onCardClick: (item: CrmOpportunityBoardCard) => void;
}> = ({ column, onCardClick }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${column.stage}` });

  return (
    <Card ref={setNodeRef} className={isOver ? 'border-cyan-400 shadow-md' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{column.stageLabel || column.stage}</CardTitle>
        <div className="text-xs text-slate-500">{column.count || 0} 条 / {column.totalAmount || 0}</div>
      </CardHeader>
      <CardContent className="space-y-2">
        {column.items.length ? column.items.map((item) => (
          <DraggableOpportunityCard key={item.opportunityId} item={item} onClick={() => onCardClick(item)} />
        )) : <div className="text-sm text-slate-500">暂无商机</div>}
      </CardContent>
    </Card>
  );
};

export default function CrmManagementPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [tab, setTab] = useState<CrmTab>('customer');
  const [keyword, setKeyword] = useState('');
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [customerRefs, setCustomerRefs] = useState<CrmCustomer[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [followUps, setFollowUps] = useState<CrmFollowUp[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [opportunityRefs, setOpportunityRefs] = useState<CrmOpportunity[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [receivables, setReceivables] = useState<CrmReceivable[]>([]);
  const [renewals, setRenewals] = useState<CrmRenewal[]>([]);
  const [tickets, setTickets] = useState<CrmTicket[]>([]);
  const [contracts, setContracts] = useState<OaContract[]>([]);
  const [dashboard, setDashboard] = useState<CrmDashboardSummary | null>(null);
  const [board, setBoard] = useState<CrmOpportunityBoardColumn[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [saving, setSaving] = useState(false);
  const [invoiceCandidates, setInvoiceCandidates] = useState<Invoice[]>([]);

  const [customerForm, setCustomerForm] = useState<CrmCustomer>(emptyCustomer);
  const [contactForm, setContactForm] = useState<CrmContact>(emptyContact);
  const [followUpForm, setFollowUpForm] = useState<CrmFollowUp>(emptyFollowUp);
  const [opportunityForm, setOpportunityForm] = useState<CrmOpportunity>(emptyOpportunity);
  const [quoteForm, setQuoteForm] = useState<CrmQuote>(emptyQuote);
  const [receivableForm, setReceivableForm] = useState<CrmReceivable>(emptyReceivable);
  const [renewalForm, setRenewalForm] = useState<CrmRenewal>(emptyRenewal);
  const [ticketForm, setTicketForm] = useState<CrmTicket>(emptyTicket);

  const customerOptions = useMemo(
    () => customerRefs.map((item) => ({ label: item.customerName, value: String(item.customerId) })),
    [customerRefs],
  );

  const opportunityOptions = useMemo(
    () => opportunityRefs.map((item) => ({ label: item.opportunityName, value: String(item.opportunityId) })),
    [opportunityRefs],
  );

  const contractOptions = useMemo(
    () => contracts.map((item) => ({ label: `${item.contractNo || '-'} / ${item.contractName}`, value: String(item.contractId) })),
    [contracts],
  );

  const load = async () => {
    try {
      const [c, cRef, ct, fu, o, oRef, q, r, n, t, contractResult, dashboardResult, boardResult] = await Promise.all([
        crmApi.listCustomers({ pageNum: 1, pageSize: 50, customerName: keyword || undefined, customerTags: keyword || undefined }),
        crmApi.listCustomers({ pageNum: 1, pageSize: 200 }),
        crmApi.listContacts({ pageNum: 1, pageSize: 100 }),
        crmApi.listFollowUps({ pageNum: 1, pageSize: 100 }),
        crmApi.listOpportunities({ pageNum: 1, pageSize: 100, opportunityName: keyword || undefined }),
        crmApi.listOpportunities({ pageNum: 1, pageSize: 200 }),
        crmApi.listQuotes({ pageNum: 1, pageSize: 100, quoteName: keyword || undefined }),
        crmApi.listReceivables({ pageNum: 1, pageSize: 100, receivableName: keyword || undefined }),
        crmApi.listRenewals({ pageNum: 1, pageSize: 100, renewalName: keyword || undefined }),
        crmApi.listTickets({ pageNum: 1, pageSize: 100, ticketTitle: keyword || undefined }),
        contractApi.list({ pageNum: 1, pageSize: 200 }),
        crmApi.getDashboardSummary(),
        crmApi.getOpportunityBoard(),
      ]);
      setCustomers(c.rows || []);
      setCustomerRefs(cRef.rows || []);
      setContacts(ct.rows || []);
      setFollowUps(fu.rows || []);
      setOpportunities(o.rows || []);
      setOpportunityRefs(oRef.rows || []);
      setQuotes(q.rows || []);
      setReceivables(r.rows || []);
      setRenewals(n.rows || []);
      setTickets(t.rows || []);
      setContracts(contractResult.rows || []);
      setDashboard(dashboardResult);
      setBoard(boardResult);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载 CRM 失败'));
    }
  };

  useEffect(() => {
    void load();
  }, [keyword]);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const nextTab = search.get('tab') as CrmTab | null;
    if (nextTab && ['customer', 'opportunity', 'quote', 'receivable', 'renewal', 'ticket'].includes(nextTab)) {
      setTab(nextTab);
      return;
    }
    setTab('customer');
  }, [location.search]);

  const resetForms = () => {
    setCustomerForm(emptyCustomer);
    setContactForm(emptyContact);
    setFollowUpForm(emptyFollowUp);
    setOpportunityForm(emptyOpportunity);
    setQuoteForm(emptyQuote);
    setReceivableForm(emptyReceivable);
    setRenewalForm(emptyRenewal);
    setTicketForm(emptyTicket);
  };

  const openDialog = (next: DialogState) => {
    setDialog(next);
    if (!next) {
      resetForms();
      return;
    }
    if (next.type === 'customer') setCustomerForm(next.item || emptyCustomer);
    if (next.type === 'contact') setContactForm(next.item || emptyContact);
    if (next.type === 'followUp') setFollowUpForm(next.item || emptyFollowUp);
    if (next.type === 'opportunity') setOpportunityForm(next.item || emptyOpportunity);
    if (next.type === 'quote') setQuoteForm(next.item || emptyQuote);
    if (next.type === 'receivable') setReceivableForm(next.item || emptyReceivable);
    if (next.type === 'renewal') setRenewalForm(next.item || emptyRenewal);
    if (next.type === 'ticket') setTicketForm(next.item || emptyTicket);
  };

  const openCustomerWorkspace = (customerId?: number) => {
    if (!customerId) return;
    navigate(`/office/crm/customer/${customerId}`);
  };

  const goToProject = (projectId: number) => navigate('/office/project', { state: { focusProjectId: projectId } });
  const goToContract = (contractId: number) => navigate('/office/contracts', { state: { focusContractId: contractId } });

  const applyContractToReceivable = (contractId: number) => {
    const matched = contracts.find((item) => item.contractId === contractId);
    if (!matched) return;
    setReceivableForm((prev) => ({
      ...prev,
      contractId: matched.contractId,
      contractNo: matched.contractNo,
      customerId: matched.customerId || prev.customerId,
      customerName: matched.customerName || prev.customerName,
    }));
  };

  const applyContractToRenewal = (contractId: number) => {
    const matched = contracts.find((item) => item.contractId === contractId);
    if (!matched) return;
    setRenewalForm((prev) => ({
      ...prev,
      contractId: matched.contractId,
      contractNo: matched.contractNo,
      customerId: matched.customerId || prev.customerId,
      customerName: matched.customerName || prev.customerName,
    }));
  };

  const saveDialog = async () => {
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.type === 'customer') {
        if (customerForm.customerId) await crmApi.editCustomer(customerForm); else await crmApi.addCustomer(customerForm);
      }
      if (dialog.type === 'contact') {
        if (contactForm.contactId) await crmApi.editContact(contactForm); else await crmApi.addContact(contactForm);
      }
      if (dialog.type === 'followUp') {
        if (followUpForm.followUpId) await crmApi.editFollowUp(followUpForm); else await crmApi.addFollowUp(followUpForm);
      }
      if (dialog.type === 'opportunity') {
        if (opportunityForm.opportunityId) await crmApi.editOpportunity(opportunityForm); else await crmApi.addOpportunity(opportunityForm);
      }
      if (dialog.type === 'quote') {
        if (quoteForm.quoteId) await crmApi.editQuote(quoteForm); else await crmApi.addQuote(quoteForm);
      }
      if (dialog.type === 'receivable') {
        if (receivableForm.receivableId) await crmApi.editReceivable(receivableForm); else await crmApi.addReceivable(receivableForm);
      }
      if (dialog.type === 'renewal') {
        if (renewalForm.renewalId) await crmApi.editRenewal(renewalForm); else await crmApi.addRenewal(renewalForm);
      }
      if (dialog.type === 'ticket') {
        if (ticketForm.ticketId) await crmApi.editTicket(ticketForm); else await crmApi.addTicket(ticketForm);
      }
      toast.success('保存成功');
      openDialog(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === 'submitQuote') await crmApi.submitQuote(confirm.item.quoteId);
      if (confirm.action === 'sendQuote') await crmApi.sendQuote(confirm.item.quoteId);
      if (confirm.action === 'acceptQuote') await crmApi.acceptQuote(confirm.item.quoteId);
      if (confirm.action === 'expireQuote') await crmApi.expireQuote(confirm.item.quoteId);
      if (confirm.action === 'winOpportunity') await crmApi.winOpportunity(confirm.item.opportunityId);
      if (confirm.action === 'loseOpportunity') await crmApi.loseOpportunity(confirm.item.opportunityId, confirm.item.lostReason);
      if (confirm.action === 'confirmReceivable') await crmApi.confirmReceivable(confirm.item.receivableId);
      if (confirm.action === 'resolveTicket') await crmApi.resolveTicket(confirm.item.ticketId, confirm.item.solution);
      if (confirm.action === 'closeTicket') await crmApi.closeTicket(confirm.item.ticketId);
      toast.success('操作成功');
      setConfirm(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const loadReceivableInvoices = async (receivable: CrmReceivable) => {
    try {
      const result = await invoiceApi.list({
        pageNum: 1,
        pageSize: 50,
        invoiceDirection: 'OUTPUT',
        customerId: receivable.customerId,
      });
      setInvoiceCandidates((result.rows || []).filter((item) => !item.receivableId || item.receivableId === receivable.receivableId));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载可绑定发票失败'));
    }
  };

  const bindInvoiceToReceivable = async (receivable: CrmReceivable, invoiceId: number) => {
    try {
      await crmApi.bindReceivableInvoice(receivable.receivableId!, invoiceId);
      toast.success('发票已绑定到回款');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定发票失败'));
    }
  };

  const handleBoardDragEnd = async (event: DragEndEvent) => {
    const activeId = String(event.active.id || '');
    const overId = String(event.over?.id || '');
    if (!activeId.startsWith('opp:') || !overId.startsWith('stage:')) {
      return;
    }
    const opportunityId = Number(activeId.replace('opp:', ''));
    const stage = overId.replace('stage:', '');
    const opportunity = opportunities.find((item) => item.opportunityId === opportunityId);
    if (!opportunity || opportunity.stage === stage) {
      return;
    }
    try {
      await crmApi.updateOpportunityStage({
        opportunityId,
        stage,
        lostReason: stage === 'LOST' ? (opportunity.lostReason || '拖拽至输单列，待补充原因') : undefined,
      });
      toast.success('商机阶段已更新');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '更新商机阶段失败'));
    }
  };

  const renderDashboard = () => {
    if (!dashboard) return null;
    return (
      <div className="grid gap-4 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">待审批报价</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {dashboard.pendingQuotes.length ? dashboard.pendingQuotes.slice(0, 4).map((item) => (
              <div key={item.quoteId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <div>{item.quoteName}</div>
                <div className="text-xs text-slate-500">{item.customerName || '-'} / {item.totalAmount || 0}</div>
              </div>
            )) : <div className="text-slate-500">暂无待审批报价</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">回款账龄</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {dashboard.agingBuckets.length ? dashboard.agingBuckets.map((item) => (
              <div key={item.bucketCode} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <span>{item.bucketName}</span>
                <span className="text-xs text-slate-500">{item.receivableCount || 0} / {item.outstandingAmount || 0}</span>
              </div>
            )) : <div className="text-slate-500">暂无账龄数据</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">续约与工单</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div>90天续约窗口</div>
              <div className="text-xs text-slate-500">{dashboard.renewalWindows.length} 条</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div>高严重度工单</div>
              <div className="text-xs text-slate-500">{dashboard.highSeverityTickets.length} 条</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">经营提醒</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div>7天未跟进客户</div>
              <div className="text-xs text-slate-500">{dashboard.staleFollowCustomers.length} 条</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div>阶段停留超时商机</div>
              <div className="text-xs text-slate-500">{dashboard.stalledOpportunities.length} 条</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">联动闭环</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div>待完善 OA 草稿</div>
              <div className="text-xs text-slate-500">{dashboard.crossModuleTodos.length} 条</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div>预算超阈值 / 发票异常</div>
              <div className="text-xs text-slate-500">{dashboard.budgetAlerts.length + dashboard.invoiceExceptions.length} 条</div>
            </div>
            {dashboard.crossModuleTodos.slice(0, 2).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path || '/dashboard')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>{item.title || '-'}</div>
                <div className="text-xs text-slate-500">{item.sourceLabel || item.module || '-'} / {renderStatus(item.status)}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCustomerTable = () => (
    <table className="w-full min-w-[900px]">
      <TableHeader>
        <tr>
          <TableHead>客户</TableHead>
          <TableHead>健康度</TableHead>
          <TableHead>联系人 / 跟进</TableHead>
          <TableHead>负责人</TableHead>
          <TableHead>状态</TableHead>
          <TableActionHead>操作</TableActionHead>
        </tr>
      </TableHeader>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {customers.map((item) => {
          const contactCount = contacts.filter((contact) => contact.customerId === item.customerId).length;
          const followCount = followUps.filter((follow) => follow.customerId === item.customerId).length;
          return (
            <tr key={item.customerId}>
              <td className="px-4 py-3 text-sm">
                <div>{item.customerName}</div>
                <div className="text-xs text-slate-500">{item.customerCode || '-'} / {item.customerTags || '-'}</div>
              </td>
              <td className="px-4 py-3 text-sm">
                <div>{renderHealthBadge(item.healthLevel)}</div>
                <div className="mt-1 text-xs text-slate-500">{item.healthReason || '-'}</div>
              </td>
              <td className="px-4 py-3 text-sm">{contactCount} / {followCount}</td>
              <td className="px-4 py-3 text-sm">{item.ownerName || '-'}</td>
              <td className="px-4 py-3 text-sm">{renderStatus(item.status)}</td>
              <td className="px-4 py-3 text-right">
                <TableRowActions
                  align="end"
                  overflowLabel="更多"
                  actions={[
                    { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                    { label: '编辑客户', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'customer', item }), semantic: 'edit', isPrimary: true },
                    { label: '新增联系人', icon: <UserRound size={14} />, onClick: () => openDialog({ type: 'contact', item: { ...emptyContact, customerId: item.customerId! } }), semantic: 'custom' },
                    { label: '新增跟进', icon: <RefreshCcw size={14} />, onClick: () => openDialog({ type: 'followUp', item: { ...emptyFollowUp, customerId: item.customerId! } }), semantic: 'custom' },
                  ]}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderOpportunityTable = () => (
    <div className="space-y-4">
      <DndContext sensors={sensors} onDragEnd={handleBoardDragEnd}>
        <div className="grid gap-4 xl:grid-cols-6">
          {board.map((column) => (
            <DroppableStageColumn
              key={column.stage}
              column={column}
              onCardClick={(card) => {
                const matched = opportunities.find((item) => item.opportunityId === card.opportunityId);
                openDialog({
                  type: 'opportunity',
                  item: matched || {
                    customerId: card.customerId || 0,
                    opportunityId: card.opportunityId,
                    opportunityName: card.opportunityName || '',
                    customerName: card.customerName,
                  },
                });
              }}
            />
          ))}
        </div>
      </DndContext>

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
                    { label: '编辑商机', icon: <Target size={14} />, onClick: () => openDialog({ type: 'opportunity', item }), semantic: 'edit', isPrimary: true },
                    { label: '赢单', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'winOpportunity', item }), semantic: 'process' },
                    { label: '输单', icon: <TriangleAlert size={14} />, onClick: () => setConfirm({ action: 'loseOpportunity', item: { ...item, lostReason: item.lostReason || '客户放弃' } }), semantic: 'disable' },
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
                    },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderQuoteTable = () => (
    <table className="w-full min-w-[980px]">
      <TableHeader>
        <tr>
          <TableHead>报价</TableHead>
          <TableHead>客户</TableHead>
          <TableHead>金额</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>合同</TableHead>
          <TableActionHead>操作</TableActionHead>
        </tr>
      </TableHeader>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {quotes.map((item) => (
          <tr key={item.quoteId}>
            <td className="px-4 py-3 text-sm">
              <div>{item.quoteName}</div>
              <div className="text-xs text-slate-500">{item.quoteNo || '-'}</div>
            </td>
            <td className="px-4 py-3 text-sm">{item.customerName || '-'}</td>
            <td className="px-4 py-3 text-sm">{item.totalAmount || 0}</td>
            <td className="px-4 py-3 text-sm">{renderStatus(item.status)}</td>
            <td className="px-4 py-3 text-sm">{item.contractNo || '-'}</td>
            <td className="px-4 py-3 text-right">
              <TableRowActions
                align="end"
                overflowLabel="更多"
                actions={[
                  { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                  { label: '编辑报价', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'quote', item }), semantic: 'edit', isPrimary: true },
                  { label: '提交提审', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'submitQuote', item }), hidden: item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'submit' },
                  { label: '发送报价', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'sendQuote', item }), hidden: item.status !== 'APPROVED' && item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'send' },
                  { label: '接受报价', icon: <RefreshCcw size={14} />, onClick: () => setConfirm({ action: 'acceptQuote', item }), hidden: item.status !== 'APPROVED' && item.status !== 'SENT', semantic: 'process' },
                  { label: '标记过期', icon: <TriangleAlert size={14} />, onClick: () => setConfirm({ action: 'expireQuote', item }), hidden: item.status === 'ACCEPTED' || item.status === 'EXPIRED', semantic: 'disable' },
                  {
                    label: '转合同',
                    icon: <Plus size={14} />,
                    onClick: async () => {
                      try {
                        const contractId = await crmApi.createContractDraft(item.quoteId!);
                        toast.success(`已生成合同草稿 #${contractId}`);
                        await load();
                        goToContract(contractId);
                        } catch (error) {
                          toast.error(getErrorMessage(error, '生成合同草稿失败'));
                        }
                      },
                      semantic: 'custom',
                    },
                  ]}
                />
              </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderReceivableTable = () => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/88">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Wallet size={16} />回款计划</div>
        <div className="mt-1 text-xs text-slate-500">主操作 = 新增回款。次操作统一放到行内。</div>
      </div>
      <table className="w-full">
        <TableHeader>
          <tr>
            <TableHead>名称</TableHead>
            <TableHead>状态 / 发票</TableHead>
            <TableHead>金额</TableHead>
            <TableActionHead>操作</TableActionHead>
          </tr>
        </TableHeader>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {receivables.map((item) => (
            <tr key={item.receivableId}>
              <td className="px-4 py-3 text-sm">{item.receivableName}</td>
              <td className="px-4 py-3 text-sm">
                <div>{renderStatus(item.status)}</div>
                <div className="text-xs text-slate-500">{renderInvoiceStatus(item.invoiceStatus)}</div>
              </td>
              <td className="px-4 py-3 text-sm">{item.plannedAmount || 0}</td>
              <td className="px-4 py-3 text-right">
                <TableRowActions
                  align="end"
                  overflowLabel="更多"
                  actions={[
                    { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                    { label: '编辑回款', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'receivable', item }), semantic: 'edit', isPrimary: true },
                    { label: '确认回款', icon: <Wallet size={14} />, onClick: () => setConfirm({ action: 'confirmReceivable', item }), hidden: item.status === 'RECEIVED', semantic: 'process' },
                    {
                      label: '绑定发票',
                      icon: <ReceiptText size={14} />,
                      onClick: async () => {
                        await loadReceivableInvoices(item);
                        openDialog({ type: 'receivable', item });
                      },
                      semantic: 'bind',
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

  const renderRenewalTable = () => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/88">
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
                    { label: '编辑续约', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'renewal', item }), semantic: 'edit', isPrimary: true },
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

  const renderTicketTable = () => (
    <table className="w-full min-w-[900px]">
      <TableHeader>
        <tr>
          <TableHead>工单</TableHead>
          <TableHead>客户</TableHead>
          <TableHead>严重度</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>负责人</TableHead>
          <TableActionHead>操作</TableActionHead>
        </tr>
      </TableHeader>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {tickets.map((item) => (
            <tr key={item.ticketId}>
              <td className="px-4 py-3 text-sm">{item.ticketTitle}</td>
              <td className="px-4 py-3 text-sm">{item.customerName || '-'}</td>
              <td className="px-4 py-3 text-sm">{renderSeverity(item.severity)}</td>
              <td className="px-4 py-3 text-sm">{renderStatus(item.status)}</td>
              <td className="px-4 py-3 text-sm">{item.ownerName || '-'}</td>
            <td className="px-4 py-3 text-right">
              <TableRowActions
                align="end"
                overflowLabel="更多"
                actions={[
                  { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                  { label: '编辑工单', icon: <LifeBuoy size={14} />, onClick: () => openDialog({ type: 'ticket', item }), semantic: 'edit', isPrimary: true },
                  { label: '解决工单', icon: <RefreshCcw size={14} />, onClick: () => setConfirm({ action: 'resolveTicket', item: { ...item, solution: item.solution || '已处理完成' } }), hidden: item.status === 'RESOLVED' || item.status === 'CLOSED', semantic: 'process' },
                  { label: '关闭工单', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'closeTicket', item }), hidden: item.status === 'CLOSED', semantic: 'disable' },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderDialog = () => {
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
          <div className="grid gap-4 md:grid-cols-2">
            <Input value={customerForm.customerName || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, customerName: e.target.value }))} placeholder="客户名称，例如：景曜科技" />
            <Input value={customerForm.customerCode || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, customerCode: e.target.value }))} placeholder="客户编码，留空自动生成" />
            <Input value={customerForm.ownerName || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="客户负责人" />
            <Input value={customerForm.customerTags || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, customerTags: e.target.value }))} placeholder="标签示例：重点客户,续约客户" />
            <Input value={customerForm.phone || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="联系电话" />
            <Input value={customerForm.email || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="联系邮箱" />
            <Textarea className="md:col-span-2" value={customerForm.remark || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="客户说明、当前合作情况、重点提醒" />
          </div>
        </BaseDialog>
      );
    }

    if (dialog.type === 'contact') {
      return (
        <BaseDialog open title={contactForm.contactId ? '编辑联系人' : '新增联系人'} onClose={() => openDialog(null)} footer={footer} width="wide">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Select value={contactForm.customerId ? String(contactForm.customerId) : ''} onValueChange={(value) => setContactForm((prev) => ({ ...prev, customerId: Number(value) }))}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Input value={contactForm.contactName || ''} onChange={(e) => setContactForm((prev) => ({ ...prev, contactName: e.target.value }))} placeholder="联系人姓名" />
            <Input value={contactForm.position || ''} onChange={(e) => setContactForm((prev) => ({ ...prev, position: e.target.value }))} placeholder="职位，例如：采购经理" />
            <Input value={contactForm.mobile || ''} onChange={(e) => setContactForm((prev) => ({ ...prev, mobile: e.target.value }))} placeholder="手机号" />
            <Input value={contactForm.email || ''} onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="邮箱" />
          </div>
        </BaseDialog>
      );
    }

    if (dialog.type === 'followUp') {
      return (
        <BaseDialog open title={followUpForm.followUpId ? '编辑跟进' : '新增跟进'} onClose={() => openDialog(null)} footer={footer} width="wide">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Select value={followUpForm.customerId ? String(followUpForm.customerId) : ''} onValueChange={(value) => setFollowUpForm((prev) => ({ ...prev, customerId: Number(value) }))}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select value={followUpForm.opportunityId ? String(followUpForm.opportunityId) : 'NONE'} onValueChange={(value) => setFollowUpForm((prev) => ({ ...prev, opportunityId: value === 'NONE' ? undefined : Number(value) }))}>
                <SelectTrigger><SelectValue placeholder="关联商机（可选）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">不关联商机</SelectItem>
                  {opportunityOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Textarea className="md:col-span-2" value={followUpForm.content || ''} onChange={(e) => setFollowUpForm((prev) => ({ ...prev, content: e.target.value }))} placeholder="跟进内容，例如：客户已确认报价范围，待内部审批。" />
            <Input value={followUpForm.ownerName || ''} onChange={(e) => setFollowUpForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="跟进人" />
            <Input type="datetime-local" value={followUpForm.nextFollowUpTime ? String(followUpForm.nextFollowUpTime).slice(0, 16) : ''} onChange={(e) => setFollowUpForm((prev) => ({ ...prev, nextFollowUpTime: `${e.target.value}:00` }))} placeholder="下次跟进时间" />
          </div>
        </BaseDialog>
      );
    }

    if (dialog.type === 'opportunity') {
      return (
        <BaseDialog open title={opportunityForm.opportunityId ? '编辑商机' : '新增商机'} onClose={() => openDialog(null)} footer={footer} width="wide">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Select value={opportunityForm.customerId ? String(opportunityForm.customerId) : ''} onValueChange={(value) => setOpportunityForm((prev) => ({ ...prev, customerId: Number(value) }))}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Input value={opportunityForm.opportunityName || ''} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, opportunityName: e.target.value }))} placeholder="商机名称，例如：景曜科技三年续约" />
            <Select value={opportunityForm.stage || 'LEAD'} onValueChange={(value) => setOpportunityForm((prev) => ({ ...prev, stage: value }))}>
              <SelectTrigger><SelectValue placeholder="商机阶段" /></SelectTrigger>
              <SelectContent>{Object.entries(stageLabelMap).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" value={String(opportunityForm.expectedAmount || 0)} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, expectedAmount: Number(e.target.value || 0) }))} placeholder="预计金额" />
            <Input type="number" value={String(opportunityForm.winRate || 0)} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, winRate: Number(e.target.value || 0) }))} placeholder="赢单率 0-100" />
            <Input value={opportunityForm.ownerName || ''} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="负责人" />
            <Input type="date" value={opportunityForm.expectedSignDate || ''} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, expectedSignDate: e.target.value }))} placeholder="预计签约日期" />
            <Textarea className="md:col-span-2" value={opportunityForm.remark || ''} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="商机背景、阶段说明、当前阻塞项" />
          </div>
        </BaseDialog>
      );
    }

    if (dialog.type === 'quote') {
      return (
        <BaseDialog open title={quoteForm.quoteId ? '编辑报价' : '新增报价'} onClose={() => openDialog(null)} footer={footer} width="wide">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Select value={quoteForm.customerId ? String(quoteForm.customerId) : ''} onValueChange={(value) => setQuoteForm((prev) => ({ ...prev, customerId: Number(value) }))}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select
                value={quoteForm.opportunityId ? String(quoteForm.opportunityId) : 'NONE'}
                onValueChange={(value) => {
                  if (value === 'NONE') {
                    setQuoteForm((prev) => ({ ...prev, opportunityId: undefined, opportunityName: undefined }));
                    return;
                  }
                  const matched = opportunities.find((item) => item.opportunityId === Number(value));
                  setQuoteForm((prev) => ({
                    ...prev,
                    opportunityId: Number(value),
                    opportunityName: matched?.opportunityName,
                    customerId: matched?.customerId || prev.customerId,
                    customerName: matched?.customerName || prev.customerName,
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="关联合同商机" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">不关联商机</SelectItem>
                  {opportunityOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input value={quoteForm.quoteName || ''} onChange={(e) => setQuoteForm((prev) => ({ ...prev, quoteName: e.target.value }))} placeholder="报价名称" />
            <Input type="number" value={String(quoteForm.totalAmount || 0)} onChange={(e) => setQuoteForm((prev) => ({ ...prev, totalAmount: Number(e.target.value || 0) }))} placeholder="总金额" />
            <Input type="number" value={String(quoteForm.taxAmount || 0)} onChange={(e) => setQuoteForm((prev) => ({ ...prev, taxAmount: Number(e.target.value || 0) }))} placeholder="税额" />
            <Input value={quoteForm.ownerName || ''} onChange={(e) => setQuoteForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="负责人" />
          </div>
        </BaseDialog>
      );
    }

    if (dialog.type === 'receivable') {
      return (
        <BaseDialog open title={receivableForm.receivableId ? '编辑回款' : '新增回款'} onClose={() => openDialog(null)} footer={footer} width="wide">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Select value={receivableForm.customerId ? String(receivableForm.customerId) : ''} onValueChange={(value) => setReceivableForm((prev) => ({ ...prev, customerId: Number(value) }))}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select
                value={receivableForm.contractId ? String(receivableForm.contractId) : 'NONE'}
                onValueChange={(value) => {
                  if (value === 'NONE') {
                    setReceivableForm((prev) => ({ ...prev, contractId: undefined, contractNo: undefined }));
                    return;
                  }
                  applyContractToReceivable(Number(value));
                }}
              >
                <SelectTrigger><SelectValue placeholder="选择OA合同" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">不关联合同</SelectItem>
                  {contractOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input value={receivableForm.receivableName || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, receivableName: e.target.value }))} placeholder="回款名称" />
            <Input type="number" value={String(receivableForm.plannedAmount || 0)} onChange={(e) => setReceivableForm((prev) => ({ ...prev, plannedAmount: Number(e.target.value || 0) }))} placeholder="计划金额" />
            <Input value={receivableForm.contractNo || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, contractNo: e.target.value }))} placeholder="合同编号" />
            <Input type="date" value={receivableForm.dueDate || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, dueDate: e.target.value }))} placeholder="到期日期" />
            {receivableForm.receivableId ? (
              <div className="md:col-span-2 space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-sm font-medium">销项发票联动</div>
                <div className="text-xs text-slate-500">当前发票状态：{renderInvoiceStatus(receivableForm.invoiceStatus)}</div>
                <div className="space-y-2">
                  {invoiceCandidates.length ? invoiceCandidates.map((item) => (
                    <div key={item.invoiceId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                      <div>
                        <div>{item.invoiceCode} / {item.invoiceNo}</div>
                        <div className="text-xs text-slate-500">{item.status || '-'} / {item.grossAmount || 0}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void bindInvoiceToReceivable(receivableForm, item.invoiceId!)} disabled={item.receivableId === receivableForm.receivableId}>
                        {item.receivableId === receivableForm.receivableId ? '已绑定' : '绑定'}
                      </Button>
                    </div>
                  )) : <div className="text-sm text-slate-500">暂无可绑定销项发票</div>}
                </div>
              </div>
            ) : null}
          </div>
        </BaseDialog>
      );
    }

    if (dialog.type === 'renewal') {
      return (
        <BaseDialog open title={renewalForm.renewalId ? '编辑续约' : '新增续约'} onClose={() => openDialog(null)} footer={footer} width="wide">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Select value={renewalForm.customerId ? String(renewalForm.customerId) : ''} onValueChange={(value) => setRenewalForm((prev) => ({ ...prev, customerId: Number(value) }))}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select
                value={renewalForm.contractId ? String(renewalForm.contractId) : 'NONE'}
                onValueChange={(value) => {
                  if (value === 'NONE') {
                    setRenewalForm((prev) => ({ ...prev, contractId: undefined, contractNo: undefined }));
                    return;
                  }
                  applyContractToRenewal(Number(value));
                }}
              >
                <SelectTrigger><SelectValue placeholder="选择OA合同" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">不关联合同</SelectItem>
                  {contractOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input value={renewalForm.renewalName || ''} onChange={(e) => setRenewalForm((prev) => ({ ...prev, renewalName: e.target.value }))} placeholder="续约名称" />
            <Input type="number" value={String(renewalForm.renewalAmount || 0)} onChange={(e) => setRenewalForm((prev) => ({ ...prev, renewalAmount: Number(e.target.value || 0) }))} placeholder="续约金额" />
            <Input value={renewalForm.contractNo || ''} onChange={(e) => setRenewalForm((prev) => ({ ...prev, contractNo: e.target.value }))} placeholder="合同编号" />
            <Input type="date" value={renewalForm.currentExpireDate || ''} onChange={(e) => setRenewalForm((prev) => ({ ...prev, currentExpireDate: e.target.value }))} placeholder="当前到期日期" />
          </div>
        </BaseDialog>
      );
    }

    return (
      <BaseDialog open title={ticketForm.ticketId ? '编辑工单' : '新增工单'} onClose={() => openDialog(null)} footer={footer} width="wide">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Select value={ticketForm.customerId ? String(ticketForm.customerId) : ''} onValueChange={(value) => setTicketForm((prev) => ({ ...prev, customerId: Number(value) }))}>
              <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
              <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input value={ticketForm.ticketTitle || ''} onChange={(e) => setTicketForm((prev) => ({ ...prev, ticketTitle: e.target.value }))} placeholder="工单标题" />
          <Input value={ticketForm.ownerName || ''} onChange={(e) => setTicketForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="负责人" />
          <Textarea className="md:col-span-2" value={ticketForm.description || ''} onChange={(e) => setTicketForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="问题描述、影响范围、当前处理方案" />
        </div>
      </BaseDialog>
    );
  };

  return (
    <div className="space-y-4">
      {renderDashboard()}

      <TablePageLayout
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="客户 / 商机 / 报价关键字" className="w-full sm:w-[280px]" />
              <div className="text-xs text-slate-500">当前视图：{tab === 'customer' ? '客户管理' : tab === 'opportunity' ? '商机管理' : tab === 'quote' ? '报价管理' : tab === 'receivable' ? '回款管理' : tab === 'renewal' ? '续约管理' : '服务工单'}</div>
            </div>
            <div className="flex items-center gap-2">
              {tab === 'customer' ? <Button size="sm" onClick={() => openDialog({ type: 'customer' })}><Plus size={14} className="mr-1.5" />新增客户</Button> : null}
              {tab === 'opportunity' ? <Button size="sm" onClick={() => openDialog({ type: 'opportunity' })}><Plus size={14} className="mr-1.5" />新增商机</Button> : null}
              {tab === 'quote' ? <Button size="sm" onClick={() => openDialog({ type: 'quote' })}><Plus size={14} className="mr-1.5" />新增报价</Button> : null}
              {tab === 'receivable' ? <Button size="sm" onClick={() => openDialog({ type: 'receivable' })}><Plus size={14} className="mr-1.5" />新增回款</Button> : null}
              {tab === 'renewal' ? <Button size="sm" onClick={() => openDialog({ type: 'renewal' })}><Plus size={14} className="mr-1.5" />新增续约</Button> : null}
              {tab === 'ticket' ? <Button size="sm" onClick={() => openDialog({ type: 'ticket' })}><Plus size={14} className="mr-1.5" />新增工单</Button> : null}
            </div>
          </div>
        )}
        table={(
          <div className="overflow-x-auto">
            {tab === 'customer' ? renderCustomerTable() : null}
            {tab === 'opportunity' ? renderOpportunityTable() : null}
            {tab === 'quote' ? renderQuoteTable() : null}
            {tab === 'receivable' ? renderReceivableTable() : null}
            {tab === 'renewal' ? renderRenewalTable() : null}
            {tab === 'ticket' ? renderTicketTable() : null}
          </div>
        )}
      />

      {renderDialog()}

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
}

