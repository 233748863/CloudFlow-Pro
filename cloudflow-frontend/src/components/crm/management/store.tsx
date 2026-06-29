import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DragEndEvent } from '@dnd-kit/core';
import { toast } from 'sonner';
import {
  crmApi,
  CrmContact,
  CrmCustomer,
  CrmDashboardSummary,
  CrmFollowUp,
  CrmOpportunity,
  CrmOpportunityBoardColumn,
  CrmProduct,
  CrmQuote,
  CrmQuoteLine,
  CrmReceivable,
  CrmRenewal,
  CrmTicket,
} from '@/services/api/crm';
import { contractApi, OaContract } from '@/services/api/contractRisk';
import { invoiceApi, Invoice } from '@/services/api/invoice';
import { getErrorMessage } from '@/utils/errorMessage';
import { useAuth } from '@/context/AuthContext';
import type { ConfirmState, CrmTab, DialogState } from './types';
import {
  crmPathTabMap,
  crmTabPathMap,
  emptyContact,
  emptyCustomer,
  emptyFollowUp,
  emptyOpportunity,
  emptyQuote,
  emptyQuoteLine,
  emptyReceivable,
  emptyRenewal,
  emptyTicket,
  tabPermissionMap,
} from './constants';

export interface CrmManagementContextValue {
  // Permissions / tab routing
  hasPermission: (permission: string) => boolean;
  availableTabs: CrmTab[];
  tab: CrmTab;
  navigateToTab: (next: CrmTab) => void;

  // Search keyword
  keyword: string;
  setKeyword: (value: string) => void;

  // Collections
  customers: CrmCustomer[];
  customerRefs: CrmCustomer[];
  contacts: CrmContact[];
  followUps: CrmFollowUp[];
  opportunities: CrmOpportunity[];
  opportunityRefs: CrmOpportunity[];
  quotes: CrmQuote[];
  productRefs: CrmProduct[];
  receivables: CrmReceivable[];
  renewals: CrmRenewal[];
  tickets: CrmTicket[];
  contracts: OaContract[];
  dashboard: CrmDashboardSummary | null;
  board: CrmOpportunityBoardColumn[];
  invoiceCandidates: Invoice[];

  // Options derived
  customerOptions: Array<{ label: string; value: string }>;
  opportunityOptions: Array<{ label: string; value: string }>;
  contractOptions: Array<{ label: string; value: string }>;
  productOptions: Array<{ label: string; value: string }>;

  // Dialog / confirm state
  dialog: DialogState;
  confirm: ConfirmState;
  /** 首屏加载中 */
  loading: boolean;
  saving: boolean;
  setConfirm: (next: ConfirmState) => void;
  openDialog: (next: DialogState) => void;

  // Forms
  customerForm: CrmCustomer;
  setCustomerForm: React.Dispatch<React.SetStateAction<CrmCustomer>>;
  contactForm: CrmContact;
  setContactForm: React.Dispatch<React.SetStateAction<CrmContact>>;
  followUpForm: CrmFollowUp;
  setFollowUpForm: React.Dispatch<React.SetStateAction<CrmFollowUp>>;
  opportunityForm: CrmOpportunity;
  setOpportunityForm: React.Dispatch<React.SetStateAction<CrmOpportunity>>;
  quoteForm: CrmQuote;
  setQuoteForm: React.Dispatch<React.SetStateAction<CrmQuote>>;
  receivableForm: CrmReceivable;
  setReceivableForm: React.Dispatch<React.SetStateAction<CrmReceivable>>;
  renewalForm: CrmRenewal;
  setRenewalForm: React.Dispatch<React.SetStateAction<CrmRenewal>>;
  ticketForm: CrmTicket;
  setTicketForm: React.Dispatch<React.SetStateAction<CrmTicket>>;

  // Handlers
  load: () => Promise<void>;
  openCustomerWorkspace: (customerId?: number) => void;
  goToProject: (projectId: number) => void;
  goToContract: (contractId: number) => void;
  applyContractToReceivable: (contractId: number) => void;
  applyContractToRenewal: (contractId: number) => void;
  updateQuoteLine: (index: number, patch: Partial<CrmQuoteLine>) => void;
  selectQuoteLineProduct: (index: number, productId?: number) => void;
  addQuoteLine: () => void;
  removeQuoteLine: (index: number) => void;
  saveDialog: () => Promise<void>;
  executeConfirm: () => Promise<void>;
  loadReceivableInvoices: (receivable: CrmReceivable) => Promise<void>;
  bindInvoiceToReceivable: (receivable: CrmReceivable, invoiceId: number) => Promise<void>;
  handleBoardDragEnd: (event: DragEndEvent) => Promise<void>;
}

