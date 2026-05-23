import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Clock3, FileWarning, LifeBuoy, ListTodo, ReceiptText, ShieldAlert, Target, TrendingUp, TriangleAlert, Users2, Wallet } from 'lucide-react';
import { useCrmManagement } from './store';
import type { DashboardTone } from './types';
import { tabLabelMap } from './constants';
import { formatDashboardCurrency, formatDashboardDate, formatDashboardNumber, renderHealthLabel, renderSeverity, renderStatus } from './helpers';
import { DashboardActionCard, DashboardFeedItem, DashboardFocusItem, DashboardMetricTile, DashboardSection, DashboardStageCard } from './dashboard-cards';

export const DashboardTab: React.FC = () => {
  const navigate = useNavigate();
  const {
    tab,
    customers,
    opportunities,
    quotes,
    receivables,
    renewals,
    tickets,
    dashboard,
    board,
    navigateToTab,
    openCustomerWorkspace,
  } = useCrmManagement();

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
