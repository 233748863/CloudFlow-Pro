import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CircleDollarSign, FileText, FolderKanban, Handshake, LifeBuoy, ReceiptText, RefreshCcw, Target, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import { crmApi, CrmCustomerWorkspace, CrmRemoteProjectLink } from '@/services/api/crm';
import { invoiceApi, Invoice } from '@/services/api/invoice';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getThresholdStatusLabel } from '@/utils/enumLabels';
import { useDict } from '@/hooks/useDict';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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


const renderHealthBadge = (level?: string) => (
  <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${healthToneMap[level || 'GREEN'] || healthToneMap.GREEN}`}>
    {healthLabelMap[level || 'GREEN'] || level || '健康'}
  </span>
);

interface WorkspacePanelProps {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}

const WorkspacePanel = ({ title, description, children }: WorkspacePanelProps) => (
  <InnerTableSurface className="admin-crm-workspace-panel">
    <div className="admin-crm-workspace-panel-head">
      <div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
    </div>
    <div className="admin-crm-workspace-panel-body">{children}</div>
  </InnerTableSurface>
);

const EmptyPanel = ({ children }: { children: React.ReactNode }) => (
  <div className="admin-crm-workspace-empty">
    {children}
  </div>
);

const InfoRows = ({ rows }: { rows: Array<[string, React.ReactNode]> }) => (
  <div className="admin-crm-workspace-rows">
    {rows.map(([label, value]) => (
      <div key={label} className="admin-crm-workspace-row">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <strong className="text-right font-medium text-slate-900 dark:text-slate-100">{value || '-'}</strong>
      </div>
    ))}
  </div>
);

const ActionListButton = ({
  title,
  meta,
  onClick,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  onClick: () => void;
}) => (
  <button type="button" className="cf-side-link cf-side-link-sm w-full justify-between text-left" onClick={onClick}>
    <span className="min-w-0 truncate">{title}</span>
    {meta ? <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{meta}</span> : null}
  </button>
);

const renderStatus = (status?: string) => statusLabelMap[status || ''] || status || '-';
const renderHealthLabel = (level?: string) => healthLabelMap[level || ''] || level || '-';

const renderProjectCard = (
  item: CrmRemoteProjectLink,
  onOpen: (projectId: number) => void,
  severityLabel: (value?: string) => string,
) => (
  <tr key={item.projectId}>
    <td><strong>{item.projectName || '-'}</strong><small>{item.projectNo || '-'}</small></td>
    <td>{renderStatus(item.status)}</td>
    <td>{severityLabel(item.riskLevel)}</td>
    <td>{item.budgetAmount || 0} / {item.actualCostAmount || 0}</td>
    <td>{item.sourceName || item.sourceType || '-'}</td>
    <td>
      <div className="admin-users-row-actions">
        {item.projectId ? <button type="button" title="查看项目工作区" onClick={() => onOpen(item.projectId!)}><FolderKanban size={15} /></button> : null}
      </div>
    </td>
  </tr>
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

  const invoiceStatusDict = useDict('invoice_status');
  const severityDict = useDict('severity_level');
  const renderInvoiceStatus = (status?: string) => invoiceStatusDict.getLabel(status || '') || status || '-';
  const renderSeverity = (severity?: string) => severityDict.getLabel(severity || '') || severity || '-';

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
    if (!workspace?.customer) return [];
    const opportunities = workspace.opportunities || [];
    const receivables = workspace.receivables || [];
    const tickets = workspace.tickets || [];
    return [
      { label: '健康度', value: renderHealthLabel(workspace.customer.healthLevel), hint: workspace.customer.healthReason || '状态正常' },
      { label: '商机', value: opportunities.length, hint: '客户当前商机数' },
      { label: '回款计划', value: receivables.length, hint: '含开票联动' },
      { label: '服务工单', value: tickets.length, hint: '含高严重度工单' },
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

  if (!workspace?.customer) {
    const emptyActions = (
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">CRM CUSTOMER 360</p>
          <h2>客户360</h2>
          <span>客户资料、销售、合同、回款、续约、工单、项目集中工作区</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => navigate('/office/crm/customers')}>
            <ArrowLeft size={14} className="mr-1.5" />返回客户管理
          </Button>
        </div>
      </header>
    );

    return (
      <section className="admin-source-page">
        <TablePageLayout
          actions={emptyActions}
          table={(
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col" wrapperClassName="flex min-h-0 flex-1 flex-col">
              <EmptyPanel>{loading ? '加载客户360中...' : '未找到客户工作区数据'}</EmptyPanel>
            </InnerTableSurface>
          )}
        />
      </section>
    );
  }

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">CRM CUSTOMER 360</p>
          <h2>{workspace.customer.customerName}</h2>
          <span>负责人 {workspace.customer.ownerName || '-'}，最近跟进 {formatDateTimeDisplay(workspace.customer.lastFollowUpTime)}</span>
        </div>
        <div className="admin-source-controls">
          {renderHealthBadge(workspace.customer.healthLevel)}
            <Button variant="outline" size="sm" onClick={() => navigate('/office/crm/customers')}>
              <ArrowLeft size={14} className="mr-1.5" />返回客户管理
            </Button>
            <Button size="sm" onClick={() => void load()}>
              <RefreshCcw size={14} className="mr-1.5" />刷新
            </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {metrics.map((item, index) => {
          const icons = [Handshake, Target, ReceiptText, LifeBuoy];
          const tones = ['admin-source-tone-blue', 'admin-source-tone-green', 'admin-source-tone-amber', 'admin-source-tone-violet'];
          const Icon = icons[index] || CircleDollarSign;
          return (
            <article key={item.label} className={`card admin-source-stat ${tones[index] || 'admin-source-tone-blue'}`}>
              <span className="admin-source-stat-icon">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <span>{item.hint}</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );

  const pageFilters = (
        <section className="card admin-users-toolbar">
          <TabsList className="w-full justify-start overflow-x-auto">
            {tabLabelMap.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="gap-1.5">
                {item.icon}
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </section>
  );

  const pageContent = (
      <>
        <TabsContent value="overview" className="admin-source-content-grid admin-crm-workspace-tab">
          <div className="grid gap-4 xl:grid-cols-3">
            <WorkspacePanel title="健康原因" description="点击跳转到对应业务分区。">
              <div className="admin-dialog-stack">
                {workspace.healthReasons.map((item) => (
                  <ActionListButton
                    key={`${item.type}-${item.code}`}
                    title={item.name || '-'}
                    meta={item.level || '-'}
                    onClick={() => {
                      const target = item.linkTarget || '';
                      if (target.includes('#')) {
                        const nextTab = target.split('#').pop();
                        if (nextTab === 'cashflow') setTab('cashflow');
                        if (nextTab === 'ticket') setTab('ticket');
                        if (nextTab === 'renewal') setTab('renewal');
                        if (nextTab === 'follow-up') setTab('contact');
                      }
                    }}
                  />
                ))}
              </div>
            </WorkspacePanel>

            <WorkspacePanel title="资料快照" description="客户基础资料与节奏信息。">
              <InfoRows rows={[
                ['负责人', workspace.customer.ownerName || '-'],
                ['电话', workspace.customer.phone || '-'],
                ['邮箱', workspace.customer.email || '-'],
                ['标签', workspace.customer.customerTags || '-'],
                ['下次跟进', formatDateTimeDisplay(workspace.customer.nextFollowUpTime)],
              ]} />
            </WorkspacePanel>

            <WorkspacePanel title="经营提醒" description="当前经营动作的优先处理项。">
              <InfoRows rows={[
                ['待处理商机', workspace.opportunities.filter((item) => !['WON', 'LOST'].includes(item.stage || '')).length],
                ['待收回款', workspace.receivables.filter((item) => (item.outstandingAmount || 0) > 0).length],
                ['待续约', workspace.renewals.filter((item) => !['WON', 'LOST', 'CLOSED'].includes(item.status || '')).length],
                ['未关闭工单', workspace.tickets.filter((item) => !['RESOLVED', 'CLOSED'].includes(item.status || '')).length],
              ]} />
            </WorkspacePanel>
            <WorkspacePanel title="联动汇总" description="CRM 与 OA 的闭环规模。">
              <InfoRows rows={[
                ['合同 / 项目', `${workspace.linkSummary?.contractCount || 0} / ${workspace.linkSummary?.projectCount || 0}`],
                ['预算 / 发票', `${workspace.linkSummary?.budgetCount || 0} / ${workspace.linkSummary?.invoiceCount || 0}`],
                ['联动待办 / 风险', `${workspace.linkSummary?.openTodoCount || 0} / ${workspace.linkSummary?.openRiskCount || 0}`],
              ]} />
            </WorkspacePanel>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkspacePanel title="跨模块待办" description="从客户360直接进入对应 OA / CRM 处理页。">
              <div className="admin-dialog-stack">
                {workspace.crossModuleTodos.length ? workspace.crossModuleTodos.map((item) => (
                  <ActionListButton
                    key={item.id}
                    title={item.title || '-'}
                    meta={item.sourceLabel || item.module || '-'}
                    onClick={() => navigate(item.path || '/')}
                  />
                )) : <EmptyPanel>暂无跨模块待办</EmptyPanel>}
              </div>
            </WorkspacePanel>
            <WorkspacePanel title="跨模块风险" description="预算阈值、发票异常和高风险链路汇总。">
              <div className="admin-dialog-stack">
                {workspace.crossModuleRisks.length ? workspace.crossModuleRisks.map((item) => (
                  <ActionListButton
                    key={item.id}
                    title={item.title || '-'}
                    meta={item.level || '-'}
                    onClick={() => navigate(item.path || '/')}
                  />
                )) : <EmptyPanel>暂无跨模块风险</EmptyPanel>}
              </div>
            </WorkspacePanel>
          </div>
        </TabsContent>

        <TabsContent value="contact" className="admin-source-content-grid admin-crm-workspace-tab">
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkspacePanel title="联系人" description="客户主联系人与协同联系人。">
              {workspace.contacts.length ? (
                <InnerTableSurface>
                  <table className="unity-data-table admin-source-table admin-crm-table min-w-[520px]">
                    <thead>
                      <tr>
                        <th>联系人</th>
                        <th>职位</th>
                        <th>联系方式</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.contacts.map((item) => (
                        <tr key={item.contactId}>
                          <td><strong>{item.contactName}</strong></td>
                          <td>{item.position || '-'}</td>
                          <td>{item.mobile || item.phone || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </InnerTableSurface>
              ) : <EmptyPanel>暂无联系人</EmptyPanel>}
            </WorkspacePanel>
            <WorkspacePanel title="跟进记录" description="最近跟进与后续安排。">
              {workspace.followUps.length ? (
                <InnerTableSurface>
                  <table className="unity-data-table admin-source-table admin-crm-table min-w-[680px]">
                    <thead>
                      <tr>
                        <th>内容</th>
                        <th>跟进时间</th>
                        <th>下次跟进</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.followUps.map((item) => (
                        <tr key={item.followUpId}>
                          <td><strong>{item.content}</strong></td>
                          <td>{formatDateTimeDisplay(item.followUpTime)}</td>
                          <td>{formatDateTimeDisplay(item.nextFollowUpTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </InnerTableSurface>
              ) : <EmptyPanel>暂无跟进记录</EmptyPanel>}
            </WorkspacePanel>
          </div>
        </TabsContent>

        <TabsContent value="opportunity" className="admin-source-content-grid admin-crm-workspace-tab">
          <WorkspacePanel title="商机推进" description="客户当前商机与推进阶段。">
            {workspace.opportunities.length ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th>商机</th>
                      <th>阶段</th>
                      <th>预计签约</th>
                      <th>金额</th>
                      <th>赢率</th>
                      <th>负责人</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.opportunities.map((item) => (
                      <tr key={item.opportunityId}>
                        <td><strong>{item.opportunityName}</strong></td>
                        <td>{renderStatus(item.stage)}</td>
                        <td>{item.expectedSignDate || '-'}</td>
                        <td>{item.expectedAmount || 0}</td>
                        <td>{item.winRate || 0}%</td>
                        <td>{item.ownerName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : <EmptyPanel>暂无商机</EmptyPanel>}
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="quote" className="admin-source-content-grid admin-crm-workspace-tab">
          <WorkspacePanel title="报价与合同" description="报价审批、合同联动与跳转。">
            {workspace.quotes.length ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[820px]">
                  <thead>
                    <tr>
                      <th>报价</th>
                      <th>状态</th>
                      <th>合同编号</th>
                      <th>金额</th>
                      <th>负责人</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.quotes.map((item) => (
                      <tr key={item.quoteId}>
                        <td><strong>{item.quoteName}</strong></td>
                        <td>{renderStatus(item.status)}</td>
                        <td>{item.contractNo || '-'}</td>
                        <td>{item.totalAmount || 0}</td>
                        <td>{item.ownerName || '-'}</td>
                        <td>
                          <div className="admin-users-row-actions">
                            {item.contractId ? <button type="button" title="打开 OA 合同" onClick={() => navigate('/office/contracts', { state: { focusContractId: item.contractId } })}><FileText size={15} /></button> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : <EmptyPanel>暂无报价</EmptyPanel>}
            <div className="admin-crm-workspace-draft mt-4">
              <div className="admin-crm-workspace-draft-head">新建 OA 合同草稿</div>
              <div className="admin-crm-workspace-draft-body">
                <Input value={contractDraftName} onChange={(event) => setContractDraftName(event.target.value)} placeholder="合同名称，例如：景曜科技续约合同" />
                <Button onClick={() => void createContractDraft()}>生成合同草稿</Button>
              </div>
            </div>
            <InnerTableSurface className="mt-4">
              {workspace.contracts.length ? (
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[780px]">
                  <thead>
                    <tr>
                      <th>合同</th>
                      <th>状态</th>
                      <th>发票状态</th>
                      <th>合同编号</th>
                      <th>金额</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.contracts.map((item) => (
                      <tr key={item.contractId}>
                        <td><strong>{item.contractName}</strong></td>
                        <td>{renderStatus(item.status)}</td>
                        <td>{renderInvoiceStatus(item.invoiceStatus)}</td>
                        <td>{item.contractNo || '-'}</td>
                        <td>{item.amount || 0}</td>
                        <td>
                          <div className="admin-users-row-actions">
                            <button type="button" title="打开 OA 合同" onClick={() => navigate('/office/contracts', { state: { focusContractId: item.contractId } })}><FileText size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyPanel>暂无关联合同</EmptyPanel>}
            </InnerTableSurface>
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="cashflow" className="admin-source-content-grid admin-crm-workspace-tab">
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkspacePanel title="回款计划" description="回款状态与开票联动。">
              {workspace.receivables.length ? (
                <InnerTableSurface>
                  <table className="unity-data-table admin-source-table admin-crm-table min-w-[780px]">
                    <thead>
                      <tr>
                        <th>回款</th>
                        <th>状态</th>
                        <th>计划金额</th>
                        <th>未收金额</th>
                        <th>发票状态</th>
                        <th>到期</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.receivables.map((item) => (
                        <tr key={item.receivableId}>
                          <td><strong>{item.receivableName}</strong></td>
                          <td>{renderStatus(item.status)}</td>
                          <td>{item.plannedAmount || 0}</td>
                          <td>{item.outstandingAmount || 0}</td>
                          <td>{renderInvoiceStatus(item.invoiceStatus)}</td>
                          <td>{item.dueDate || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </InnerTableSurface>
              ) : <EmptyPanel>暂无回款计划</EmptyPanel>}
            </WorkspacePanel>
            <WorkspacePanel title="发票口径" description="发票通过 OA 发票模块维护，并实时回写 CRM 回款状态。">
              <InfoRows rows={[
                ['已绑定回款条数', workspace.receivables.filter((item) => item.invoiceStatus && item.invoiceStatus !== 'NONE').length],
                ['已全额核销', workspace.receivables.filter((item) => item.invoiceStatus === 'WRITEOFF_FULL').length],
                ['部分核销', workspace.receivables.filter((item) => item.invoiceStatus === 'WRITEOFF_PARTIAL').length],
              ]} />
              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => navigate('/office/invoice')}>打开 OA 发票管理</Button>
              </div>
            </WorkspacePanel>
          </div>
          <WorkspacePanel title="新建销项发票草稿" description="在客户360内直接发起 OA 发票录入。">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input value={invoiceDraftCode} onChange={(event) => setInvoiceDraftCode(event.target.value)} placeholder="发票代码，例如：044002600111" />
              <Input value={invoiceDraftNo} onChange={(event) => setInvoiceDraftNo(event.target.value)} placeholder="发票号码，例如：87654321" />
              <Button onClick={() => void createInvoiceDraft()}>生成发票草稿</Button>
            </div>
          </WorkspacePanel>
          <WorkspacePanel title="绑定回款发票" description="客户360内直接把销项发票绑定到回款计划。">
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
          </WorkspacePanel>
          <WorkspacePanel title="OA 发票摘要" description="发票异常和核销状态汇总。">
            {workspace.invoices.length ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th>发票号码</th>
                      <th>状态</th>
                      <th>方向</th>
                      <th>发票代码</th>
                      <th>金额</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.invoices.map((item) => (
                      <tr key={item.invoiceId}>
                        <td><strong>{item.invoiceNo || '-'}</strong></td>
                        <td>{renderInvoiceStatus(item.status)}</td>
                        <td>{item.invoiceDirection === 'OUTPUT' ? '销项' : '进项'}</td>
                        <td>{item.invoiceCode || '-'}</td>
                        <td>{item.grossAmount || 0}</td>
                        <td>
                          <div className="admin-users-row-actions">
                            <button type="button" title="打开 OA 发票" onClick={() => navigate('/office/invoice')}><ReceiptText size={15} /></button>
                            {item.status !== 'VOID' ? <button type="button" title="作废" onClick={() => void voidInvoice(item.invoiceId)}><RefreshCcw size={15} /></button> : null}
                            {item.externalLinkUrl ? <button type="button" title="外链" onClick={() => window.open(item.externalLinkUrl, '_blank')}><FileText size={15} /></button> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : <EmptyPanel>暂无 OA 发票摘要</EmptyPanel>}
          </WorkspacePanel>
          <WorkspacePanel title="回款确认" description="客户360内直接确认 CRM 回款。">
            {workspace.receivables.length ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th>回款</th>
                      <th>状态</th>
                      <th>未收金额</th>
                      <th>到期</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.receivables.map((item) => (
                      <tr key={`confirm-${item.receivableId}`}>
                        <td><strong>{item.receivableName}</strong></td>
                        <td>{renderStatus(item.status)}</td>
                        <td>{item.outstandingAmount || 0}</td>
                        <td>{item.dueDate || '-'}</td>
                        <td>
                          <Button size="sm" variant="outline" onClick={() => void confirmReceivable(item.receivableId)} disabled={item.status === 'RECEIVED'}>
                            {item.status === 'RECEIVED' ? '已确认' : '确认回款'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : <EmptyPanel>暂无回款计划</EmptyPanel>}
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="renewal" className="admin-source-content-grid admin-crm-workspace-tab">
          <WorkspacePanel title="续约窗口" description="续约状态、风险与当前窗口。">
            {workspace.renewals.length ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th>续约</th>
                      <th>状态</th>
                      <th>风险</th>
                      <th>续约金额</th>
                      <th>当前到期</th>
                      <th>风险原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.renewals.map((item) => (
                      <tr key={item.renewalId}>
                        <td><strong>{item.renewalName}</strong></td>
                        <td>{renderStatus(item.status)}</td>
                        <td>{renderHealthLabel(item.riskLevel)}</td>
                        <td>{item.renewalAmount || 0}</td>
                        <td>{item.currentExpireDate || '-'}</td>
                        <td>{item.riskReason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : <EmptyPanel>暂无续约</EmptyPanel>}
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="ticket" className="admin-source-content-grid admin-crm-workspace-tab">
          <WorkspacePanel title="服务工单" description="客户问题处理闭环。">
            {workspace.tickets.length ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[900px]">
                  <thead>
                    <tr>
                      <th>工单</th>
                      <th>严重度</th>
                      <th>状态</th>
                      <th>负责人</th>
                      <th>截止时间</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.tickets.map((item) => (
                      <tr key={item.ticketId}>
                        <td><strong>{item.ticketTitle}</strong></td>
                        <td>{renderSeverity(item.severity)}</td>
                        <td>{renderStatus(item.status)}</td>
                        <td>{item.ownerName || '-'}</td>
                        <td>{formatDateTimeDisplay(item.dueTime)}</td>
                        <td>{item.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : <EmptyPanel>暂无工单</EmptyPanel>}
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="project" className="admin-source-content-grid admin-crm-workspace-tab">
          <WorkspacePanel title="关联项目" description="CRM 生成或关联的 OA 项目工作区。">
            <div className="admin-crm-workspace-draft mb-4">
              <div className="admin-crm-workspace-draft-head">新建 OA 项目草稿</div>
              <div className="admin-crm-workspace-draft-body">
                <Input value={projectDraftName} onChange={(event) => setProjectDraftName(event.target.value)} placeholder="项目名称，例如：景曜科技交付项目" />
                <Button onClick={() => void createProjectDraft()}>生成项目草稿</Button>
              </div>
            </div>
            {workspace.projects.length ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[900px]">
                  <thead>
                    <tr>
                      <th>项目</th>
                      <th>状态</th>
                      <th>风险</th>
                      <th>预算 / 成本</th>
                      <th>来源</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.projects.map((item) => renderProjectCard(item, (projectId) => navigate('/office/project', { state: { focusProjectId: projectId } }), renderSeverity))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : <EmptyPanel>暂无关联项目</EmptyPanel>}
          </WorkspacePanel>
          <WorkspacePanel title="OA 预算摘要" description="关联项目预算执行与阈值概览。">
            <div className="admin-crm-workspace-draft mb-4">
              <div className="admin-crm-workspace-draft-head">新建 OA 预算草稿</div>
              <div className="admin-crm-workspace-draft-body">
                <Input value={budgetDraftName} onChange={(event) => setBudgetDraftName(event.target.value)} placeholder="预算名称，例如：景曜科技项目预算" />
                <Button onClick={() => void createBudgetDraft()}>生成预算草稿</Button>
              </div>
            </div>
            {workspace.budgets.length ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table admin-crm-table min-w-[820px]">
                  <thead>
                    <tr>
                      <th>预算</th>
                      <th>状态</th>
                      <th>阈值</th>
                      <th>预算总额</th>
                      <th>已占用 / 已执行</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.budgets.map((item) => (
                      <tr key={item.budgetId}>
                        <td><strong>{item.budgetName}</strong></td>
                        <td>{renderStatus(item.status)}</td>
                        <td>{getThresholdStatusLabel(item.thresholdStatus || 'NORMAL')}</td>
                        <td>{item.totalAmount || 0}</td>
                        <td>{item.reservedAmount || 0} / {item.actualAmount || 0}</td>
                        <td>
                          <div className="admin-users-row-actions">
                            <button type="button" title="打开 OA 预算" onClick={() => navigate('/office/budget')}><ReceiptText size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : <EmptyPanel>暂无 OA 预算摘要</EmptyPanel>}
          </WorkspacePanel>
        </TabsContent>
      </>
  );

  return (
    <section className="admin-source-page">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as WorkspaceTab)}
        className="admin-crm-workspace-tabs flex min-h-0 flex-1 flex-col"
      >
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageContent}
        />
      </Tabs>
    </section>
  );
}