const CrmManagementContext = createContext<CrmManagementContextValue | null>(null);

const OPPORTUNITY_STAGE_ORDER: Record<string, number> = {
  LEAD: 1,
  QUALIFIED: 2,
  PROPOSAL: 3,
  NEGOTIATION: 4,
  WON: 5,
  LOST: 6,
};

type RawOpportunityBoardColumn = CrmOpportunityBoardColumn & {
  opportunities?: CrmOpportunityBoardColumn['items'];
};

const normalizeOpportunityBoard = (
  columns: RawOpportunityBoardColumn[] | null | undefined,
): CrmOpportunityBoardColumn[] => {
  if (!Array.isArray(columns)) {
    return [];
  }

  return columns.map((column) => ({
    ...column,
    items: Array.isArray(column.items)
      ? column.items
      : Array.isArray(column.opportunities)
        ? column.opportunities
        : [],
  }));
};

export const useCrmManagement = () => {
  const ctx = useContext(CrmManagementContext);
  if (!ctx) throw new Error('useCrmManagement must be used within CrmManagementProvider');
  return ctx;
};

export const CrmManagementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userPermissions = user?.permissions || [];

  const hasPermission = useCallback(
    (permission: string) =>
      userPermissions.includes(permission) ||
      userPermissions.includes('*:*:*') ||
      userPermissions.includes('*'),
    [userPermissions],
  );

  const availableTabs = useMemo(
    () => (Object.keys(tabPermissionMap) as CrmTab[]).filter((item) => hasPermission(tabPermissionMap[item])),
    [hasPermission],
  );

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
  const [loading, setLoading] = useState(true);
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
    () => productRefs.map((item) => ({
      label: `${item.productName} / ${item.productNo || '-'} / ${Number(item.standardPrice || 0).toLocaleString('zh-CN')}`,
      value: String(item.productId),
    })),
    [productRefs],
  );

  const navigateToTab = useCallback(
    (nextTab: CrmTab) => {
      navigate(crmTabPathMap[nextTab]);
    },
    [navigate],
  );

  const load = useCallback(async () => {
    setLoading(true);
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
      setBoard(normalizeOpportunityBoard(boardResult as RawOpportunityBoardColumn[]));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载 CRM 失败'));
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    void load();
  }, [load]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, userPermissions.join(',')]);

  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0] || 'dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, availableTabs.join(',')]);

  const resetForms = useCallback(() => {
    setCustomerForm(emptyCustomer);
    setContactForm(emptyContact);
    setFollowUpForm(emptyFollowUp);
    setOpportunityForm(emptyOpportunity);
    setQuoteForm(emptyQuote);
    setReceivableForm(emptyReceivable);
    setRenewalForm(emptyRenewal);
    setTicketForm(emptyTicket);
  }, []);

  const openDialog = useCallback((next: DialogState) => {
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
  }, [resetForms]);

  const openCustomerWorkspace = useCallback((customerId?: number) => {
    if (!customerId) return;
    navigate(`/office/crm/customer/${customerId}`);
  }, [navigate]);

  const goToProject = useCallback(
    (projectId: number) => navigate('/office/project', { state: { focusProjectId: projectId } }),
    [navigate],
  );

  const goToContract = useCallback(
    (contractId: number) => navigate('/office/contracts', { state: { focusContractId: contractId } }),
    [navigate],
  );

  const applyContractToReceivable = useCallback((contractId: number) => {
    const matched = contracts.find((item) => item.contractId === contractId);
    if (!matched) return;
    setReceivableForm((prev) => ({
      ...prev,
      contractId: matched.contractId,
      contractNo: matched.contractNo,
      customerId: matched.customerId || prev.customerId,
      customerName: matched.customerName || prev.customerName,
    }));
  }, [contracts]);

  const applyContractToRenewal = useCallback((contractId: number) => {
    const matched = contracts.find((item) => item.contractId === contractId);
    if (!matched) return;
    setRenewalForm((prev) => ({
      ...prev,
      contractId: matched.contractId,
      contractNo: matched.contractNo,
      customerId: matched.customerId || prev.customerId,
      customerName: matched.customerName || prev.customerName,
    }));
  }, [contracts]);

  const calcQuoteLineAmount = useCallback((line: CrmQuoteLine) => {
    const quantity = Number(line.quantity || 0);
    const unitPrice = Number(line.unitPrice || 0);
    const discountRate = Number(line.discountRate ?? 100);
    return Number(((quantity * unitPrice * discountRate) / 100).toFixed(2));
  }, []);

  const calcQuoteTaxAmount = useCallback((line: CrmQuoteLine) => {
    const lineAmount = Number(line.lineAmount ?? calcQuoteLineAmount(line));
    const taxRate = Number(line.taxRate || 0);
    return Number(((lineAmount * taxRate) / 100).toFixed(2));
  }, [calcQuoteLineAmount]);

  const syncQuoteTotals = useCallback((lines: CrmQuoteLine[]) => {
    const totalAmount = Number(lines.reduce((sum, line) => sum + Number(line.lineAmount || 0), 0).toFixed(2));
    const taxAmount = Number(lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0).toFixed(2));
    setQuoteForm((prev) => ({ ...prev, quoteLines: lines, totalAmount, taxAmount }));
  }, []);

  const updateQuoteLine = useCallback((index: number, patch: Partial<CrmQuoteLine>) => {
    setQuoteForm((prev) => {
      const currentLines = prev.quoteLines && prev.quoteLines.length ? prev.quoteLines : [emptyQuoteLine];
      const nextLines = currentLines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
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
      const totalAmount = Number(nextLines.reduce((sum, line) => sum + Number(line.lineAmount || 0), 0).toFixed(2));
      const taxAmount = Number(nextLines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0).toFixed(2));
      return { ...prev, quoteLines: nextLines, totalAmount, taxAmount };
    });
  }, [calcQuoteLineAmount, calcQuoteTaxAmount]);

  const selectQuoteLineProduct = useCallback((index: number, productId?: number) => {
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
    if (!matched) return;
    updateQuoteLine(index, {
      productId: matched.productId,
      productNo: matched.productNo,
      productName: matched.productName,
      category: matched.category,
      spec: matched.spec,
      unit: matched.unit,
      unitPrice: Number(matched.standardPrice || 0),
    });
  }, [productRefs, updateQuoteLine]);

  const addQuoteLine = useCallback(() => {
    setQuoteForm((prev) => {
      const currentLines = prev.quoteLines && prev.quoteLines.length ? prev.quoteLines : [];
      const nextLines = [...currentLines, { ...emptyQuoteLine, sortNo: currentLines.length + 1 }];
      const totalAmount = Number(nextLines.reduce((sum, line) => sum + Number(line.lineAmount || 0), 0).toFixed(2));
      const taxAmount = Number(nextLines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0).toFixed(2));
      return { ...prev, quoteLines: nextLines, totalAmount, taxAmount };
    });
  }, []);

  const removeQuoteLine = useCallback((index: number) => {
    setQuoteForm((prev) => {
      const currentLines = prev.quoteLines && prev.quoteLines.length ? prev.quoteLines : [];
      const filtered = currentLines
        .filter((_, lineIndex) => lineIndex !== index)
        .map((line, lineIndex) => ({ ...line, sortNo: lineIndex + 1 }));
      const next = filtered.length ? filtered : [{ ...emptyQuoteLine, sortNo: 1 }];
      const totalAmount = Number(next.reduce((sum, line) => sum + Number(line.lineAmount || 0), 0).toFixed(2));
      const taxAmount = Number(next.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0).toFixed(2));
      return { ...prev, quoteLines: next, totalAmount, taxAmount };
    });
  }, []);

  const saveDialog = useCallback(async () => {
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
  }, [dialog, customerForm, contactForm, followUpForm, opportunityForm, quoteForm, receivableForm, renewalForm, ticketForm, openDialog, load]);

  const executeConfirm = useCallback(async () => {
    if (!confirm) return;
    try {
      let successMessage = '操作成功';
      if (confirm.action === 'submitQuote') await crmApi.submitQuote(confirm.item.quoteId);
      if (confirm.action === 'sendQuote') await crmApi.sendQuote(confirm.item.quoteId);
      if (confirm.action === 'acceptQuote') await crmApi.acceptQuote(confirm.item.quoteId);
      if (confirm.action === 'expireQuote') await crmApi.expireQuote(confirm.item.quoteId);
      if (confirm.action === 'winOpportunity') await crmApi.winOpportunity(confirm.item.opportunityId);
      if (confirm.action === 'loseOpportunity') {
        await crmApi.submitOpportunityDowngrade({
          opportunityId: confirm.item.opportunityId,
          action: 'CLOSE',
          lostReason: confirm.item.lostReason,
        });
        successMessage = '已提交输单审批';
      }
      if (confirm.action === 'confirmReceivable') await crmApi.confirmReceivable(confirm.item.receivableId);
      if (confirm.action === 'resolveTicket') await crmApi.resolveTicket(confirm.item.ticketId, confirm.item.solution);
      if (confirm.action === 'closeTicket') await crmApi.closeTicket(confirm.item.ticketId);
      toast.success(successMessage);
      setConfirm(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  }, [confirm, load]);

  const loadReceivableInvoices = useCallback(async (receivable: CrmReceivable) => {
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
  }, []);

  const bindInvoiceToReceivable = useCallback(async (receivable: CrmReceivable, invoiceId: number) => {
    try {
      await crmApi.bindReceivableInvoice(receivable.receivableId!, invoiceId);
      toast.success('发票已绑定到回款');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定发票失败'));
    }
  }, [load]);

  const handleBoardDragEnd = useCallback(async (event: DragEndEvent) => {
    const activeId = String(event.active.id || '');
    const overId = String(event.over?.id || '');
    if (!activeId.startsWith('opp:') || !overId.startsWith('stage:')) return;
    const opportunityId = Number(activeId.replace('opp:', ''));
    const stage = overId.replace('stage:', '');
    const opportunity = opportunities.find((item) => item.opportunityId === opportunityId);
    if (!opportunity || opportunity.stage === stage) return;
    try {
      const currentOrder = OPPORTUNITY_STAGE_ORDER[String(opportunity.stage || '').toUpperCase()] ?? Number.MAX_SAFE_INTEGER;
      const targetOrder = OPPORTUNITY_STAGE_ORDER[String(stage || '').toUpperCase()] ?? Number.MAX_SAFE_INTEGER;
      if (String(stage).toUpperCase() === 'LOST' || targetOrder < currentOrder) {
        await crmApi.submitOpportunityDowngrade({
          opportunityId,
          action: String(stage).toUpperCase() === 'LOST' ? 'CLOSE' : 'DOWNGRADE',
          targetStage: String(stage).toUpperCase() === 'LOST' ? undefined : stage,
          lostReason: String(stage).toUpperCase() === 'LOST'
            ? (opportunity.lostReason || '拖拽至输单列')
            : `拖拽申请降级至 ${stage}`,
        });
        toast.success(String(stage).toUpperCase() === 'LOST' ? '已提交输单审批' : '已提交商机降级审批');
        await load();
        return;
      }
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
  }, [opportunities, load]);

  const value: CrmManagementContextValue = {
    hasPermission,
    availableTabs,
    tab,
    navigateToTab,
    keyword,
    setKeyword,
    customers,
    customerRefs,
    contacts,
    followUps,
    opportunities,
    opportunityRefs,
    quotes,
    productRefs,
    receivables,
    renewals,
    tickets,
    contracts,
    dashboard,
    board,
    invoiceCandidates,
    customerOptions,
    opportunityOptions,
    contractOptions,
    productOptions,
    dialog,
    confirm,
    loading,
    saving,
    setConfirm,
    openDialog,
    customerForm,
    setCustomerForm,
    contactForm,
    setContactForm,
    followUpForm,
    setFollowUpForm,
    opportunityForm,
    setOpportunityForm,
    quoteForm,
    setQuoteForm,
    receivableForm,
    setReceivableForm,
    renewalForm,
    setRenewalForm,
    ticketForm,
    setTicketForm,
    load,
    openCustomerWorkspace,
    goToProject,
    goToContract,
    applyContractToReceivable,
    applyContractToRenewal,
    updateQuoteLine,
    selectQuoteLineProduct,
    addQuoteLine,
    removeQuoteLine,
    saveDialog,
    executeConfirm,
    loadReceivableInvoices,
    bindInvoiceToReceivable,
    handleBoardDragEnd,
  };

  return <CrmManagementContext.Provider value={value}>{children}</CrmManagementContext.Provider>;
};
