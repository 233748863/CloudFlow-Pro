import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CircleDollarSign, FileText, FolderKanban, Handshake, LifeBuoy, ReceiptText, RefreshCcw, Target, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import { WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';
import { crmApi, CrmCustomerWorkspace, CrmRemoteProjectLink } from '@/services/api/crm';
import { invoiceApi, Invoice } from '@/services/api/invoice';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';

type WorkspaceTab = 'overview' | 'contact' | 'opportunity' | 'quote' | 'cashflow' | 'renewal' | 'ticket' | 'project';

const tabLabelMap: Array<{ value: WorkspaceTab; label: string; icon: React.ReactNode }> = [
  { value: 'overview', label: '概览', icon: <Handshake size={14} /> },
  { value: 'contact', label: '联系人与跟进', icon: <UserRound size={14} /> },
  { value: 'opportunity', label: '商机', icon: <Target size={14} /> },
  { value: 'quote', label: '报价与合同', icon: <FileText size={14} /> },
  { value: 'cashflow', label: '回款与发票', icon: <ReceiptText size={14} /> },
  { value: 'renewal', label: '续约', icon: <RefreshCcw size={14} /> },
  { value: 'ticket', label: '工单', icon: <LifeBuoy size={14} /> },
  { value: 'project', label: '关联项目', icon: <FolderKanban size={14} /> },
];

const healthToneMap: Record<string, string> = {
  GREEN: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  YELLOW: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  RED: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

const healthLabelMap: Record<string, string> = {
  GREEN: '健康',
  YELLOW: '关注',
  RED: '高风险',
};

const statusLabelMap: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  LEAD: '线索',
  QUALIFIED: '已确认',
  PROPOSAL: '方案报价',
  NEGOTIATION: '商务谈判',
  WON: '赢单',
  LOST: '输单',
  PENDING: '审批中',
  APPROVED: '已通过',
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

const renderHealthBadge = (level?: string) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${healthToneMap[level || 'GREEN'] || healthToneMap.GREEN}`}>
    {healthLabelMap[level || 'GREEN'] || level || '健康'}
  </span>
);

const renderStatus = (status?: string) => statusLabelMap[status || ''] || status || '-';
const renderInvoiceStatus = (status?: string) => invoiceStatusLabelMap[status || ''] || status || '-';
const renderSeverity = (severity?: string) => severityLabelMap[severity || ''] || severity || '-';
const renderHealthLabel = (level?: string) => healthLabelMap[level || ''] || level || '-';

const renderProjectCard = (item: CrmRemoteProjectLink, onOpen: (projectId: number) => void) => (
  <Card key={item.projectId}>
    <CardHeader className="pb-3">
      <CardTitle className="text-base">{item.projectName || '-'}</CardTitle>
      <div className="text-xs text-slate-500">{item.projectNo || '-'} / {renderStatus(item.status)}</div>
    </CardHeader>
    <CardContent className="space-y-2 text-sm">
      <div>风险等级：{item.riskLevel || '-'}</div>
      <div>预算 / 成本：{item.budgetAmount || 0} / {item.actualCostAmount || 0}</div>
      <div>来源：{item.sourceName || item.sourceType || '-'}</div>
      {item.projectId ? <Button size="sm" variant="outline" onClick={() => onOpen(item.projectId!)}>查看项目工作区</Button> : null}
    </CardContent>
  </Card>
);

export default function CrmCustomerWorkspacePage() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [workspace, setWorkspace] = useState<CrmCustomerWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [contractDraftName, setContractDraftName] = useState('');
  const [projectDraftName, setProjectDraftName] = useState('');
  const [budgetDraftName, setBudgetDraftName] = useState('');
  const [invoiceDraftNo, setInvoiceDraftNo] = useState('');
  const [invoiceDraftCode, setInvoiceDraftCode] = useState('');
  const [invoiceCandidates, setInvoiceCandidates] = useState<Invoice[]>([]);
  const [selectedBindInvoiceId, setSelectedBindInvoiceId] = useState('');
  const [selectedBindReceivableId, setSelectedBindReceivableId] = useState('');

  const numericCustomerId = Number(customerId || 0);

  const load = async () => {
    if (!numericCustomerId) return;
    setLoading(true);
    try {
      const result = await crmApi.getCustomerWorkspace(numericCustomerId);
      setWorkspace(result);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载客户360失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [numericCustomerId]);

  useEffect(() => {
    if (!numericCustomerId) return;
    void invoiceApi.list({
      pageNum: 1,
      pageSize: 100,
      invoiceDirection: 'OUTPUT',
      customerId: numericCustomerId,
    }).then((result) => {
      setInvoiceCandidates(result.rows || []);
    }).catch((error) => {
      toast.error(getErrorMessage(error, '加载可绑定发票失败'));
    });
  }, [numericCustomerId]);

  const metrics = useMemo(() => {
    if (!workspace) return [];
    return [
      { label: '健康度', value: renderHealthLabel(workspace.customer.healthLevel), hint: workspace.customer.healthReason || '状态正常' },
      { label: '商机', value: workspace.opportunities.length, hint: '客户当前商机数' },
      { label: '回款计划', value: workspace.receivables.length, hint: '含开票联动' },
      { label: '服务工单', value: workspace.tickets.length, hint: '含高严重度工单' },
    ];
  }, [workspace]);

  const createContractDraft = async () => {
    if (!numericCustomerId) return;
    try {
      const contractId = await crmApi.createWorkspaceContractDraft(numericCustomerId, {
        contractName: contractDraftName || `${workspace?.customer.customerName || ''}合同草稿`,
      });
      toast.success(`已生成合同草稿 #${contractId}`);
      setContractDraftName('');
      await load();
      navigate('/office/contracts', { state: { focusContractId: contractId } });
    } catch (error) {
      toast.error(getErrorMessage(error, '生成合同草稿失败'));
    }
  };

  const createProjectDraft = async () => {
    if (!numericCustomerId) return;
    try {
      const projectId = await crmApi.createWorkspaceProjectDraft(numericCustomerId, {
        projectName: projectDraftName || `${workspace?.customer.customerName || ''}交付项目`,
      });
      toast.success(`已生成项目草稿 #${projectId}`);
      setProjectDraftName('');
      await load();
      navigate('/office/project', { state: { focusProjectId: projectId } });
    } catch (error) {
      toast.error(getErrorMessage(error, '生成项目草稿失败'));
    }
  };

  const createInvoiceDraft = async () => {
    if (!numericCustomerId) return;
    try {
      await crmApi.createWorkspaceInvoiceDraft(numericCustomerId, {
        invoiceDirection: 'OUTPUT',
        invoiceCode: invoiceDraftCode,
        invoiceNo: invoiceDraftNo,
        buyerName: workspace?.customer.customerName,
      });
      toast.success('已生成销项发票草稿');
      setInvoiceDraftCode('');
      setInvoiceDraftNo('');
      await load();
      navigate('/office/invoice');
    } catch (error) {
      toast.error(getErrorMessage(error, '生成发票草稿失败'));
    }
  };

  const createBudgetDraft = async () => {
    if (!numericCustomerId) return;
    const project = workspace?.projects[0];
    if (!project?.projectId) {
      toast.error('请先生成或关联项目，再创建项目预算草稿');
      return;
    }
    try {
      await crmApi.createWorkspaceBudgetDraft(numericCustomerId, {
        budgetName: budgetDraftName || `${workspace?.customer.customerName || ''}项目预算`,
        targetType: 'PROJECT',
        targetId: project.projectId,
        targetName: project.projectName,
        projectId: project.projectId,
        projectName: project.projectName,
        totalAmount: project.budgetAmount || 0,
        lines: [
          {
            subjectCode: 'SUB-SERVICE',
            subjectName: '外包服务费',
            amount: project.budgetAmount || 0,
          },
        ],
      });
      toast.success('已生成预算草稿');
      setBudgetDraftName('');
      await load();
      navigate('/office/budget');
    } catch (error) {
      toast.error(getErrorMessage(error, '生成预算草稿失败'));
    }
  };

  const bindInvoiceToReceivable = async () => {
    if (!numericCustomerId || !selectedBindInvoiceId || !selectedBindReceivableId || !workspace) return;
    const receivable = workspace.receivables.find((item) => String(item.receivableId) === selectedBindReceivableId);
    if (!receivable?.receivableId) return;
    try {
      await crmApi.bindWorkspaceInvoice(numericCustomerId, Number(selectedBindInvoiceId), {
        receivableId: receivable.receivableId,
        contractId: receivable.contractId,
        contractNo: receivable.contractNo,
      });
      toast.success('发票已绑定到回款');
      setSelectedBindInvoiceId('');
      setSelectedBindReceivableId('');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定发票失败'));
    }
  };

  const confirmReceivable = async (receivableId?: number) => {
    if (!numericCustomerId || !receivableId) return;
    try {
      await crmApi.confirmWorkspaceReceivable(numericCustomerId, receivableId);
      toast.success('回款已确认');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '确认回款失败'));
    }
  };

  const voidInvoice = async (invoiceId?: number) => {
    if (!numericCustomerId || !invoiceId) return;
    try {
      await crmApi.voidWorkspaceInvoice(numericCustomerId, invoiceId, '客户360内作废发票');
      toast.success('发票已作废');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '作废发票失败'));
    }
  };

  if (!workspace) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/office/crm/customers')}>
          <ArrowLeft size={14} className="mr-1.5" />返回客户管理
        </Button>
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center text-sm text-slate-500 dark:border-slate-700">
          {loading ? '加载客户360中...' : '未找到客户工作区数据'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WorkspaceHeroCard
        badge={renderHealthBadge(workspace.customer.healthLevel)}
        title={workspace.customer.customerName}
        description={`客户360 = 客户资料、销售、合同、回款、续约、工单、项目集中工作区。负责人 ${workspace.customer.ownerName || '-'}，最近跟进 ${formatDateTimeDisplay(workspace.customer.lastFollowUpTime)}。`}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/office/crm/customers')}>
              <ArrowLeft size={14} className="mr-1.5" />返回客户管理
            </Button>
            <Button size="sm" onClick={() => void load()}>
              <RefreshCcw size={14} className="mr-1.5" />刷新
            </Button>
          </>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item) => (
            <WorkspaceMetricCard key={item.label} label={item.label} value={item.value} hint={item.hint} />
          ))}
        </div>
      </WorkspaceHeroCard>

      <Tabs value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {tabLabelMap.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="gap-1.5">
              {item.icon}
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <WorkspaceSectionCard title="健康原因" description="点击跳转到对应业务分区。">
              <div className="space-y-2">
                {workspace.healthReasons.map((item) => (
                  <button
                    key={`${item.type}-${item.code}`}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                    onClick={() => {
                      const target = item.linkTarget || '';
                      if (target.includes('?tab=')) {
                        const nextTab = target.split('?tab=').pop();
                        if (nextTab === 'cashflow') setTab('cashflow');
                        if (nextTab === 'ticket') setTab('ticket');
                        if (nextTab === 'renewal') setTab('renewal');
                        if (nextTab === 'follow-up') setTab('contact');
                      }
                    }}
                  >
                    <span>{item.name || '-'}</span>
                    <span className="text-xs text-slate-500">{item.level || '-'}</span>
                  </button>
                ))}
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard title="资料快照" description="客户基础资料与节奏信息。">
              <div className="space-y-2 text-sm">
                <div>负责人：{workspace.customer.ownerName || '-'}</div>
                <div>电话：{workspace.customer.phone || '-'}</div>
                <div>邮箱：{workspace.customer.email || '-'}</div>
                <div>标签：{workspace.customer.customerTags || '-'}</div>
                <div>下次跟进：{formatDateTimeDisplay(workspace.customer.nextFollowUpTime)}</div>
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard title="经营提醒" description="当前经营动作的优先处理项。">
              <div className="space-y-2 text-sm">
                <div>待处理商机：{workspace.opportunities.filter((item) => !['WON', 'LOST'].includes(item.stage || '')).length}</div>
                <div>待收回款：{workspace.receivables.filter((item) => (item.outstandingAmount || 0) > 0).length}</div>
                <div>待续约：{workspace.renewals.filter((item) => !['WON', 'LOST', 'CLOSED'].includes(item.status || '')).length}</div>
                <div>未关闭工单：{workspace.tickets.filter((item) => !['RESOLVED', 'CLOSED'].includes(item.status || '')).length}</div>
              </div>
            </WorkspaceSectionCard>
            <WorkspaceSectionCard title="联动汇总" description="CRM 与 OA 的闭环规模。">
              <div className="space-y-2 text-sm">
                <div>合同 / 项目：{workspace.linkSummary?.contractCount || 0} / {workspace.linkSummary?.projectCount || 0}</div>
                <div>预算 / 发票：{workspace.linkSummary?.budgetCount || 0} / {workspace.linkSummary?.invoiceCount || 0}</div>
                <div>联动待办 / 风险：{workspace.linkSummary?.openTodoCount || 0} / {workspace.linkSummary?.openRiskCount || 0}</div>
              </div>
            </WorkspaceSectionCard>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkspaceSectionCard title="跨模块待办" description="从客户360直接进入对应 OA / CRM 处理页。">
              <div className="space-y-2">
                {workspace.crossModuleTodos.length ? workspace.crossModuleTodos.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                    onClick={() => navigate(item.path || '/dashboard')}
                  >
                    <span>{item.title || '-'}</span>
                    <span className="text-xs text-slate-500">{item.sourceLabel || item.module || '-'}</span>
                  </button>
                )) : <div className="text-sm text-slate-500">暂无跨模块待办</div>}
              </div>
            </WorkspaceSectionCard>
            <WorkspaceSectionCard title="跨模块风险" description="预算阈值、发票异常和高风险链路汇总。">
              <div className="space-y-2">
                {workspace.crossModuleRisks.length ? workspace.crossModuleRisks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                    onClick={() => navigate(item.path || '/dashboard')}
                  >
                    <span>{item.title || '-'}</span>
                    <span className="text-xs text-slate-500">{item.level || '-'}</span>
                  </button>
                )) : <div className="text-sm text-slate-500">暂无跨模块风险</div>}
              </div>
            </WorkspaceSectionCard>
          </div>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkspaceSectionCard title="联系人" description="客户主联系人与协同联系人。">
              <div className="space-y-2">
                {workspace.contacts.length ? workspace.contacts.map((item) => (
                  <div key={item.contactId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <div>{item.contactName}</div>
                    <div className="text-xs text-slate-500">{item.position || '-'} / {item.mobile || item.phone || '-'}</div>
                  </div>
                )) : <div className="text-sm text-slate-500">暂无联系人</div>}
              </div>
            </WorkspaceSectionCard>
            <WorkspaceSectionCard title="跟进记录" description="最近跟进与后续安排。">
              <div className="space-y-2">
                {workspace.followUps.length ? workspace.followUps.map((item) => (
                  <div key={item.followUpId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <div>{item.content}</div>
                    <div className="text-xs text-slate-500">{formatDateTimeDisplay(item.followUpTime)} / 下次 {formatDateTimeDisplay(item.nextFollowUpTime)}</div>
                  </div>
                )) : <div className="text-sm text-slate-500">暂无跟进记录</div>}
              </div>
            </WorkspaceSectionCard>
          </div>
        </TabsContent>

        <TabsContent value="opportunity" className="space-y-4">
          <WorkspaceSectionCard title="商机推进" description="客户当前商机与推进阶段。">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.opportunities.length ? workspace.opportunities.map((item) => (
                <Card key={item.opportunityId}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{item.opportunityName}</CardTitle>
                    <div className="text-xs text-slate-500">{renderStatus(item.stage)} / 预计签约 {item.expectedSignDate || '-'}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>金额：{item.expectedAmount || 0}</div>
                    <div>赢率：{item.winRate || 0}%</div>
                    <div>负责人：{item.ownerName || '-'}</div>
                  </CardContent>
                </Card>
              )) : <div className="text-sm text-slate-500">暂无商机</div>}
            </div>
          </WorkspaceSectionCard>
        </TabsContent>

        <TabsContent value="quote" className="space-y-4">
          <WorkspaceSectionCard title="报价与合同" description="报价审批、合同联动与跳转。">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.quotes.length ? workspace.quotes.map((item) => (
                <Card key={item.quoteId}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{item.quoteName}</CardTitle>
                    <div className="text-xs text-slate-500">{renderStatus(item.status)} / 合同 {item.contractNo || '-'}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>金额：{item.totalAmount || 0}</div>
                    <div>负责人：{item.ownerName || '-'}</div>
                    {item.contractId ? <Button size="sm" variant="outline" onClick={() => navigate('/office/contracts', { state: { focusContractId: item.contractId } })}>打开 OA 合同</Button> : null}
                  </CardContent>
                </Card>
              )) : <div className="text-sm text-slate-500">暂无报价</div>}
            </div>
            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-sm font-medium">新建 OA 合同草稿</div>
              <div className="flex flex-col gap-3 md:flex-row">
                <Input value={contractDraftName} onChange={(event) => setContractDraftName(event.target.value)} placeholder="合同名称，例如：景曜科技续约合同" />
                <Button onClick={() => void createContractDraft()}>生成合同草稿</Button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.contracts.length ? workspace.contracts.map((item) => (
                <Card key={item.contractId}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{item.contractName}</CardTitle>
                    <div className="text-xs text-slate-500">{renderStatus(item.status)} / 发票 {renderInvoiceStatus(item.invoiceStatus)}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>合同编号：{item.contractNo || '-'}</div>
                    <div>金额：{item.amount || 0}</div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/office/contracts', { state: { focusContractId: item.contractId } })}>打开 OA 合同</Button>
                  </CardContent>
                </Card>
              )) : <div className="text-sm text-slate-500">暂无关联合同</div>}
            </div>
          </WorkspaceSectionCard>
        </TabsContent>

        <TabsContent value="cashflow" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkspaceSectionCard title="回款计划" description="回款状态与开票联动。">
              <div className="space-y-2">
                {workspace.receivables.length ? workspace.receivables.map((item) => (
                  <div key={item.receivableId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <div>{item.receivableName}</div>
                    <div className="text-xs text-slate-500">{renderStatus(item.status)} / 计划 {item.plannedAmount || 0} / 未收 {item.outstandingAmount || 0}</div>
                    <div className="text-xs text-slate-500">发票状态 {renderInvoiceStatus(item.invoiceStatus)} / 到期 {item.dueDate || '-'}</div>
                  </div>
                )) : <div className="text-sm text-slate-500">暂无回款计划</div>}
              </div>
            </WorkspaceSectionCard>
            <WorkspaceSectionCard title="发票口径" description="发票通过 OA 发票模块维护，并实时回写 CRM 回款状态。">
              <div className="space-y-2 text-sm">
                <div>已绑定回款条数：{workspace.receivables.filter((item) => item.invoiceStatus && item.invoiceStatus !== 'NONE').length}</div>
                <div>已全额核销：{workspace.receivables.filter((item) => item.invoiceStatus === 'WRITEOFF_FULL').length}</div>
                <div>部分核销：{workspace.receivables.filter((item) => item.invoiceStatus === 'WRITEOFF_PARTIAL').length}</div>
                <Button size="sm" variant="outline" onClick={() => navigate('/office/invoice')}>打开 OA 发票管理</Button>
              </div>
            </WorkspaceSectionCard>
          </div>
          <WorkspaceSectionCard title="新建销项发票草稿" description="在客户360内直接发起 OA 发票录入。">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input value={invoiceDraftCode} onChange={(event) => setInvoiceDraftCode(event.target.value)} placeholder="发票代码，例如：044002600111" />
              <Input value={invoiceDraftNo} onChange={(event) => setInvoiceDraftNo(event.target.value)} placeholder="发票号码，例如：87654321" />
              <Button onClick={() => void createInvoiceDraft()}>生成发票草稿</Button>
            </div>
          </WorkspaceSectionCard>
          <WorkspaceSectionCard title="绑定回款发票" description="客户360内直接把销项发票绑定到回款计划。">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Select value={selectedBindReceivableId || 'NONE'} onValueChange={(value) => setSelectedBindReceivableId(value === 'NONE' ? '' : value)}>
                <SelectTrigger><SelectValue placeholder="选择回款计划" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">请选择回款计划</SelectItem>
                  {workspace.receivables.map((item) => (
                    <SelectItem key={item.receivableId} value={String(item.receivableId)}>
                      {item.receivableName} / {renderStatus(item.status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedBindInvoiceId || 'NONE'} onValueChange={(value) => setSelectedBindInvoiceId(value === 'NONE' ? '' : value)}>
                <SelectTrigger><SelectValue placeholder="选择销项发票" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">请选择销项发票</SelectItem>
                  {invoiceCandidates.filter((item) => !item.receivableId).map((item) => (
                    <SelectItem key={item.invoiceId} value={String(item.invoiceId)}>
                      {item.invoiceCode} / {item.invoiceNo} / {renderInvoiceStatus(item.status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void bindInvoiceToReceivable()}>绑定发票</Button>
            </div>
          </WorkspaceSectionCard>
          <WorkspaceSectionCard title="OA 发票摘要" description="发票异常和核销状态汇总。">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.invoices.length ? workspace.invoices.map((item) => (
                <Card key={item.invoiceId}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{item.invoiceNo || '-'}</CardTitle>
                    <div className="text-xs text-slate-500">{renderInvoiceStatus(item.status)} / {item.invoiceDirection === 'OUTPUT' ? '销项' : '进项'}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>发票代码：{item.invoiceCode || '-'}</div>
                    <div>金额：{item.grossAmount || 0}</div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate('/office/invoice')}>打开 OA 发票</Button>
                      {item.status !== 'VOID' ? <Button size="sm" variant="outline" onClick={() => void voidInvoice(item.invoiceId)}>作废</Button> : null}
                      {item.externalLinkUrl ? <Button size="sm" variant="outline" onClick={() => window.open(item.externalLinkUrl, '_blank')}>外链</Button> : null}
                    </div>
                  </CardContent>
                </Card>
              )) : <div className="text-sm text-slate-500">暂无 OA 发票摘要</div>}
            </div>
          </WorkspaceSectionCard>
          <WorkspaceSectionCard title="回款确认" description="客户360内直接确认 CRM 回款。">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.receivables.length ? workspace.receivables.map((item) => (
                <Card key={`confirm-${item.receivableId}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{item.receivableName}</CardTitle>
                    <div className="text-xs text-slate-500">{renderStatus(item.status)} / 未收 {item.outstandingAmount || 0}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>到期：{item.dueDate || '-'}</div>
                    <Button size="sm" variant="outline" onClick={() => void confirmReceivable(item.receivableId)} disabled={item.status === 'RECEIVED'}>
                      {item.status === 'RECEIVED' ? '已确认' : '确认回款'}
                    </Button>
                  </CardContent>
                </Card>
              )) : <div className="text-sm text-slate-500">暂无回款计划</div>}
            </div>
          </WorkspaceSectionCard>
        </TabsContent>

        <TabsContent value="renewal" className="space-y-4">
          <WorkspaceSectionCard title="续约窗口" description="续约状态、风险与当前窗口。">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.renewals.length ? workspace.renewals.map((item) => (
                <Card key={item.renewalId}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{item.renewalName}</CardTitle>
                    <div className="text-xs text-slate-500">{renderStatus(item.status)} / 风险 {renderHealthLabel(item.riskLevel)}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>续约金额：{item.renewalAmount || 0}</div>
                    <div>当前到期：{item.currentExpireDate || '-'}</div>
                    <div>风险原因：{item.riskReason || '-'}</div>
                  </CardContent>
                </Card>
              )) : <div className="text-sm text-slate-500">暂无续约</div>}
            </div>
          </WorkspaceSectionCard>
        </TabsContent>

        <TabsContent value="ticket" className="space-y-4">
          <WorkspaceSectionCard title="服务工单" description="客户问题处理闭环。">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.tickets.length ? workspace.tickets.map((item) => (
                <Card key={item.ticketId}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{item.ticketTitle}</CardTitle>
                    <div className="text-xs text-slate-500">{renderSeverity(item.severity)} / {renderStatus(item.status)}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>负责人：{item.ownerName || '-'}</div>
                    <div>截止时间：{formatDateTimeDisplay(item.dueTime)}</div>
                    <div>{item.description || '-'}</div>
                  </CardContent>
                </Card>
              )) : <div className="text-sm text-slate-500">暂无工单</div>}
            </div>
          </WorkspaceSectionCard>
        </TabsContent>

        <TabsContent value="project" className="space-y-4">
          <WorkspaceSectionCard title="关联项目" description="CRM 生成或关联的 OA 项目工作区。">
            <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-sm font-medium">新建 OA 项目草稿</div>
              <div className="flex flex-col gap-3 md:flex-row">
                <Input value={projectDraftName} onChange={(event) => setProjectDraftName(event.target.value)} placeholder="项目名称，例如：景曜科技交付项目" />
                <Button onClick={() => void createProjectDraft()}>生成项目草稿</Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.projects.length ? workspace.projects.map((item) => renderProjectCard(item, (projectId) => navigate('/office/project', { state: { focusProjectId: projectId } }))) : <div className="text-sm text-slate-500">暂无关联项目</div>}
            </div>
          </WorkspaceSectionCard>
          <WorkspaceSectionCard title="OA 预算摘要" description="关联项目预算执行与阈值概览。">
            <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-sm font-medium">新建 OA 预算草稿</div>
              <div className="flex flex-col gap-3 md:flex-row">
                <Input value={budgetDraftName} onChange={(event) => setBudgetDraftName(event.target.value)} placeholder="预算名称，例如：景曜科技项目预算" />
                <Button onClick={() => void createBudgetDraft()}>生成预算草稿</Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.budgets.length ? workspace.budgets.map((item) => (
                <Card key={item.budgetId}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{item.budgetName}</CardTitle>
                    <div className="text-xs text-slate-500">{renderStatus(item.status)} / 阈值 {item.thresholdStatus || 'NORMAL'}</div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>预算总额：{item.totalAmount || 0}</div>
                    <div>已占用 / 已执行：{item.reservedAmount || 0} / {item.actualAmount || 0}</div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/office/budget')}>打开 OA 预算</Button>
                  </CardContent>
                </Card>
              )) : <div className="text-sm text-slate-500">暂无 OA 预算摘要</div>}
            </div>
          </WorkspaceSectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
