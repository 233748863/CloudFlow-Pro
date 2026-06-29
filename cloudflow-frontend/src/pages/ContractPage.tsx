import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock3, Edit, Eye, FileSignature, Link2, Plus, RotateCcw, Send, Trash2, XCircle } from 'lucide-react';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, DatePicker, Input, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import BusinessTimeline from '@/components/common/BusinessTimeline';
import { ContractMilestoneSection } from '@/components/contract/ContractMilestoneSection';
import FileUpload from '@/components/FileUpload';
import { contractApi, contractTemplateApi, OaContract, OaContractTemplate, OaRiskAlert } from '@/services/api/contractRisk';
import { crmApi, CrmCustomer } from '@/services/api/crm';
import { projectApi, Project } from '@/services/api/project';
import { budgetApi, BudgetSubject } from '@/services/api/budget';
import { OaSealApplication, sealApplicationApi } from '@/services/api/sealLicense';
import { PageResult } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const emptyForm: OaContract = {
  contractName: '',
  counterpartyName: '',
  contractType: 'SERVICE',
  amount: 0,
  currency: 'CNY',
  riskLevel: 'LOW',
  attachmentUrl: '',
  archiveAttachmentUrl: '',
  remark: '',
};

interface ConfirmState {
  type: 'delete' | 'submit' | 'cancel';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const getStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_contract_status" value={String(status || 'DRAFT')} />
);

const getRiskBadge = (level?: string) => (
  <DictBadge dictType="severity_level" value={String(level || 'LOW')} />
);

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

const ContractMetric: React.FC<{
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'violet';
}> = ({ label, value, meta, icon, tone = 'blue' }) => (
  <article className={`card admin-source-stat admin-source-tone-${tone}`}>
    <div className="admin-source-stat-icon">{icon}</div>
    <div className="min-w-0">
      <p>{label}</p>
      <strong className="truncate">{value}</strong>
      {meta ? <span>{meta}</span> : null}
    </div>
  </article>
);

const DialogPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, actions, children, className, bodyClassName }) => (
  <section className={['table-scroll-container admin-inner-table-surface', className].filter(Boolean).join(' ')}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={['p-4', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
  </section>
);

const ContractPanel: React.FC<{
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  bodyClassName?: string;
}> = ({ title, children, aside, bodyClassName }) => (
  <DialogPanel title={title} actions={aside} bodyClassName={bodyClassName}>
    {children}
  </DialogPanel>
);

const DetailRows: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <ContractPanel title="合同主信息" bodyClassName={['admin-contract-detail-grid', className].filter(Boolean).join(' ')}>
    {children}
  </ContractPanel>
);

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="admin-contract-detail-item">
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
  </div>
);

