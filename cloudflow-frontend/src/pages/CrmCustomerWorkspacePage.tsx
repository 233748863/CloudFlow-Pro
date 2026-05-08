import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CircleDollarSign, FileText, FolderKanban, Handshake, LifeBuoy, ReceiptText, RefreshCcw, Target, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import { WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';
import { crmApi, CrmCustomerWorkspace, CrmRemoteProjectLink } from '@/services/api/crm';
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

  const metrics = useMemo(() => {
    if (!workspace) return [];
    return [
      { label: '健康度', value: renderHealthLabel(workspace.customer.healthLevel), hint: workspace.customer.healthReason || '状态正常' },
      { label: '商机', value: workspace.opportunities.length, hint: '客户当前商机数' },
      { label: '回款计划', value: workspace.receivables.length, hint: '含开票联动' },
      { label: '服务工单', value: workspace.tickets.length, hint: '含高严重度工单' },
    ];
  }, [workspace]);

  if (!workspace) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/office/crm?tab=customer')}>
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
            <Button variant="outline" size="sm" onClick={() => navigate('/office/crm?tab=customer')}>
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workspace.projects.length ? workspace.projects.map((item) => renderProjectCard(item, (projectId) => navigate('/office/project', { state: { focusProjectId: projectId } }))) : <div className="text-sm text-slate-500">暂无关联项目</div>}
            </div>
          </WorkspaceSectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
