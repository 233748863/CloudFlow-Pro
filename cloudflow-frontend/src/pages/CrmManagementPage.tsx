import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRight, CalendarClock, Clock3, Eye, FileWarning, FolderKanban, Handshake, LifeBuoy, ListTodo, Plus, ReceiptText, RefreshCcw, Send, ShieldAlert, Target, Trash2, TriangleAlert, TrendingUp, UserRound, Users2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, Button, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea, UserSelector } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { TableRowActions } from '@/components/common/table-row-actions';
import { crmApi, CrmContact, CrmCustomer, CrmDashboardSummary, CrmFollowUp, CrmOpportunity, CrmOpportunityBoardCard, CrmOpportunityBoardColumn, CrmProduct, CrmQuote, CrmQuoteLine, CrmReceivable, CrmRenewal, CrmTicket } from '@/services/api/crm';
import { contractApi, OaContract } from '@/services/api/contractRisk';
import { invoiceApi, Invoice } from '@/services/api/invoice';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { useAuth } from '@/context/AuthContext';

type CrmTab = 'dashboard' | 'customer' | 'opportunity' | 'quote' | 'receivable' | 'renewal' | 'ticket';

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

const crmTabPathMap: Record<CrmTab, string> = {
  dashboard: '/office/crm',
  customer: '/office/crm/customers',
  opportunity: '/office/crm/opportunities',
  quote: '/office/crm/quotes',
  receivable: '/office/crm/receivables',
  renewal: '/office/crm/renewals',
  ticket: '/office/crm/tickets',
};

const crmPathTabMap: Record<string, CrmTab> = {
  '/office/crm': 'dashboard',
  '/office/crm/customers': 'customer',
  '/office/crm/opportunities': 'opportunity',
  '/office/crm/quotes': 'quote',
  '/office/crm/receivables': 'receivable',
  '/office/crm/renewals': 'renewal',
  '/office/crm/tickets': 'ticket',
};

const tabPermissionMap: Record<CrmTab, string> = {
  dashboard: 'crm:dashboard:view',
  customer: 'crm:customer:list',
  opportunity: 'crm:opportunity:list',
  quote: 'crm:quote:list',
  receivable: 'crm:receivable:list',
  renewal: 'crm:renewal:list',
  ticket: 'crm:ticket:list',
};

const tabLabelMap: Record<CrmTab, string> = {
  dashboard: '销售仪表盘',
  customer: '客户管理',
  opportunity: '商机管理',
  quote: '报价管理',
  receivable: '回款管理',
  renewal: '续约管理',
  ticket: '服务工单',
};

const emptyCustomer: CrmCustomer = { customerName: '', customerType: 'ENTERPRISE', status: 'ACTIVE' };
const emptyOpportunity: CrmOpportunity = { customerId: 0, opportunityName: '', stage: 'LEAD', status: 'OPEN', expectedAmount: 0, winRate: 0 };
const emptyQuoteLine: CrmQuoteLine = { quantity: 1, unitPrice: 0, discountRate: 100, taxRate: 0, lineAmount: 0, taxAmount: 0 };
const emptyQuote: CrmQuote = { customerId: 0, quoteName: '', totalAmount: 0, taxAmount: 0, currency: 'CNY', status: 'DRAFT', quoteLines: [emptyQuoteLine] };
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

const nativeSelectClassName = 'cf-control h-10 w-full rounded-xl px-4 py-2.5 text-sm appearance-auto';

const formatDashboardNumber = (value?: number) => Number(value || 0).toLocaleString('zh-CN');
const formatDashboardCurrency = (value?: number) => `¥${formatDashboardNumber(value)}`;
const formatDashboardDate = (value?: string) => {
  const formatted = formatDateTimeDisplay(value);
  return formatted === '-' ? '未设置' : formatted.slice(0, 10);
};