export const ContractPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const statusDict = useDict('oa_contract_status');
  const typeDict = useDict('oa_contract_type');
  const severityDict = useDict('severity_level');
  const [rows, setRows] = useState<OaContract[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), status: '', contractName: '', contractNo: '', riskLevel: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OaContract>(emptyForm);
  const [templates, setTemplates] = useState<OaContractTemplate[]>([]);
  const [templateVarsOpen, setTemplateVarsOpen] = useState(false);
  const [templateVarsForm, setTemplateVarsForm] = useState<Record<string, string>>({});
  const [activeTemplate, setActiveTemplate] = useState<OaContractTemplate | null>(null);
  const [detail, setDetail] = useState<OaContract | null>(null);
  const [risks, setRisks] = useState<OaRiskAlert[]>([]);
  const [sealApplications, setSealApplications] = useState<OaSealApplication[]>([]);
  const [linkSealId, setLinkSealId] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CrmCustomer[]>([]);
  const [budgetSubjectOptions, setBudgetSubjectOptions] = useState<BudgetSubject[]>([]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await contractApi.list({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        status: query.status || undefined,
        contractName: query.contractName || undefined,
        contractNo: query.contractNo || undefined,
        riskLevel: query.riskLevel || undefined,
      });
      setRows(normalizeRows(result));
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取合同列表失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useWorkflowRefresh(fetchRows, 'biz_contract');

  useEffect(() => {
    const loadReferences = async () => {
      try {
        const [projectResult, customerResult, subjectResult] = await Promise.all([
          projectApi.list({ pageNum: 1, pageSize: 100 }),
          crmApi.listCustomers({ pageNum: 1, pageSize: 100 }),
          budgetApi.listSubjects({ pageNum: 1, pageSize: 100 }),
        ]);
        setProjectOptions(projectResult.rows || []);
        setCustomerOptions(customerResult.rows || []);
        setBudgetSubjectOptions(subjectResult.rows || []);
      } catch (error) {
        toast.error(getErrorMessage(error, '加载合同候选数据失败'));
      }
    };
    void loadReferences();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await contractTemplateApi.listActive();
        setTemplates(list || []);
      } catch (err) {
        console.warn('加载合同模板失败', err);
      }
    })();
  }, []);

  useEffect(() => {
    const state = location.state as { focusContractId?: number } | null;
    if (!state?.focusContractId) {
      return;
    }
    const focusContractId = state.focusContractId;
    const openFocusedDetail = async () => {
      try {
        await openDetail({ contractId: focusContractId } as OaContract);
      } finally {
        navigate(location.pathname, { replace: true, state: {} });
      }
    };
    void openFocusedDetail();
  }, [location.pathname, location.state, navigate]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const pendingCount = useMemo(() => rows.filter((item) => item.status === 'PENDING').length, [rows]);
  const draftCount = useMemo(() => rows.filter((item) => item.status === 'DRAFT').length, [rows]);
  const highRiskCount = useMemo(() => rows.filter((item) => ['HIGH', 'CRITICAL'].includes(item.riskLevel || '')).length, [rows]);
  const openRiskCount = useMemo(() => risks.filter((item) => item.riskStatus === 'OPEN' || item.riskStatus === 'HANDLING').length, [risks]);

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: OaContract) => {
    setForm({ ...item });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setForm(emptyForm);
  };

  const handlePickTemplate = (templateIdStr: string) => {
    if (!templateIdStr || templateIdStr === 'NONE') {
      setForm((prev) => ({ ...prev, templateId: undefined }));
      return;
    }
    const tpl = templates.find((t) => String(t.id) === templateIdStr);
    if (!tpl) return;
    let varDefs: Array<{ key: string; label?: string; required?: boolean }> = [];
    try {
      if (tpl.variables) varDefs = JSON.parse(tpl.variables);
    } catch {
      varDefs = [];
    }
    setActiveTemplate(tpl);
    if (varDefs && varDefs.length > 0) {
      const init: Record<string, string> = {};
      varDefs.forEach((v) => { init[v.key] = ''; });
      setTemplateVarsForm(init);
      setTemplateVarsOpen(true);
    } else {
      setForm((prev) => ({
        ...prev,
        templateId: tpl.id,
        contractType: tpl.category || prev.contractType,
        remark: prev.remark || tpl.content || '',
      }));
      toast.success(`已套用模板：${tpl.templateName}`);
    }
  };

  const handleApplyTemplateVars = async () => {
    if (!activeTemplate?.id) return;
    try {
      const rendered = await contractTemplateApi.render(activeTemplate.id, templateVarsForm);
      setForm((prev) => ({
        ...prev,
        templateId: activeTemplate.id,
        contractType: activeTemplate.category || prev.contractType,
        remark: rendered || prev.remark,
      }));
      setTemplateVarsOpen(false);
      setActiveTemplate(null);
      toast.success(`已套用模板：${activeTemplate.templateName}`);
    } catch (err) {
      toast.error(getErrorMessage(err, '模板渲染失败'));
    }
  };

  const openDetail = async (item: OaContract) => {
    setDetail(item);
    setRisks([]);
    setLinkSealId('');
    setDetailLoading(true);
    try {
      const [contract, riskResult, sealResult] = await Promise.all([
        contractApi.getInfo(item.contractId!),
        contractApi.risks(item.contractId!),
        sealApplicationApi.list({ pageNum: 1, pageSize: 50, status: 'APPROVED' }),
      ]);
      setDetail(contract);
      setRisks(riskResult);
      setSealApplications(normalizeRows(sealResult));
    } catch (error) {
      toast.error(getErrorMessage(error, '获取合同详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const saveForm = async () => {
    if (!form.contractName.trim() || !form.counterpartyName.trim() || !form.contractType || Number(form.amount) < 0) {
      toast.warning('请补全合同名称、相对方、合同类型和金额');
      return;
    }
    setSaving(true);
    try {
      if (form.contractId) {
        await contractApi.edit(form);
      } else {
        await contractApi.add(form);
      }
      toast.success('保存成功');
      closeDialog();
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存合同失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    const current = confirmState;
    setConfirmState(null);
    try {
      if (current.type === 'delete') {
        await contractApi.remove([current.id]);
        toast.success('删除成功');
      } else if (current.type === 'cancel') {
        await contractApi.cancel(current.id);
        toast.success('取消成功');
      } else {
        await contractApi.submit(current.id);
        toast.success('提交成功');
      }
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const linkSeal = async () => {
    if (!detail?.contractId || !linkSealId) return;
    try {
      await contractApi.linkSeal(detail.contractId, Number(linkSealId));
      toast.success('绑定成功');
      await openDetail(detail);
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定用印失败'));
    }
  };
  const hasActiveFilters = Boolean(query.status || query.contractName || query.contractNo || query.riskLevel);
  const currentStatusLabel = query.status ? statusDict.getLabel(query.status) : '全部状态';
  const currentRiskLabel = query.riskLevel ? severityDict.getLabel(query.riskLevel) : '全部风险';
  const metrics = [
    { label: '合同总数', value: String(total), meta: `当前页 ${rows.length}`, icon: <FileSignature size={18} />, tone: 'blue' },
    { label: '草稿', value: String(draftCount), meta: '可编辑提交', icon: <Edit size={18} />, tone: 'amber' },
    { label: '审批中', value: String(pendingCount), meta: '流程流转', icon: <Send size={18} />, tone: 'violet' },
    { label: '高风险', value: String(highRiskCount), meta: 'HIGH / CRITICAL', icon: <AlertTriangle size={18} />, tone: 'red' },
  ];

  const pageActions = (
    <div className="space-y-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">CONTRACTS</p>
          <h2>合同管理</h2>
          <span>跟踪合同模板、相对方、金额、风险、用印和审批状态</span>
        </div>
        <div className="admin-source-controls">
          <Button size="sm" onClick={openCreate} disabled={!hasPermission('oa:contract:add')}>
            <Plus size={16} />
            新建合同
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
            <div className="admin-source-stat-icon">{metric.icon}</div>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-oa-filter-grid">
        <label>
          <span className="input-label">状态</span>
          <Select value={query.status || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, status: value === 'ALL' ? '' : value }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">风险等级</span>
          <Select value={query.riskLevel || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, riskLevel: value === 'ALL' ? '' : value }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="风险等级" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部风险</SelectItem>
              {RISK_LEVELS.map((value) => <SelectItem key={value} value={value}>{severityDict.getLabel(value)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">合同名称</span>
          <Input className="h-[42px]" value={query.contractName} onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, contractName: event.target.value }))} placeholder="合同名称" />
        </label>
        <label>
          <span className="input-label">合同编号</span>
          <Input className="h-[42px]" value={query.contractNo} onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, contractNo: event.target.value }))} placeholder="合同编号" />
        </label>
        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">{hasActiveFilters ? `${currentStatusLabel} / ${currentRiskLabel}` : `第 ${query.pageNum} / ${totalPages} 页`}</span>
          <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), status: '', contractName: '', contractNo: '', riskLevel: '' })} disabled={!hasActiveFilters}>
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1200px]">
        <thead>
          <tr>
            <th>合同编号</th>
            <th>合同 / 相对方</th>
            <th>类型 / 金额</th>
            <th>负责人 / 部门</th>
            <th>周期</th>
            <th>附件</th>
            <th>状态</th>
            <th>风险</th>
            <th className="text-right">当前操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableStateRow colSpan={9} title="正在加载合同..." loading />
          ) : rows.length === 0 ? (
            <TableStateRow colSpan={9} title="暂无合同" />
          ) : rows.map((item) => (
            <tr key={item.contractId}>
              <td>
                <div className="font-medium text-slate-900 dark:text-slate-100">{item.contractNo || '-'}</div>
                <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.createTime)}</div>
              </td>
              <td>
                <div className="font-medium text-slate-900 dark:text-slate-100">{item.contractName}</div>
                <div className="mt-1 text-xs text-slate-400">{item.counterpartyName}</div>
              </td>
              <td>
                <div>{typeDict.getLabel(String(item.contractType ?? ''))}</div>
                <div className="mt-1 text-xs text-slate-400">{item.currency || 'CNY'} {Number(item.amount || 0).toLocaleString()}</div>
              </td>
              <td>
                <div>{item.ownerName || '-'}</div>
                <div className="mt-1 text-xs text-slate-400">{item.deptName || '-'}</div>
              </td>
              <td>
                <div>{item.startDate || '-'}</div>
                <div className="mt-1 text-xs text-slate-400">{item.endDate || '-'}</div>
              </td>
              <td>{getAttachmentList(item.attachmentUrl).length} 个</td>
              <td>{getStatusBadge(item.status)}</td>
              <td>{getRiskBadge(item.riskLevel)}</td>
              <td>
                <div className="admin-users-row-actions">
                  <button type="button" title="查看详情" aria-label="查看详情" onClick={() => void openDetail(item)}><Eye size={15} /></button>
                  {['DRAFT', 'REJECTED', 'APPROVED', 'ACTIVE'].includes(item.status || 'DRAFT') && hasPermission('oa:contract:edit') ? <button type="button" title="编辑合同" aria-label="编辑合同" onClick={() => openEdit(item)}><Edit size={15} /></button> : null}
                  {['DRAFT', 'REJECTED'].includes(item.status || 'DRAFT') && hasPermission('oa:contract:submit') ? <button type="button" title="提交审批" aria-label="提交审批" onClick={() => setConfirmState({ type: 'submit', id: item.contractId!, title: '提交合同审批', message: '提交后将进入合同审批流程。', confirmText: '提交' })}><Send size={15} /></button> : null}
                  {['DRAFT', 'PENDING'].includes(item.status || 'DRAFT') && hasPermission('oa:contract:cancel') ? <button type="button" title="取消合同" aria-label="取消合同" onClick={() => setConfirmState({ type: 'cancel', id: item.contractId!, title: '取消合同', message: '取消后该合同不再继续审批。', confirmText: '取消' })}><XCircle size={15} /></button> : null}
                  {['DRAFT', 'REJECTED', 'CANCELLED'].includes(item.status || 'DRAFT') && hasPermission('oa:contract:remove') ? <button type="button" title="删除合同" aria-label="删除合同" onClick={() => setConfirmState({ type: 'delete', id: item.contractId!, title: '删除合同', message: '删除后当前合同不可恢复。', confirmText: '删除', danger: true })}><Trash2 size={15} /></button> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
  ) : null;

  return (
    <>
      <section className="admin-source-page oa-approval-page contract-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={form.contractId ? '编辑合同' : '新建合同'}
        onClose={closeDialog}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button onClick={() => void saveForm()} disabled={saving}>保存</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <ContractPanel title="合同信息" bodyClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="admin-dialog-field">
              <Label>合同编号</Label>
              <Input className="h-11" value={form.contractNo || ''} onChange={(event) => setForm((prev) => ({ ...prev, contractNo: event.target.value }))} placeholder="留空自动生成" />
            </div>
            <div className="admin-dialog-field">
              <Label>合同名称</Label>
              <Input className="h-11" value={form.contractName} onChange={(event) => setForm((prev) => ({ ...prev, contractName: event.target.value }))} />
            </div>
            <div className="admin-dialog-field">
              <Label>相对方</Label>
              <Input className="h-11" value={form.counterpartyName} onChange={(event) => setForm((prev) => ({ ...prev, counterpartyName: event.target.value }))} />
            </div>
            <div className="admin-dialog-field">
              <Label>合同类型</Label>
              <Select value={form.contractType} onValueChange={(value) => setForm((prev) => ({ ...prev, contractType: value }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>合同模板</Label>
              <Select
                value={form.templateId ? String(form.templateId) : 'NONE'}
                onValueChange={handlePickTemplate}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="可选模板套用" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">不使用模板</SelectItem>
                  {templates
                    .filter((t) => !form.contractType || !t.category || t.category === form.contractType)
                    .map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.templateName}（{t.templateCode || '-'}）
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>合同金额</Label>
              <Input className="h-11" type="number" min={0} value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value) || 0 }))} />
            </div>
            <div className="admin-dialog-field">
              <Label>风险等级</Label>
              <Select value={form.riskLevel || 'LOW'} onValueChange={(value) => setForm((prev) => ({ ...prev, riskLevel: value as OaContract['riskLevel'] }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((value) => <SelectItem key={value} value={value}>{severityDict.getLabel(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>开始日期</Label>
              <DatePicker className="h-11" type="date" value={form.startDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} />
            </div>
            <div className="admin-dialog-field">
              <Label>结束日期</Label>
              <DatePicker className="h-11" type="date" value={form.endDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))} />
            </div>
          </ContractPanel>
          <ContractPanel title="业务归属" bodyClassName="grid gap-4 md:grid-cols-3">
            <div className="admin-dialog-field">
              <Label>关联项目</Label>
              <Select
                value={form.projectId ? String(form.projectId) : 'NONE'}
                onValueChange={(value) => {
                  const project = projectOptions.find((item) => String(item.projectId) === value);
                  setForm((prev) => ({
                    ...prev,
                    projectId: value === 'NONE' ? undefined : Number(value),
                    projectName: project?.projectName || '',
                    customerId: project?.customerId || prev.customerId,
                    customerName: project?.customerName || prev.customerName,
                  }));
                }}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不关联项目</SelectItem>
                  {projectOptions.map((item) => (
                    <SelectItem key={item.projectId} value={String(item.projectId)}>
                      {item.projectName} / {item.customerName || '无客户'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>客户</Label>
              <Select
                value={form.customerId ? String(form.customerId) : 'NONE'}
                onValueChange={(value) => {
                  const customer = customerOptions.find((item) => String(item.customerId) === value);
                  setForm((prev) => ({
                    ...prev,
                    customerId: value === 'NONE' ? undefined : Number(value),
                    customerName: customer?.customerName || '',
                  }));
                }}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不关联客户</SelectItem>
                  {customerOptions.map((item) => (
                    <SelectItem key={item.customerId} value={String(item.customerId)}>
                      {item.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>预算科目</Label>
              <Select
                value={form.budgetSubjectCode || 'NONE'}
                onValueChange={(value) => {
                  const subject = budgetSubjectOptions.find((item) => item.subjectCode === value);
                  setForm((prev) => ({
                    ...prev,
                    budgetSubjectCode: value === 'NONE' ? '' : value,
                    budgetSubjectName: subject?.subjectName || '',
                  }));
                }}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="选择预算科目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不指定预算科目</SelectItem>
                  {budgetSubjectOptions.map((item) => (
                    <SelectItem key={item.subjectId} value={item.subjectCode}>
                      {item.subjectCode} / {item.subjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </ContractPanel>
          <ContractPanel title="附件" bodyClassName="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>合同附件</Label>
              <FileUpload value={form.attachmentUrl || ''} onChange={(urls) => setForm((prev) => ({ ...prev, attachmentUrl: urls }))} maxCount={5} />
            </div>
            <div className="admin-dialog-field">
              <Label>归档附件</Label>
              <FileUpload value={form.archiveAttachmentUrl || ''} onChange={(urls) => setForm((prev) => ({ ...prev, archiveAttachmentUrl: urls }))} maxCount={5} />
            </div>
          </ContractPanel>
          <ContractPanel title="备注">
            <div className="admin-dialog-field">
              <Label>备注内容</Label>
              <Textarea className="min-h-[100px] resize-none" value={form.remark || ''} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
            </div>
          </ContractPanel>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detail)}
        title={detail?.contractNo || '合同详情'}
        onClose={() => setDetail(null)}
        width="wide"
        headerAside={detail && !detailLoading ? getStatusBadge(detail.status) : null}
        footer={<Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-400">
            <Clock3 className="mr-2 h-4 w-4 animate-spin" />
            正在加载合同详情...
          </div>
        ) : detail ? (
          <div className="admin-dialog-stack">
            <div className="admin-source-stat-grid">
              <ContractMetric label="合同金额" value={`${detail.currency || 'CNY'} ${Number(detail.amount || 0).toLocaleString()}`} meta="合同详情" icon={<FileSignature size={18} />} tone="blue" />
              <ContractMetric label="风险等级" value={getRiskBadge(detail.riskLevel)} meta={`开放风险 ${openRiskCount}`} icon={<AlertTriangle size={18} />} tone="amber" />
              <ContractMetric label="合同状态" value={getStatusBadge(detail.status)} meta="当前流程" icon={<Send size={18} />} tone="green" />
              <ContractMetric label="附件数量" value={`${getAttachmentList(detail.attachmentUrl).length} 个`} meta="合同附件" icon={<Link2 size={18} />} tone="violet" />
            </div>

            <DetailRows>
              {[
                ['合同名称', detail.contractName],
                ['相对方', detail.counterpartyName],
                ['合同类型', typeDict.getLabel(String(detail.contractType ?? ''))],
                ['金额', `${detail.currency || 'CNY'} ${Number(detail.amount || 0).toLocaleString()}`],
                ['负责人', detail.ownerName],
                ['部门', detail.deptName],
                ['关联项目', detail.projectName],
                ['客户', detail.customerName],
                ['预算科目', detail.budgetSubjectName || detail.budgetSubjectCode],
                ['发票状态', detail.invoiceStatus],
                ['开始日期', detail.startDate],
                ['结束日期', detail.endDate],
                ['流程实例', detail.instanceId],
                ['用印申请', detail.sealApplicationId ? String(detail.sealApplicationId) : '-'],
              ].map(([label, value]) => (
                <DetailRow key={label} label={label} value={value || '-'} />
              ))}
            </DetailRows>

            <div className="grid gap-4 xl:grid-cols-2">
              <ContractPanel
                title="关联合同用印"
                aside={(
                  <Button size="sm" variant="outline" onClick={() => void linkSeal()} disabled={!linkSealId}>
                    <Link2 size={14} className="mr-1.5" />
                    绑定
                  </Button>
                )}
              >
                <Select value={linkSealId || 'NONE'} onValueChange={(value) => setLinkSealId(value === 'NONE' ? '' : value)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="选择已审批用印申请" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">选择已审批用印申请</SelectItem>
                    {sealApplications.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>{item.applicationNo} / {item.sealName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ContractPanel>
              <ContractPanel title="附件">
                <AttachmentLinks value={detail.attachmentUrl} />
                <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <AttachmentLinks value={detail.archiveAttachmentUrl} />
                </div>
              </ContractPanel>
            </div>

            <ContractPanel
              title={`风险记录 ${openRiskCount}`}
              aside={(
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>开放风险</span>
                </div>
              )}
              bodyClassName={risks.length ? 'admin-contract-risk-grid' : undefined}
            >
              {risks.length ? (
                <>
                  {risks.map((risk) => (
                    <div key={risk.id} className="admin-contract-risk-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{risk.riskName}</span>
                        {getRiskBadge(risk.riskLevel)}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">{risk.riskSource} / {risk.riskStatus} / {formatDateTimeDisplay(risk.detectedTime)}</div>
                    </div>
                  ))}
                </>
              ) : <div className="admin-dialog-empty-note min-h-[7rem]">暂无风险记录</div>}
            </ContractPanel>

            {detail.contractId ? <ContractMilestoneSection contractId={detail.contractId} /> : null}

            <BusinessTimeline businessType="CONTRACT" businessId={detail.contractId} />
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={templateVarsOpen}
        title={`填入模板变量 · ${activeTemplate?.templateName || ''}`}
        onClose={() => { setTemplateVarsOpen(false); setActiveTemplate(null); }}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setTemplateVarsOpen(false); setActiveTemplate(null); }}>取消</Button>
            <Button onClick={() => void handleApplyTemplateVars()}>套用</Button>
          </div>
        )}
      >
        <div className="admin-dialog-stack">
          {Object.keys(templateVarsForm).length === 0 ? (
            <div className="text-sm text-slate-500">该模板未定义变量。</div>
          ) : (
            Object.keys(templateVarsForm).map((key) => (
              <div key={key} className="admin-dialog-field">
                <Label>{key}</Label>
                <Input
                  value={templateVarsForm[key] || ''}
                  onChange={(e) => setTemplateVarsForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`{{${key}}} 的值`}
                />
              </div>
            ))
          )}
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || '确认操作'}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || '确定'}
        danger={confirmState?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
};

export default ContractPage;
