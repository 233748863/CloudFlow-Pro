import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Clock3, FileWarning, LifeBuoy, ListTodo, ReceiptText, ShieldAlert, Target, TrendingUp, TriangleAlert, Users2, Wallet } from 'lucide-react';
import { useCrmManagement } from './store';
import type { DashboardTone } from './types';
import { formatDashboardCurrency, formatDashboardDate, renderHealthLabel, renderSeverity, renderStatus } from './helpers';
import { DashboardActionCard, DashboardFeedItem, DashboardMetricTile, DashboardSection, DashboardStageCard } from './dashboard-cards';

export const DashboardTab: React.FC = () => {
  const navigate = useNavigate();
  const {
    tab,
    customers,
    opportunities,
    quotes,
    dashboard,
    board,
    navigateToTab,
    openCustomerWorkspace,
  } = useCrmManagement();

  if (!dashboard) return null;
  if (tab !== 'dashboard') return null;

  const totalReceivableCount = dashboard.agingBuckets.reduce((sum, item) => sum + Number(item.receivableCount || 0), 0);
  const riskAndTodoCount = dashboard.staleFollowCustomers.length
    + dashboard.stalledOpportunities.length
    + dashboard.crossModuleTodos.length
    + dashboard.crossModuleRisks.length
    + dashboard.budgetAlerts.length
    + dashboard.invoiceExceptions.length;
  const priorityQuote = dashboard.pendingQuotes[0];
  const staleCustomer = dashboard.staleFollowCustomers[0];
  const acceptedQuote = quotes.find((item) => item.status === 'ACCEPTED');
  const overdueReceivableCount = dashboard.agingBuckets
    .filter((item) => !item.bucketName?.includes('未逾期'))
    .reduce((sum, item) => sum + Number(item.receivableCount || 0), 0);
  const firstOverdueBucket = dashboard.agingBuckets.find((item) => !item.bucketName?.includes('未逾期') && Number(item.receivableCount || 0) > 0);

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
};