const DashboardMetricTile = ({
  label,
  value,
  hint,
  valueClassName = 'text-slate-900 dark:text-white',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  valueClassName?: string;
}) => (
  <div className="cf-section-card px-4 py-4">
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${valueClassName}`}>{value}</div>
    {hint ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
  </div>
);

const DashboardFocusItem = ({
  label,
  title,
  meta,
}: {
  label: string;
  title: string;
  meta?: string;
}) => (
  <div className="cf-section-card px-4 py-4">
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 text-sm font-medium text-slate-900 dark:text-white">{title}</div>
    {meta ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta}</div> : null}
  </div>
);

const DASHBOARD_TONE_STYLES = {
  cyan: {
    accent: 'text-cyan-700 dark:text-cyan-300',
    icon: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300',
    hover: 'group-hover:text-cyan-700 dark:group-hover:text-cyan-300',
  },
  emerald: {
    accent: 'text-emerald-700 dark:text-emerald-300',
    icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    hover: 'group-hover:text-emerald-700 dark:group-hover:text-emerald-300',
  },
  amber: {
    accent: 'text-amber-700 dark:text-amber-300',
    icon: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    hover: 'group-hover:text-amber-700 dark:group-hover:text-amber-300',
  },
  rose: {
    accent: 'text-rose-700 dark:text-rose-300',
    icon: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
    hover: 'group-hover:text-rose-700 dark:group-hover:text-rose-300',
  },
};

type DashboardTone = keyof typeof DASHBOARD_TONE_STYLES;

const DashboardSection = ({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="cf-section-card p-0">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="px-5 pt-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
      {aside ? <div className="px-5 pt-5">{aside}</div> : null}
    </div>
    <div className="border-t border-slate-100 p-5 dark:border-slate-800">{children}</div>
  </section>
);

const DashboardActionCard = ({
  tone = 'cyan',
  label,
  title,
  detail,
  meta,
  icon,
  actionLabel,
  onAction,
}: {
  tone?: DashboardTone;
  label: string;
  title: string;
  detail: string;
  meta: string;
  icon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) => {
  const toneStyle = DASHBOARD_TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onAction}
      className="group w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition-all duration-200 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900"
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneStyle.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detail}</div>
          <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{meta}</div>
        </div>
        <div className={`mt-1 text-slate-400 transition-colors ${toneStyle.hover}`}>
          <ArrowRight size={16} />
        </div>
      </div>
      <div className={`mt-3 text-xs font-medium ${toneStyle.accent}`}>
        {actionLabel}
      </div>
    </button>
  );
};

const DashboardFeedItem = ({
  tone = 'cyan',
  label,
  title,
  detail,
  icon,
  actionLabel,
  onAction,
}: {
  tone?: DashboardTone;
  label: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) => {
  const toneStyle = DASHBOARD_TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onAction}
      className="group w-full rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-left transition-all duration-200 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneStyle.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</div>
        </div>
        <div className={`mt-1 text-slate-400 transition-colors ${toneStyle.hover}`}>
          <ArrowRight size={15} />
        </div>
      </div>
      <div className={`mt-3 text-xs font-medium ${toneStyle.accent}`}>
        {actionLabel}
      </div>
    </button>
  );
};

const DashboardStageCard = ({
  label,
  count,
  amount,
  emphasis = false,
}: {
  label: string;
  count: number;
  amount: number;
  emphasis?: boolean;
}) => (
  <div className={`rounded-2xl border px-4 py-4 ${emphasis ? 'border-cyan-200 bg-cyan-50/60 dark:border-cyan-900/40 dark:bg-cyan-950/18' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60'}`}>
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 flex items-end justify-between gap-3">
      <div className={`text-2xl font-semibold tabular-nums ${emphasis ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-900 dark:text-white'}`}>
        {count}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{formatDashboardCurrency(amount)}</div>
    </div>
  </div>
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
  const { user } = useAuth();
  const userPermissions = user?.permissions || [];
  const hasPermission = (permission: string) =>
    userPermissions.includes(permission) || userPermissions.includes('*:*:*') || userPermissions.includes('*');
  const availableTabs = (Object.keys(tabPermissionMap) as CrmTab[]).filter((item) => hasPermission(tabPermissionMap[item]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [tab, setTab] = useState<CrmTab>('dashboard');
  const [keyword, setKeyword] = useState('');
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [customerRefs, setCustomerRefs] = useState<CrmCustomer[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [followUps, setFollowUps] = useState<CrmFollowUp[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [opportunityRefs, setOpportunityRefs] = useState<CrmOpportunity[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [productRefs, setProductRefs] = useState<CrmProduct[]>([]);
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

  const productOptions = useMemo(
    () => productRefs.map((item) => ({ label: `${item.productName} / ${item.productNo || '-'} / ${Number(item.standardPrice || 0).toLocaleString('zh-CN')}`, value: String(item.productId) })),
    [productRefs],
  );

  const navigateToTab = (nextTab: CrmTab) => {
    navigate(crmTabPathMap[nextTab]);
  };

  const load = async () => {
    try {
      const [c, cRef, ct, fu, o, oRef, q, r, n, t, contractResult, dashboardResult, boardResult, productResult] = await Promise.all([
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
        crmApi.listProducts({ pageNum: 1, pageSize: 200, status: 'ACTIVE' }),
      ]);
      setCustomers(c.rows || []);
      setCustomerRefs(cRef.rows || []);
      setContacts(ct.rows || []);
      setFollowUps(fu.rows || []);
      setOpportunities(o.rows || []);
      setOpportunityRefs(oRef.rows || []);
      setQuotes(q.rows || []);
      setProductRefs(productResult.rows || []);
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
    const fallbackTab = availableTabs[0] || 'dashboard';
    const pathTab = crmPathTabMap[location.pathname];
    if (pathTab && hasPermission(tabPermissionMap[pathTab])) {
      setTab(pathTab);
      return;
    }

    if (pathTab && crmTabPathMap[fallbackTab] !== location.pathname) {
      navigate(crmTabPathMap[fallbackTab], { replace: true });
      setTab(fallbackTab);
      return;
    }

    setTab(fallbackTab);
  }, [location.pathname, userPermissions.join(',')]);

  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0] || 'dashboard');
    }
  }, [tab, availableTabs.join(',')]);

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
    if (next.type === 'quote') {
      if (next.item?.quoteId) {
        void crmApi.getQuoteDetail(next.item.quoteId)
          .then((detail) => {
            setQuoteForm({
              ...emptyQuote,
              ...detail,
              quoteLines: detail.quoteLines && detail.quoteLines.length ? detail.quoteLines : [{ ...emptyQuoteLine, sortNo: 1 }],
            });
          })
          .catch((error) => {
            toast.error(getErrorMessage(error, '加载报价明细失败'));
            setQuoteForm(next.item || emptyQuote);
          });
      } else {
        setQuoteForm({
          ...emptyQuote,
          ...(next.item || {}),
          quoteLines: next.item?.quoteLines && next.item.quoteLines.length ? next.item.quoteLines : [{ ...emptyQuoteLine, sortNo: 1 }],
        });
      }
    }
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

  const calcQuoteLineAmount = (line: CrmQuoteLine) => {
    const quantity = Number(line.quantity || 0);
    const unitPrice = Number(line.unitPrice || 0);
    const discountRate = Number(line.discountRate ?? 100);
    return Number(((quantity * unitPrice * discountRate) / 100).toFixed(2));
  };

  const calcQuoteTaxAmount = (line: CrmQuoteLine) => {
    const lineAmount = Number(line.lineAmount ?? calcQuoteLineAmount(line));
    const taxRate = Number(line.taxRate || 0);
    return Number(((lineAmount * taxRate) / 100).toFixed(2));
  };

  const syncQuoteTotals = (lines: CrmQuoteLine[]) => {
    const totalAmount = Number(lines.reduce((sum, line) => sum + Number(line.lineAmount || 0), 0).toFixed(2));
    const taxAmount = Number(lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0).toFixed(2));
    setQuoteForm((prev) => ({ ...prev, quoteLines: lines, totalAmount, taxAmount }));
  };

  const updateQuoteLine = (index: number, patch: Partial<CrmQuoteLine>) => {
    const currentLines = quoteForm.quoteLines && quoteForm.quoteLines.length ? quoteForm.quoteLines : [emptyQuoteLine];
    const nextLines = currentLines.map((line, lineIndex) => {
      if (lineIndex !== index) {
        return line;
      }
      const merged = { ...line, ...patch };
      const lineAmount = calcQuoteLineAmount(merged);
      const taxAmount = calcQuoteTaxAmount({ ...merged, lineAmount });
      return {
        ...merged,
        sortNo: merged.sortNo || index + 1,
        lineAmount,
        taxAmount,
      };
    });
    syncQuoteTotals(nextLines);
  };

  const selectQuoteLineProduct = (index: number, productId?: number) => {
    if (!productId) {
      updateQuoteLine(index, {
        productId: undefined,
        productNo: undefined,
        productName: undefined,
        category: undefined,
        spec: undefined,
        unit: undefined,
        unitPrice: 0,
      });
      return;
    }
    const matched = productRefs.find((item) => item.productId === productId);
    if (!matched) {
      return;
    }
    updateQuoteLine(index, {
      productId: matched.productId,
      productNo: matched.productNo,
      productName: matched.productName,
      category: matched.category,
      spec: matched.spec,
      unit: matched.unit,
      unitPrice: Number(matched.standardPrice || 0),
    });
  };

  const addQuoteLine = () => {
    const currentLines = quoteForm.quoteLines && quoteForm.quoteLines.length ? quoteForm.quoteLines : [];
    const nextLines = [...currentLines, { ...emptyQuoteLine, sortNo: currentLines.length + 1 }];
    syncQuoteTotals(nextLines);
  };

  const removeQuoteLine = (index: number) => {
    const currentLines = quoteForm.quoteLines && quoteForm.quoteLines.length ? quoteForm.quoteLines : [];
    const filtered = currentLines.filter((_, lineIndex) => lineIndex !== index).map((line, lineIndex) => ({ ...line, sortNo: lineIndex + 1 }));
    syncQuoteTotals(filtered.length ? filtered : [{ ...emptyQuoteLine, sortNo: 1 }]);
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
    const totalOutstandingAmount = dashboard.agingBuckets.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0);
    const totalReceivableCount = dashboard.agingBuckets.reduce((sum, item) => sum + Number(item.receivableCount || 0), 0);
    const riskAndTodoCount = dashboard.staleFollowCustomers.length
      + dashboard.stalledOpportunities.length
      + dashboard.crossModuleTodos.length
      + dashboard.crossModuleRisks.length
      + dashboard.budgetAlerts.length
      + dashboard.invoiceExceptions.length;
    const priorityQuote = dashboard.pendingQuotes[0];
    const priorityRisk = dashboard.crossModuleRisks[0];
    const staleCustomer = dashboard.staleFollowCustomers[0];
    const currentViewLabel = tabLabelMap[tab];
    const wonOpportunityCount = opportunities.filter((item) => item.stage === 'WON').length;
    const negotiationOpportunityCount = opportunities.filter((item) => item.stage === 'NEGOTIATION').length;
    const sentQuoteCount = quotes.filter((item) => item.status === 'SENT').length;
    const acceptedQuote = quotes.find((item) => item.status === 'ACCEPTED');
    const acceptedQuoteCount = quotes.filter((item) => item.status === 'ACCEPTED').length;
    const unexpiredBucket = dashboard.agingBuckets.find((item) => item.bucketName?.includes('未逾期'));
    const overdueReceivableCount = dashboard.agingBuckets
      .filter((item) => !item.bucketName?.includes('未逾期'))
      .reduce((sum, item) => sum + Number(item.receivableCount || 0), 0);
    const firstOverdueBucket = dashboard.agingBuckets.find((item) => !item.bucketName?.includes('未逾期') && Number(item.receivableCount || 0) > 0);
    const receivedReceivableCount = receivables.filter((item) => item.status === 'RECEIVED').length;
    const negotiationRenewalCount = renewals.filter((item) => item.status === 'NEGOTIATING').length;
    const highRiskRenewal = renewals.find((item) => item.riskLevel === 'RED');
    const highRiskRenewalCount = renewals.filter((item) => item.riskLevel === 'RED').length;
    const processingTicket = tickets.find((item) => item.status === 'OPEN');
    const resolvedTicketCount = tickets.filter((item) => item.status === 'RESOLVED').length;

    if (tab === 'dashboard') {
      const funnelColumns = (board.length ? board : dashboard.funnel) || [];
      const activeFunnelColumns = (funnelColumns.filter((item) => item.stage !== 'WON' && item.stage !== 'LOST').slice(0, 4).length
        ? funnelColumns.filter((item) => item.stage !== 'WON' && item.stage !== 'LOST').slice(0, 4)
        : funnelColumns.slice(0, 4));
      const pipelineAmount = funnelColumns.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
      const pendingQuoteAmount = dashboard.pendingQuotes.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
      const overdueBuckets = dashboard.agingBuckets.filter((item) => !item.bucketName?.includes('未逾期'));
      const overdueReceivableAmount = overdueBuckets.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0);
      const renewalWindowAmount = dashboard.renewalWindows.reduce((sum, item) => sum + Number(item.renewalAmount || 0), 0);
      const acceptedQuoteAmount = quotes
        .filter((item) => item.status === 'ACCEPTED')
        .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
      const negotiationColumn = funnelColumns.find((item) => item.stage === 'NEGOTIATION');

      const openDashboardPath = (path?: string, fallback?: () => void) => {
        if (path) {
          navigate(path);
          return;
        }
        fallback?.();
      };

      const actionCards: Array<{
        key: string;
        tone: DashboardTone;
        label: string;
        title: string;
        detail: string;
        meta: string;
        icon: React.ReactNode;
        actionLabel: string;
        onAction: () => void;
      }> = [];

      if (priorityQuote) {
        actionCards.push({
          key: `quote-${priorityQuote.quoteId || 'priority'}`,
          tone: 'emerald',
          label: '报价审批',
          title: priorityQuote.quoteName || '待审批报价',
          detail: `${priorityQuote.customerName || '-'} · ${formatDashboardCurrency(priorityQuote.totalAmount)}`,
          meta: `当前有 ${dashboard.pendingQuotes.length} 条报价在审批链中，优先处理金额最高的一条。`,
          icon: <ReceiptText size={18} />,
          actionLabel: '处理报价',
          onAction: () => navigateToTab('quote'),
        });
      }

      if (firstOverdueBucket) {
        actionCards.push({
          key: `receivable-${firstOverdueBucket.bucketCode || 'overdue'}`,
          tone: 'amber',
          label: '回款催收',
          title: firstOverdueBucket.bucketName || '逾期账款',
          detail: `${firstOverdueBucket.receivableCount || 0} 条 · ${formatDashboardCurrency(firstOverdueBucket.outstandingAmount)}`,
          meta: '逾期账款直接影响现金流，优先进入回款台账逐条推进。',
          icon: <Wallet size={18} />,
          actionLabel: '查看回款',
          onAction: () => navigateToTab('receivable'),
        });
      }

      if (dashboard.renewalWindows[0]) {
        const renewal = dashboard.renewalWindows[0];
        actionCards.push({
          key: `renewal-${renewal.renewalId || 'window'}`,
          tone: 'cyan',
          label: '续约推进',
          title: renewal.renewalName || '临近续约客户',
          detail: `${renewal.customerName || '-'} · ${formatDashboardCurrency(renewal.renewalAmount)}`,
          meta: `到期日 ${formatDashboardDate(renewal.nextExpireDate || renewal.currentExpireDate)}，进入续约列表继续推进。`,
          icon: <CalendarClock size={18} />,
          actionLabel: '查看续约',
          onAction: () => navigateToTab('renewal'),
        });
      }

      if (dashboard.highSeverityTickets[0]) {
        const ticket = dashboard.highSeverityTickets[0];
        actionCards.push({
          key: `ticket-${ticket.ticketId || 'critical'}`,
          tone: 'rose',
          label: '服务升级',
          title: ticket.ticketTitle || '高严重度工单',
          detail: `${ticket.customerName || '-'} · ${renderSeverity(ticket.severity)}`,
          meta: `工单到期 ${formatDashboardDate(ticket.dueTime)}，先处理客户侧风险再推进成交。`,
          icon: <LifeBuoy size={18} />,
          actionLabel: '处理工单',
          onAction: () => navigateToTab('ticket'),
        });
      }

      if (dashboard.stalledOpportunities[0]) {
        const stalled = dashboard.stalledOpportunities[0];
        actionCards.push({
          key: `opportunity-${stalled.opportunityId || 'stalled'}`,
          tone: 'amber',
          label: '商机卡点',
          title: stalled.opportunityName || '阶段停滞商机',
          detail: `${stalled.customerName || '-'} · ${renderStatus(stalled.stage)} · ${formatDashboardCurrency(stalled.expectedAmount)}`,
          meta: `预计签约 ${formatDashboardDate(stalled.expectedSignDate)}，需要回到商机看板重启推进。`,
          icon: <Target size={18} />,
          actionLabel: '查看商机',
          onAction: () => navigateToTab('opportunity'),
        });
      }

      if (staleCustomer) {
        actionCards.push({
          key: `customer-${staleCustomer.customerId || 'stale'}`,
          tone: staleCustomer.healthLevel === 'RED' ? 'rose' : 'amber',
          label: '客户失温',
          title: staleCustomer.customerName || '7天未跟进客户',
          detail: `${staleCustomer.ownerName || '未分配负责人'} · ${renderHealthLabel(staleCustomer.healthLevel)}`,
          meta: `上次跟进 ${formatDashboardDate(staleCustomer.lastFollowUpTime)}，建议直接进入客户 360 处理。`,
          icon: <Users2 size={18} />,
          actionLabel: '打开客户',
          onAction: () => openCustomerWorkspace(staleCustomer.customerId),
        });
      }

      if (actionCards.length < 4 && acceptedQuote) {
        actionCards.push({
          key: `accepted-${acceptedQuote.quoteId || 'quote'}`,
          tone: 'emerald',
          label: '合同转化',
          title: acceptedQuote.quoteName || '已接受报价',
          detail: `${acceptedQuote.customerName || '-'} · ${formatDashboardCurrency(acceptedQuote.totalAmount)}`,
          meta: '客户已接受报价，建议尽快转合同草稿，缩短签约链路。',
          icon: <TrendingUp size={18} />,
          actionLabel: '查看报价',
          onAction: () => navigateToTab('quote'),
        });
      }

      const riskFeedItems: Array<{
        key: string;
        tone: DashboardTone;
        label: string;
        title: string;
        detail: string;
        icon: React.ReactNode;
        actionLabel: string;
        onAction: () => void;
      }> = [];

      dashboard.crossModuleRisks.slice(0, 2).forEach((item, index) => {
        riskFeedItems.push({
          key: `risk-${item.id || index}`,
          tone: item.level === 'RED' ? 'rose' : 'amber',
          label: item.sourceLabel || item.module || '协同风险',
          title: item.title || '跨模块风险',
          detail: item.description || `${renderStatus(item.status)} · ${item.level || '需关注'}`,
          icon: <ShieldAlert size={16} />,
          actionLabel: '打开风险',
          onAction: () => openDashboardPath(item.path, () => navigate('/office/crm')),
        });
      });

      dashboard.budgetAlerts.slice(0, 1).forEach((item, index) => {
        riskFeedItems.push({
          key: `budget-${item.budgetId || index}`,
          tone: 'amber',
          label: '预算阈值',
          title: item.budgetName || '预算预警',
          detail: `${item.projectName || '未关联项目'} · ${item.thresholdStatus || item.status || '待处理'}`,
          icon: <TriangleAlert size={16} />,
          actionLabel: '打开预算',
          onAction: () => navigate('/office/budget'),
        });
      });

      dashboard.invoiceExceptions.slice(0, 1).forEach((item, index) => {
        riskFeedItems.push({
          key: `invoice-${item.invoiceId || index}`,
          tone: 'rose',
          label: '发票异常',
          title: item.invoiceCode || item.invoiceNo || '销项发票异常',
          detail: `${item.status || '-'} · ${formatDashboardCurrency(item.grossAmount)}`,
          icon: <FileWarning size={16} />,
          actionLabel: '打开发票',
          onAction: () => navigate('/office/invoice'),
        });
      });

      if (riskFeedItems.length < 4 && staleCustomer) {
        riskFeedItems.push({
          key: `risk-customer-${staleCustomer.customerId || 'stale'}`,
          tone: staleCustomer.healthLevel === 'RED' ? 'rose' : 'amber',
          label: '客户失温',
          title: staleCustomer.customerName || '跟进停滞客户',
          detail: `${staleCustomer.ownerName || '未分配负责人'} · 上次跟进 ${formatDashboardDate(staleCustomer.lastFollowUpTime)}`,
          icon: <Clock3 size={16} />,
          actionLabel: '打开客户',
          onAction: () => openCustomerWorkspace(staleCustomer.customerId),
        });
      }

      const todoFeedItems = dashboard.crossModuleTodos.slice(0, 5).map((item, index) => ({
        key: `todo-${item.id || index}`,
        tone: 'cyan' as DashboardTone,
        label: item.sourceLabel || item.module || '协同待办',
        title: item.title || '待办事项',
        detail: item.description || `${renderStatus(item.status)} · 直接进入源业务继续处理`,
        icon: <ListTodo size={16} />,
        actionLabel: '打开事项',
        onAction: () => openDashboardPath(item.path, () => navigate('/office/crm')),
      }));

      const focusFeedItems = [...riskFeedItems, ...todoFeedItems].slice(0, 5);

      return (
        <section className="space-y-4 animate-fade-in">
          <div className="cf-section-card bg-mesh-gradient p-0">
            <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">客户经营工作台</h2>
              </div>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardMetricTile
                label="成交管道"
                value={formatDashboardCurrency(pipelineAmount)}
                hint={`${opportunities.length} 个商机，谈判阶段 ${Number(negotiationColumn?.count || 0)} 个`}
                valueClassName="text-slate-900 dark:text-white"
              />
              <DashboardMetricTile
                label="待审批金额"
                value={formatDashboardCurrency(pendingQuoteAmount)}
                hint={`${dashboard.pendingQuotes.length} 条报价待处理`}
                valueClassName="text-emerald-700 dark:text-emerald-300"
              />
              <DashboardMetricTile
                label="逾期回款"
                value={formatDashboardCurrency(overdueReceivableAmount)}
                hint={`${overdueReceivableCount} 条需催收`}
                valueClassName="text-amber-700 dark:text-amber-300"
              />
              <DashboardMetricTile
                label="续约窗口"
                value={formatDashboardCurrency(renewalWindowAmount)}
                hint={`${dashboard.renewalWindows.length} 条临近到期，已接受报价 ${formatDashboardCurrency(acceptedQuoteAmount)}`}
                valueClassName="text-cyan-700 dark:text-cyan-300"
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_340px]">
            <DashboardSection
              title="优先处理"
              aside={(
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  客户 {customers.length} / 商机 {opportunities.length} / 回款 {totalReceivableCount}
                </div>
              )}
            >
              {actionCards.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {actionCards.slice(0, 4).map((item) => (
                    <DashboardActionCard
                      key={item.key}
                      tone={item.tone}
                      label={item.label}
                      title={item.title}
                      detail={item.detail}
                      meta={item.meta}
                      icon={item.icon}
                      actionLabel={item.actionLabel}
                      onAction={item.onAction}
                    />
                  ))}
                </div>
              ) : (
                <div className="cf-section-card text-sm text-slate-600 dark:text-slate-300">
                  当前没有需要首页优先升级处理的事项。
                </div>
              )}
            </DashboardSection>

            <DashboardSection
              title="风险与协同"
              aside={(
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  风险 {riskAndTodoCount} / 待办 {dashboard.crossModuleTodos.length}
                </div>
              )}
            >
              {focusFeedItems.length ? (
                <div className="space-y-3">
                  {focusFeedItems.map((item) => (
                    <DashboardFeedItem
                      key={item.key}
                      tone={item.tone}
                      label={item.label}
                      title={item.title}
                      detail={item.detail}
                      icon={item.icon}
                      actionLabel={item.actionLabel}
                      onAction={item.onAction}
                    />
                  ))}
                </div>
              ) : (
                <div className="cf-section-card text-sm text-slate-600 dark:text-slate-300">
                  当前没有跨模块风险或待办。
                </div>
              )}
            </DashboardSection>
          </div>

          <DashboardSection
            title="成交推进"
            aside={(
              <div className="text-xs text-slate-500 dark:text-slate-400">
                商务谈判 {Number(negotiationColumn?.count || 0)} 个 / {formatDashboardCurrency(negotiationColumn?.totalAmount)}
              </div>
            )}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {activeFunnelColumns.map((column) => (
                <DashboardStageCard
                  key={column.stage || column.stageLabel}
                  label={column.stageLabel || column.stage || '-'}
                  count={Number(column.count || 0)}
                  amount={Number(column.totalAmount || 0)}
                  emphasis={column.stage === 'PROPOSAL' || column.stage === 'NEGOTIATION'}
                />
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {dashboard.stalledOpportunities.length ? dashboard.stalledOpportunities.slice(0, 2).map((item) => (
                <div key={item.opportunityId} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/18">
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-300">阶段卡点</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{item.opportunityName || '未命名商机'}</div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {item.customerName || '-'} · {renderStatus(item.stage)} · {formatDashboardCurrency(item.expectedAmount)}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">预计签约 {formatDashboardDate(item.expectedSignDate)}</div>
                </div>
              )) : (
                <div className="cf-section-card text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
                  当前没有阶段停滞商机。
                </div>
              )}
            </div>
          </DashboardSection>
        </section>
      );
    }

    let description = '';
    let badgeText = '';
    let metrics: Array<{ label: string; value: React.ReactNode; hint?: string; valueClassName?: string }> = [];
    let focusItems: Array<{ label: string; title: string; meta?: string }> = [];

    if (tab === 'customer') {
      description = '客户、报价、回款与跨模块协同的经营摘要';
      badgeText = `${customers.length} 个客户`;
      metrics = [
        { label: '待审批报价', value: dashboard.pendingQuotes.length, hint: '待经理审批', valueClassName: 'text-teal-700 dark:text-teal-300' },
        { label: '回款余额', value: formatDashboardNumber(totalOutstandingAmount), hint: `${totalReceivableCount} 条回款计划`, valueClassName: 'text-cyan-700 dark:text-cyan-300' },
        { label: '重点续约', value: dashboard.renewalWindows.length, hint: '90天续约窗口' },
        { label: '风险与协同', value: riskAndTodoCount, hint: '停滞、预算阈值、跨模块待办', valueClassName: 'text-amber-700 dark:text-amber-300' },
      ];
      focusItems = [
        {
          label: '优先事项',
          title: priorityQuote?.quoteName || '当前无待审批报价',
          meta: priorityQuote ? `${priorityQuote.customerName || '-'} / ${formatDashboardNumber(priorityQuote.totalAmount)}` : '可把精力转向客户经营与回款跟进',
        },
        {
          label: '协同提醒',
          title: dashboard.crossModuleTodos[0]?.title || priorityRisk?.title || staleCustomer?.customerName || '当前无跨模块待办',
          meta: dashboard.crossModuleTodos[0]
            ? `${dashboard.crossModuleTodos[0].sourceLabel || dashboard.crossModuleTodos[0].module || '-'} / ${renderStatus(dashboard.crossModuleTodos[0].status)}`
            : priorityRisk
              ? `${priorityRisk.sourceLabel || priorityRisk.module || '-'} / ${renderStatus(priorityRisk.status)}`
              : staleCustomer
                ? '7天未跟进客户'
                : '经营协同状态正常',
        },
      ];
    }

    if (tab === 'opportunity') {
      description = '聚焦商机推进、赢单阶段与停滞风险';
      badgeText = `${opportunities.length} 个商机`;
      metrics = [
        { label: '当前商机', value: opportunities.length, hint: '列表与看板口径' },
        { label: '商务谈判', value: negotiationOpportunityCount, hint: 'NEGOTIATION 阶段', valueClassName: 'text-cyan-700 dark:text-cyan-300' },
        { label: '赢单商机', value: wonOpportunityCount, hint: '已进入赢单', valueClassName: 'text-emerald-700 dark:text-emerald-300' },
        { label: '阶段超时', value: dashboard.stalledOpportunities.length, hint: '需要重新推进', valueClassName: 'text-amber-700 dark:text-amber-300' },
      ];
      focusItems = [
        {
          label: '当前关注',
          title: dashboard.stalledOpportunities[0]?.opportunityName || '当前无阶段超时商机',
          meta: dashboard.stalledOpportunities[0] ? `${dashboard.stalledOpportunities[0].customerName || '-'} / ${renderStatus(dashboard.stalledOpportunities[0].stage)}` : '看板可直接拖拽推进阶段',
        },
        {
          label: '相关报价',
          title: priorityQuote?.quoteName || '当前无待审批报价',
          meta: priorityQuote ? `${priorityQuote.customerName || '-'} / ${formatDashboardNumber(priorityQuote.totalAmount)}` : '商机可继续转报价或转项目',
        },
      ];
    }

    if (tab === 'quote') {
      description = '报价流转、发送状态与合同转化摘要';
      badgeText = `${quotes.length} 条报价`;
      metrics = [
        { label: '报价总数', value: quotes.length, hint: '当前列表' },
        { label: '待审批', value: dashboard.pendingQuotes.length, hint: '审批链中', valueClassName: 'text-teal-700 dark:text-teal-300' },
        { label: '已发送', value: sentQuoteCount, hint: '已对客发送', valueClassName: 'text-cyan-700 dark:text-cyan-300' },
        { label: '已接受', value: acceptedQuoteCount, hint: '可继续转合同', valueClassName: 'text-emerald-700 dark:text-emerald-300' },
      ];
      focusItems = [
        {
          label: '优先处理',
          title: priorityQuote?.quoteName || '当前无待审批报价',
          meta: priorityQuote ? `${priorityQuote.customerName || '-'} / ${formatDashboardNumber(priorityQuote.totalAmount)}` : '报价审批状态正常',
        },
        {
          label: '合同转化',
          title: acceptedQuote?.quoteName || '当前无已接受报价',
          meta: acceptedQuote ? `${acceptedQuote.customerName || '-'} / 可转合同草稿` : '待客户确认后可继续转合同',
        },
      ];
    }

    if (tab === 'receivable') {
      description = '回款计划、账龄结构与异常联动摘要';
      badgeText = `${receivables.length} 条回款`;
      metrics = [
        { label: '回款计划', value: receivables.length, hint: '当前列表' },
        { label: '未逾期', value: Number(unexpiredBucket?.receivableCount || 0), hint: '仍在计划窗口', valueClassName: 'text-emerald-700 dark:text-emerald-300' },
        { label: '逾期账款', value: overdueReceivableCount, hint: '需重点催收', valueClassName: 'text-amber-700 dark:text-amber-300' },
        { label: '已回款', value: receivedReceivableCount, hint: '状态 RECEIVED', valueClassName: 'text-cyan-700 dark:text-cyan-300' },
      ];
      focusItems = [
        {
          label: '当前账龄',
          title: firstOverdueBucket?.bucketName || '当前无逾期账款',
          meta: firstOverdueBucket ? `${firstOverdueBucket.receivableCount || 0} 条 / ${formatDashboardNumber(firstOverdueBucket.outstandingAmount)}` : '回款账龄结构稳定',
        },
        {
          label: '联动异常',
          title: dashboard.invoiceExceptions[0]?.invoiceCode || dashboard.budgetAlerts[0]?.budgetName || '当前无联动异常',
          meta: dashboard.invoiceExceptions[0]
            ? `发票 ${dashboard.invoiceExceptions[0].invoiceNo || '-'} / ${dashboard.invoiceExceptions[0].status || '-'}`
            : dashboard.budgetAlerts[0]
              ? `预算 ${dashboard.budgetAlerts[0].thresholdStatus || '-'}`
              : '销项发票与预算联动正常',
        },
      ];
    }

    if (tab === 'renewal') {
      description = '续约窗口、洽谈推进与风险识别摘要';
      badgeText = `${renewals.length} 条续约`;
      metrics = [
        { label: '续约总数', value: renewals.length, hint: '当前列表' },
        { label: '90天窗口', value: dashboard.renewalWindows.length, hint: '临近到期', valueClassName: 'text-cyan-700 dark:text-cyan-300' },
        { label: '洽谈中', value: negotiationRenewalCount, hint: 'NEGOTIATING 状态' },
        { label: '高风险', value: highRiskRenewalCount, hint: '风险等级 RED', valueClassName: 'text-amber-700 dark:text-amber-300' },
      ];
      focusItems = [
        {
          label: '续约关注',
          title: dashboard.renewalWindows[0]?.renewalName || '当前无90天续约窗口',
          meta: dashboard.renewalWindows[0] ? `${dashboard.renewalWindows[0].customerName || '-'} / ${formatDashboardNumber(dashboard.renewalWindows[0].renewalAmount)}` : '续约节奏正常',
        },
        {
          label: '风险提示',
          title: highRiskRenewal?.renewalName || '当前无高风险续约',
          meta: highRiskRenewal ? `${highRiskRenewal.customerName || '-'} / ${highRiskRenewal.riskReason || '-'}` : '当前无红色风险续约',
        },
      ];
    }

    if (tab === 'ticket') {
      description = '服务工单、严重度与处理进度摘要';
      badgeText = `${tickets.length} 条工单`;
      metrics = [
        { label: '工单总数', value: tickets.length, hint: '当前列表' },
        { label: '高严重度', value: dashboard.highSeverityTickets.length, hint: 'HIGH / CRITICAL', valueClassName: 'text-amber-700 dark:text-amber-300' },
        { label: '处理中', value: tickets.filter((item) => item.status === 'OPEN').length, hint: 'OPEN 状态', valueClassName: 'text-cyan-700 dark:text-cyan-300' },
        { label: '已解决', value: resolvedTicketCount, hint: 'RESOLVED 状态', valueClassName: 'text-emerald-700 dark:text-emerald-300' },
      ];
      focusItems = [
        {
          label: '优先工单',
          title: dashboard.highSeverityTickets[0]?.ticketTitle || '当前无高严重度工单',
          meta: dashboard.highSeverityTickets[0] ? `${dashboard.highSeverityTickets[0].customerName || '-'} / ${renderSeverity(dashboard.highSeverityTickets[0].severity)}` : '工单风险可控',
        },
        {
          label: '待处理',
          title: processingTicket?.ticketTitle || '当前无处理中工单',
          meta: processingTicket ? `${processingTicket.customerName || '-'} / ${renderStatus(processingTicket.status)}` : '可把精力转向客户经营',
        },
      ];
    }

    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{currentViewLabel}总览</h2>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</div>
          </div>
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {badgeText}
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((item) => (
              <DashboardMetricTile
                key={item.label}
                label={item.label}
                value={item.value}
                hint={item.hint}
                valueClassName={item.valueClassName}
              />
            ))}
          </div>
          <div className="grid gap-3">
            {focusItems.map((item) => (
              <DashboardFocusItem
                key={item.label}
                label={item.label}
                title={item.title}
                meta={item.meta}
              />
            ))}
          </div>
        </div>
      </section>
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
                    { label: '编辑客户', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'customer', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:customer:edit' },
                    { label: '新增联系人', icon: <UserRound size={14} />, onClick: () => openDialog({ type: 'contact', item: { ...emptyContact, customerId: item.customerId! } }), semantic: 'custom', permissionKey: 'crm:contact:add' },
                    { label: '新增跟进', icon: <RefreshCcw size={14} />, onClick: () => openDialog({ type: 'followUp', item: { ...emptyFollowUp, customerId: item.customerId! } }), semantic: 'custom', permissionKey: 'crm:follow-up:add' },
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
                        { label: '输单', icon: <TriangleAlert size={14} />, onClick: () => setConfirm({ action: 'loseOpportunity', item: { ...item, lostReason: item.lostReason || '客户放弃' } }), semantic: 'disable', permissionKey: 'crm:opportunity:lose' },
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
            <td className="px-4 py-3 text-sm">
              <div>{item.totalAmount || 0}</div>
              <div className="text-xs text-slate-500">{item.quoteLines?.length || 0} 行 / 税额 {item.taxAmount || 0}</div>
            </td>
            <td className="px-4 py-3 text-sm">{renderStatus(item.status)}</td>
            <td className="px-4 py-3 text-sm">{item.contractNo || '-'}</td>
            <td className="px-4 py-3 text-right">
              <TableRowActions
                align="end"
                overflowLabel="更多"
                actions={[
                  { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                  { label: '编辑报价', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'quote', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:quote:edit' },
                  { label: '提交提审', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'submitQuote', item }), hidden: item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'submit', permissionKey: 'crm:quote:submit' },
                  { label: '发送报价', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'sendQuote', item }), hidden: item.status !== 'APPROVED' && item.status !== 'DRAFT' && item.status !== 'REJECTED', semantic: 'send', permissionKey: 'crm:quote:send' },
                  { label: '接受报价', icon: <RefreshCcw size={14} />, onClick: () => setConfirm({ action: 'acceptQuote', item }), hidden: item.status !== 'APPROVED' && item.status !== 'SENT', semantic: 'process', permissionKey: 'crm:quote:accept' },
                  { label: '标记过期', icon: <TriangleAlert size={14} />, onClick: () => setConfirm({ action: 'expireQuote', item }), hidden: item.status === 'ACCEPTED' || item.status === 'EXPIRED', semantic: 'disable', permissionKey: 'crm:quote:expire' },
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
                    permissionKey: 'crm:contract:draft',
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
    <section className="cf-section-card">
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
                    { label: '编辑回款', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'receivable', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:receivable:edit' },
                    { label: '确认回款', icon: <Wallet size={14} />, onClick: () => setConfirm({ action: 'confirmReceivable', item }), hidden: item.status === 'RECEIVED', semantic: 'process', permissionKey: 'crm:receivable:confirm' },
                    {
                      label: '绑定发票',
                      icon: <ReceiptText size={14} />,
                      onClick: async () => {
                        await loadReceivableInvoices(item);
                        openDialog({ type: 'receivable', item });
                      },
                      semantic: 'bind',
                      permissionKey: 'crm:receivable:bind-invoice',
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
                  { label: '编辑工单', icon: <LifeBuoy size={14} />, onClick: () => openDialog({ type: 'ticket', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:ticket:edit' },
                  { label: '解决工单', icon: <RefreshCcw size={14} />, onClick: () => setConfirm({ action: 'resolveTicket', item: { ...item, solution: item.solution || '已处理完成' } }), hidden: item.status === 'RESOLVED' || item.status === 'CLOSED', semantic: 'process', permissionKey: 'crm:ticket:resolve' },
                  { label: '关闭工单', icon: <Send size={14} />, onClick: () => setConfirm({ action: 'closeTicket', item }), hidden: item.status === 'CLOSED', semantic: 'disable', permissionKey: 'crm:ticket:close' },
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
              <select
                aria-label="选择客户"
                className={nativeSelectClassName}
                value={followUpForm.customerId ? String(followUpForm.customerId) : ''}
                onChange={(e) => setFollowUpForm((prev) => ({ ...prev, customerId: Number(e.target.value) }))}
              >
                <option value="" disabled>选择客户</option>
                {customerOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <select
                aria-label="关联商机"
                className={nativeSelectClassName}
                value={followUpForm.opportunityId ? String(followUpForm.opportunityId) : 'NONE'}
                onChange={(e) => setFollowUpForm((prev) => ({ ...prev, opportunityId: e.target.value === 'NONE' ? undefined : Number(e.target.value) }))}
              >
                <option value="NONE">不关联商机</option>
                {opportunityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <Textarea className="md:col-span-2" value={followUpForm.content || ''} onChange={(e) => setFollowUpForm((prev) => ({ ...prev, content: e.target.value }))} placeholder="跟进内容，例如：客户已确认报价范围，待内部审批。" />
            <Input value={followUpForm.ownerName || ''} onChange={(e) => setFollowUpForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="跟进人" />
            <DatePicker
              className="h-11"
              type="datetime-local"
              value={followUpForm.nextFollowUpTime ? String(followUpForm.nextFollowUpTime).slice(0, 16) : ''}
              onChange={(e) => setFollowUpForm((prev) => ({ ...prev, nextFollowUpTime: e.target.value ? `${e.target.value}:00` : undefined }))}
              placeholder="下次跟进时间"
            />
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
            <DatePicker className="h-11" type="date" value={opportunityForm.expectedSignDate || ''} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, expectedSignDate: e.target.value }))} placeholder="预计签约日期" />
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
            <Input value={quoteForm.ownerName || ''} onChange={(e) => setQuoteForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="负责人" />
            <Input value={quoteForm.currency || 'CNY'} onChange={(e) => setQuoteForm((prev) => ({ ...prev, currency: e.target.value }))} placeholder="币种" />
            <DatePicker className="h-11" type="date" value={quoteForm.validUntil || ''} onChange={(e) => setQuoteForm((prev) => ({ ...prev, validUntil: e.target.value }))} placeholder="有效期至" />
            <div className="md:col-span-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">报价行项目</div>
                  <div className="text-xs text-slate-500">按产品带入标准价，可继续调整数量、折扣与税率。</div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addQuoteLine}><Plus size={14} className="mr-1.5" />新增行</Button>
              </div>
              <div className="space-y-3">
                {(quoteForm.quoteLines && quoteForm.quoteLines.length ? quoteForm.quoteLines : [{ ...emptyQuoteLine, sortNo: 1 }]).map((line, index) => (
                  <div key={line.quoteLineId || `line-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium">第 {index + 1} 行</div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeQuoteLine(index)} disabled={(quoteForm.quoteLines?.length || 1) <= 1}><Trash2 size={14} /></Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="xl:col-span-2">
                        <Select value={line.productId ? String(line.productId) : 'NONE'} onValueChange={(value) => selectQuoteLineProduct(index, value === 'NONE' ? undefined : Number(value))}>
                          <SelectTrigger><SelectValue placeholder="选择产品" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">手工录入</SelectItem>
                            {productOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input value={line.productName || ''} onChange={(e) => updateQuoteLine(index, { productName: e.target.value })} placeholder="产品名称" />
                      <Input value={line.productNo || ''} onChange={(e) => updateQuoteLine(index, { productNo: e.target.value })} placeholder="产品编号" />
                      <Input value={line.category || ''} onChange={(e) => updateQuoteLine(index, { category: e.target.value })} placeholder="分类" />
                      <Input value={line.spec || ''} onChange={(e) => updateQuoteLine(index, { spec: e.target.value })} placeholder="规格" />
                      <Input value={line.unit || ''} onChange={(e) => updateQuoteLine(index, { unit: e.target.value })} placeholder="单位" />
                      <Input type="number" value={String(line.quantity ?? 1)} onChange={(e) => updateQuoteLine(index, { quantity: Number(e.target.value || 0) })} placeholder="数量" />
                      <Input type="number" value={String(line.unitPrice ?? 0)} onChange={(e) => updateQuoteLine(index, { unitPrice: Number(e.target.value || 0) })} placeholder="单价" />
                      <Input type="number" value={String(line.discountRate ?? 100)} onChange={(e) => updateQuoteLine(index, { discountRate: Number(e.target.value || 0) })} placeholder="折扣率" />
                      <Input type="number" value={String(line.taxRate ?? 0)} onChange={(e) => updateQuoteLine(index, { taxRate: Number(e.target.value || 0) })} placeholder="税率" />
                      <Input value={String(line.lineAmount ?? 0)} readOnly placeholder="行金额" />
                      <Input value={String(line.taxAmount ?? 0)} readOnly placeholder="税额" />
                      <Textarea className="md:col-span-2 xl:col-span-4" value={line.remark || ''} onChange={(e) => updateQuoteLine(index, { remark: e.target.value })} placeholder="行备注、折扣说明、交付边界" rows={2} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Input type="number" value={String(quoteForm.totalAmount || 0)} readOnly placeholder="总金额" />
            <Input type="number" value={String(quoteForm.taxAmount || 0)} readOnly placeholder="税额" />
            <Textarea className="md:col-span-2" value={quoteForm.remark || ''} onChange={(e) => setQuoteForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="报价说明、商务条款、附件说明" rows={3} />
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
            <DatePicker className="h-11" type="date" value={receivableForm.dueDate || ''} onChange={(e) => setReceivableForm((prev) => ({ ...prev, dueDate: e.target.value }))} placeholder="到期日期" />
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
            <DatePicker className="h-11" type="date" value={renewalForm.currentExpireDate || ''} onChange={(e) => setRenewalForm((prev) => ({ ...prev, currentExpireDate: e.target.value }))} placeholder="当前到期日期" />
          </div>
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Select value={ticketForm.customerId ? String(ticketForm.customerId) : ''} onValueChange={(value) => setTicketForm((prev) => ({ ...prev, customerId: Number(value) }))}>
              <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
              <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input value={ticketForm.ticketTitle || ''} onChange={(e) => setTicketForm((prev) => ({ ...prev, ticketTitle: e.target.value }))} placeholder="工单标题" />
          <div className="space-y-2">
            <UserSelector
              value={ticketForm.ownerId ? [String(ticketForm.ownerId)] : []}
              onChange={(userIds) => setTicketForm((prev) => ({
                ...prev,
                ownerId: userIds[0] ? Number(userIds[0]) : undefined,
                ownerName: userIds[0] ? prev.ownerName : '',
              }))}
              onUsersChange={(users) => {
                const user = users[0];
                if (!user) {
                  return;
                }
                setTicketForm((prev) => ({
                  ...prev,
                  ownerId: Number(user.id),
                  ownerName: user.name,
                }));
              }}
              multiple={false}
              placeholder="搜索姓名、邮箱或部门选择负责人"
            />
          </div>
          <Textarea className="md:col-span-2" value={ticketForm.description || ''} onChange={(e) => setTicketForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="问题描述、影响范围、当前处理方案" />
        </div>
      </BaseDialog>
    );
  };

  const currentViewLabel = tabLabelMap[tab];
  const filterBar = (
    <div className="space-y-3">
      <div className="cf-filter-bar">
        <div className="flex flex-wrap items-center gap-3">
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="客户 / 商机 / 报价关键字" className="w-full sm:w-[280px]" />
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            当前视图 · {currentViewLabel}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'customer' && hasPermission('crm:customer:add') ? <Button size="sm" onClick={() => openDialog({ type: 'customer' })}><Plus size={14} className="mr-1.5" />新增客户</Button> : null}
          {tab === 'opportunity' && hasPermission('crm:opportunity:add') ? <Button size="sm" onClick={() => openDialog({ type: 'opportunity' })}><Plus size={14} className="mr-1.5" />新增商机</Button> : null}
          {tab === 'quote' && hasPermission('crm:quote:add') ? <Button size="sm" onClick={() => openDialog({ type: 'quote' })}><Plus size={14} className="mr-1.5" />新增报价</Button> : null}
          {tab === 'receivable' && hasPermission('crm:receivable:add') ? <Button size="sm" onClick={() => openDialog({ type: 'receivable' })}><Plus size={14} className="mr-1.5" />新增回款</Button> : null}
          {tab === 'renewal' && hasPermission('crm:renewal:add') ? <Button size="sm" onClick={() => openDialog({ type: 'renewal' })}><Plus size={14} className="mr-1.5" />新增续约</Button> : null}
          {tab === 'ticket' && hasPermission('crm:ticket:add') ? <Button size="sm" onClick={() => openDialog({ type: 'ticket' })}><Plus size={14} className="mr-1.5" />新增工单</Button> : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {renderDashboard()}

      {tab === 'opportunity' ? (
        <div className="space-y-6">
          {filterBar}
          {renderOpportunityTable()}
        </div>
      ) : null}

      {tab !== 'dashboard' && tab !== 'opportunity' ? (
      <TablePageLayout
        filters={filterBar}
        table={(
          <>
            {tab === 'customer' ? <TableSurfaceCard className="overflow-x-auto">{renderCustomerTable()}</TableSurfaceCard> : null}
            {tab === 'quote' ? <TableSurfaceCard className="overflow-x-auto">{renderQuoteTable()}</TableSurfaceCard> : null}
            {tab === 'receivable' ? renderReceivableTable() : null}
            {tab === 'renewal' ? renderRenewalTable() : null}
            {tab === 'ticket' ? <TableSurfaceCard className="overflow-x-auto">{renderTicketTable()}</TableSurfaceCard> : null}
          </>
        )}
      />
      ) : null}

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
