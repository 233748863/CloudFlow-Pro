import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { opportunityStages, type SalesStage } from '@/services/api/crm/opportunityStages';
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
  ticketPage: number;
  setTicketPage: React.Dispatch<React.SetStateAction<number>>;
  ticketTotal: number;
  ticketListError: string;
  ticketQueue: boolean;
  setTicketQueue: React.Dispatch<React.SetStateAction<boolean>>;
  contracts: OaContract[];
  dashboard: CrmDashboardSummary | null;
  board: CrmOpportunityBoardColumn[];
  salesStages: SalesStage[];
  stageChange: { opportunity: CrmOpportunity; targetStage?: string } | null;
  setStageChange: React.Dispatch<React.SetStateAction<{ opportunity: CrmOpportunity; targetStage?: string } | null>>;
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
  openOpportunityEditor: (id: number) => Promise<void>;
  opportunitySaveError: string;
  quoteSaveError: string;
  quoteReady: boolean;
  quoteLoading: boolean;

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
  receivableSaveError: string;
  receivableReady: boolean;
  receivableLoading: boolean;
  renewalForm: CrmRenewal;
  setRenewalForm: React.Dispatch<React.SetStateAction<CrmRenewal>>;
  ticketForm: CrmTicket;
  setTicketForm: React.Dispatch<React.SetStateAction<CrmTicket>>;
  ticketSaveError: string;
  ticketReady: boolean;
  ticketLoading: boolean;

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
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketTotal, setTicketTotal] = useState(0);
  const [ticketListError, setTicketListError] = useState('');
  const [ticketQueue, setTicketQueue] = useState(false);
  const [ticketSaveError, setTicketSaveError] = useState('');
  const [ticketReady, setTicketReady] = useState(true);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [contracts, setContracts] = useState<OaContract[]>([]);
  const [dashboard, setDashboard] = useState<CrmDashboardSummary | null>(null);
  const [board, setBoard] = useState<CrmOpportunityBoardColumn[]>([]);
  const [salesStages, setSalesStages] = useState<SalesStage[]>([]);
  const [stageChange, setStageChange] = useState<{ opportunity: CrmOpportunity; targetStage?: string } | null>(null);
  const [opportunitySaveError, setOpportunitySaveError] = useState('');
  const [quoteSaveError, setQuoteSaveError] = useState('');
  const [quoteReady, setQuoteReady] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [receivableSaveError, setReceivableSaveError] = useState('');
  const [receivableReady, setReceivableReady] = useState(true);
  const [receivableLoading, setReceivableLoading] = useState(false);
  const quoteLoadGeneration = useRef(0);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoiceCandidates, setInvoiceCandidates] = useState<Invoice[]>([]);
  const loadGeneration = useRef(0);

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
    const generation = ++loadGeneration.current;
    setLoading(true);
    setTickets([]); setTicketTotal(0); setTicketListError('');
    const failures: unknown[] = [];
    const apply = async <Value,>(request: Promise<Value> | Value, setter: (value: Value) => void, rejected?: (failure: unknown) => void) => {
      try { const result = await request; if (generation === loadGeneration.current) setter(result); }
      catch (failure) { failures.push(failure); if (generation === loadGeneration.current) rejected?.(failure); }
    };
    const rows = <Value,>(request: Promise<{ rows: Value[] }> | { rows: Value[] }, setter: (value: Value[]) => void) =>
      apply(Promise.resolve(request).then(result => result.rows || []), setter);
    const requests = {
      customers: rows(hasPermission('crm:customer:list') ? crmApi.listCustomers({ pageNum: 1, pageSize: 50, keyword: keyword || undefined }) : { rows: [] }, setCustomers),
      customerRefs: rows(hasPermission('crm:customer:list') ? crmApi.listCustomers({ pageNum: 1, pageSize: 200 }) : { rows: [] }, setCustomerRefs),
      contacts: rows(hasPermission('crm:contact:list') ? crmApi.listContacts({ pageNum: 1, pageSize: 100 }) : { rows: [] }, setContacts),
      followUps: rows(hasPermission('crm:follow-up:list') ? crmApi.listFollowUps({ pageNum: 1, pageSize: 100 }) : { rows: [] }, setFollowUps),
      opportunities: rows(hasPermission('crm:opportunity:list') ? crmApi.listOpportunities({ pageNum: 1, pageSize: 100, opportunityName: keyword || undefined }) : { rows: [] }, setOpportunities),
      opportunityRefs: rows(hasPermission('crm:opportunity:list') ? crmApi.listOpportunities({ pageNum: 1, pageSize: 200 }) : { rows: [] }, setOpportunityRefs),
      quotes: rows(hasPermission('crm:quote:list') ? crmApi.listQuotes({ pageNum: 1, pageSize: 100, quoteName: keyword || undefined }) : { rows: [] }, setQuotes),
      receivables: rows(hasPermission('crm:receivable:list') ? crmApi.listReceivables({ pageNum: 1, pageSize: 100, receivableName: keyword || undefined }) : { rows: [] }, setReceivables),
      renewals: rows(hasPermission('crm:renewal:list') ? crmApi.listRenewals({ pageNum: 1, pageSize: 100, renewalName: keyword || undefined }) : { rows: [] }, setRenewals),
      tickets: apply(hasPermission('crm:ticket:list') ? crmApi.listTickets({ pageNum: ticketPage, pageSize: 10, ticketTitle: keyword || undefined, portalQueue: ticketQueue || undefined }) : { rows: [], total: 0 }, result => { setTickets(result.rows || []); setTicketTotal(result.total || 0); }, failure => setTicketListError(getErrorMessage(failure, '工单列表读取失败，请重新加载'))),
      contracts: rows(hasPermission('oa:contract:list') ? contractApi.list({ pageNum: 1, pageSize: 200 }) : { rows: [] }, setContracts),
      dashboard: apply(crmPathTabMap[location.pathname] === 'dashboard' && hasPermission('crm:dashboard:view') ? crmApi.getDashboardSummary() : null, setDashboard),
      board: apply(hasPermission('crm:opportunity:list') ? crmApi.getOpportunityBoard() : [], result => setBoard(normalizeOpportunityBoard(result))),
      products: rows(hasPermission('crm:product:list') ? crmApi.listProducts({ pageNum: 1, pageSize: 200, status: 'ACTIVE' }) : { rows: [] }, setProductRefs),
      stages: apply(hasPermission('crm:opportunity:list') ? opportunityStages.options() : [], setSalesStages),
    };
    const required: Record<CrmTab, Promise<void>[]> = {
      dashboard: [requests.dashboard], customer: [requests.customers, requests.contacts, requests.followUps],
      opportunity: [requests.opportunities, requests.board, requests.stages], quote: [requests.quotes],
      receivable: [requests.receivables], renewal: [requests.renewals], ticket: [requests.tickets],
    };
    void Promise.all(Object.values(requests)).then(() => {
      if (generation === loadGeneration.current && failures.length) toast.error(getErrorMessage(failures[0], '部分 CRM 数据加载失败，已加载内容仍可使用'));
    });
    await Promise.all(required[crmPathTabMap[location.pathname] || 'dashboard']);
    if (generation === loadGeneration.current) setLoading(false);
  }, [hasPermission, keyword, location.pathname, ticketPage, ticketQueue]);

  useEffect(() => { setTicketPage(1); }, [keyword, ticketQueue]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
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
    const quoteGeneration = ++quoteLoadGeneration.current;
    setOpportunitySaveError('');
    setQuoteSaveError('');
    setQuoteReady(next?.type !== 'quote' || !next.item?.quoteId);
    setQuoteLoading(false);
    setReceivableSaveError('');
    setReceivableReady(next?.type !== 'receivable' || !next.item?.receivableId);
    setReceivableLoading(false);
    setTicketSaveError('');
    setTicketReady(next?.type !== 'ticket' || !next.item?.ticketId);
    setTicketLoading(false);
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
        setQuoteForm({ ...emptyQuote, ...next.item });
        setQuoteLoading(true);
        void crmApi.getQuoteDetail(next.item.quoteId)
          .then((detail) => {
            if (quoteLoadGeneration.current !== quoteGeneration) return;
            setQuoteForm({
              ...emptyQuote,
              ...detail,
              quoteLines: detail.quoteLines && detail.quoteLines.length ? detail.quoteLines : [{ ...emptyQuoteLine, sortNo: 1 }],
            });
            setQuoteReady(true);
          })
          .catch((error) => {
            if (quoteLoadGeneration.current !== quoteGeneration) return;
            toast.error(getErrorMessage(error, '加载报价明细失败'));
            setQuoteSaveError(getErrorMessage(error, '加载报价明细失败'));
          })
          .finally(() => {
            if (quoteLoadGeneration.current === quoteGeneration) setQuoteLoading(false);
          });
      } else {
        setQuoteForm({
          ...emptyQuote,
          ...(next.item || {}),
          quoteLines: next.item?.quoteLines && next.item.quoteLines.length ? next.item.quoteLines : [{ ...emptyQuoteLine, sortNo: 1 }],
        });
      }
    }
    if (next.type === 'receivable') {
      setReceivableForm(next.item || emptyReceivable);
      if (next.item?.receivableId) {
        setReceivableLoading(true);
        void crmApi.getReceivable(next.item.receivableId).then((detail) => {
          if (quoteLoadGeneration.current !== quoteGeneration) return;
          setReceivableForm(detail);
          setReceivableReady(true);
        }).catch((error) => {
          if (quoteLoadGeneration.current === quoteGeneration) setReceivableSaveError(getErrorMessage(error, '读取回款失败'));
        }).finally(() => {
          if (quoteLoadGeneration.current === quoteGeneration) setReceivableLoading(false);
        });
      }
    }
    if (next.type === 'renewal') setRenewalForm(next.item || emptyRenewal);
    if (next.type === 'ticket') {
      setTicketForm(next.item || emptyTicket);
      if (next.item?.ticketId) {
        setTicketLoading(true);
        void crmApi.getTicket(next.item.ticketId).then(detail => {
          if (quoteLoadGeneration.current !== quoteGeneration) return;
          setTicketForm(detail); setTicketReady(true);
        }).catch(failure => {
          if (quoteLoadGeneration.current === quoteGeneration) setTicketSaveError(getErrorMessage(failure, '读取工单失败'));
        }).finally(() => { if (quoteLoadGeneration.current === quoteGeneration) setTicketLoading(false); });
      }
    }
  }, [resetForms]);

  const openOpportunityEditor = useCallback(async (id: number) => {
    if (!hasPermission('crm:opportunity:edit')) return;
    try {
      const detail = await crmApi.getOpportunityDetail(id);
      if (detail.status !== 'OPEN') throw new Error('已结案商机不能直接修改');
      openDialog({ type: 'opportunity', item: detail });
    } catch (error) { toast.error(getErrorMessage(error, '读取商机详情失败')); }
  }, [hasPermission, openDialog]);

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
    if (!dialog || saving || dialog.type === 'quote' && !quoteReady) return;
    if (dialog.type === 'receivable' && !receivableReady) return;
    if (dialog.type === 'ticket' && !ticketReady) return;
    setSaving(true);
    setOpportunitySaveError('');
    setQuoteSaveError('');
    setReceivableSaveError('');
    setTicketSaveError('');
    try {
      if (dialog.type === 'customer') {
        if (customerForm.customerId) await crmApi.editCustomer(customerForm, { silent: true }); else await crmApi.addCustomer(customerForm, { silent: true });
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
      if (dialog.type === 'opportunity') setOpportunitySaveError(getErrorMessage(error, '保存失败，未保存输入仍保留'));
      if (dialog.type === 'quote') setQuoteSaveError(getErrorMessage(error, '保存失败，未保存输入仍保留'));
      if (dialog.type === 'receivable') setReceivableSaveError(getErrorMessage(error, '保存失败，未保存输入仍保留'));
      if (dialog.type === 'ticket') setTicketSaveError(getErrorMessage(error, '保存失败，未保存输入仍保留'));
      toast.error(getErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  }, [dialog, saving, quoteReady, receivableReady, ticketReady, customerForm, contactForm, followUpForm, opportunityForm, quoteForm, receivableForm, renewalForm, ticketForm, openDialog, load]);

  const executeConfirm = useCallback(async () => {
    if (!confirm || ['winOpportunity', 'loseOpportunity'].includes(confirm.action)) return;
    try {
      let successMessage = '操作成功';
      if (confirm.action === 'submitQuote') await crmApi.submitQuote(confirm.item.quoteId);
      if (confirm.action === 'sendQuote') await crmApi.sendQuote(confirm.item.quoteId);
      if (confirm.action === 'acceptQuote') await crmApi.acceptQuote(confirm.item.quoteId);
      if (confirm.action === 'expireQuote') await crmApi.expireQuote(confirm.item.quoteId);
      if (confirm.action === 'confirmReceivable') {
        if (confirm.item.invoiceId != null) throw new Error('已绑定发票，请在发票页面登记收款；此处只查看到账结果。');
        await crmApi.confirmReceivable(confirm.item.receivableId, confirm.item.version);
      }
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
    const source = board.find(column => column.items.some(item => item.opportunityId === opportunityId));
    const card = source?.items.find(item => item.opportunityId === opportunityId);
    if (!card || source?.stage === stage) return;
    try {
      const opportunity = await crmApi.getOpportunityDetail(opportunityId);
      if (card.version !== opportunity.version || source?.stage !== opportunity.stage) throw new Error('商机已被修改，请刷新看板后重新操作');
      if (opportunity.status !== 'OPEN') throw new Error('已结案商机不能直接调整阶段');
      if (stage === 'LOST' || stage === 'WON') {
        if (!hasPermission(stage === 'LOST' ? 'crm:approval:opportunity-downgrade' : 'crm:opportunity:win')) throw new Error('无权执行此操作');
        setConfirm({ action: stage === 'LOST' ? 'loseOpportunity' : 'winOpportunity', item: opportunity });
        return;
      }
      const target = salesStages.find(rule => rule.stageCode === stage);
      if (!target) throw new Error('目标阶段已停用或规则已变更，请刷新看板');
      const backward = source?.sortNo != null && target.sortNo < source.sortNo;
      if (!hasPermission(backward ? 'crm:approval:opportunity-downgrade' : 'crm:opportunity:edit')) throw new Error('无权执行此操作');
      setStageChange({ opportunity, targetStage: stage });
    } catch (error) {
      toast.error(getErrorMessage(error, '更新商机阶段失败'));
    }
  }, [board, salesStages, hasPermission]);

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
    ticketPage,
    setTicketPage,
    ticketTotal,
    ticketListError,
    ticketQueue,
    setTicketQueue,
    contracts,
    dashboard,
    board,
    salesStages,
    stageChange,
    setStageChange,
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
    openOpportunityEditor,
    opportunitySaveError,
    quoteSaveError,
    quoteReady,
    quoteLoading,
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
    receivableSaveError,
    receivableReady,
    receivableLoading,
    renewalForm,
    setRenewalForm,
    ticketForm,
    setTicketForm,
    ticketSaveError,
    ticketReady,
    ticketLoading,
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
