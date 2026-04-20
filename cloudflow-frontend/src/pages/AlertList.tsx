import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Filter,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import {
  getAnomalyAlerts,
  getTimeoutAlerts,
  handleTimeoutAlert,
  resolveAnomalyAlert,
  TimeoutAlert,
  AnomalyAlert,
} from '@/services/api/monitor';
import { toast } from 'sonner';
import { cn } from '@/utils/cn';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspaceInlineState,
  WorkspacePageContent,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';

type AlertType = 'timeout' | 'anomaly';

const cardClassName =
  'rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-sm shadow-slate-200/60 transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none';
const infoBlockClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const getAnomalyMessage = (alert: AnomalyAlert) =>
  alert.errorMessage || alert.description || '暂无异常说明';

const getAnomalyDetails = (alert: AnomalyAlert) =>
  alert.stackTrace || alert.errorDetails;

const getTimeoutHours = (duration: number) =>
  Math.max(1, Math.ceil(duration / (1000 * 60 * 60)));

const getTimeoutLevelMeta = (level: TimeoutAlert['timeoutLevel']) => {
  if (level === 'CRITICAL') {
    return {
      label: '严重',
      className:
        'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
    };
  }
  if (level === 'WARNING') {
    return {
      label: '警告',
      className:
        'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
    };
  }
  return {
    label: '提醒',
    className:
      'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200',
  };
};

const getAnomalySeverityMeta = (severity: AnomalyAlert['severity']) => {
  const severityMap: Record<string, { label: string; className: string }> = {
    CRITICAL: {
      label: '严重',
      className:
        'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
    },
    HIGH: {
      label: '高',
      className:
        'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-200',
    },
    MEDIUM: {
      label: '中',
      className:
        'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
    },
    LOW: {
      label: '低',
      className:
        'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200',
    },
  };

  return severityMap[severity] || severityMap.MEDIUM;
};

const ResolveModal: React.FC<{
  alert: AnomalyAlert | null;
  note: string;
  setNote: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ alert, note, setNote, onClose, onSubmit }) => {
  if (!alert) {
    return null;
  }

  return (
    <WorkspaceDialogShell
      title="解决异常告警"
      description="记录本次排查结果和处理方案，便于后续审计与交接。"
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <div className={infoBlockClassName}>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.processName}</div>
          <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{getAnomalyMessage(alert)}</div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            解决说明 <span className="text-red-500">*</span>
          </label>
          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="请输入解决方案和处理说明..."
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={!note.trim()}>
            确认解决
          </Button>
        </div>
      </div>
    </WorkspaceDialogShell>
  );
};

const AlertList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AlertType>('timeout');
  const [timeoutAlerts, setTimeoutAlerts] = useState<TimeoutAlert[]>([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<AnomalyAlert | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState({
    alertLevel: '',
    severity: '',
    resolved: '',
  });

  const loadAlerts = async () => {
    try {
      setLoading(true);

      const timeoutParams: { pageNum: number; pageSize: number; alertLevel?: string; resolved?: boolean } = {
        pageNum: 1,
        pageSize: 100,
      };
      const anomalyParams: { pageNum: number; pageSize: number; severity?: string; resolved?: boolean } = {
        pageNum: 1,
        pageSize: 100,
      };

      if (filters.alertLevel) {
        timeoutParams.alertLevel = filters.alertLevel;
      }
      if (filters.severity) {
        anomalyParams.severity = filters.severity;
      }
      if (filters.resolved) {
        timeoutParams.resolved = filters.resolved === 'true';
        anomalyParams.resolved = filters.resolved === 'true';
      }

      const [timeoutData, anomalyData] = await Promise.all([
        getTimeoutAlerts(timeoutParams),
        getAnomalyAlerts(anomalyParams),
      ]);

      setTimeoutAlerts(timeoutData.rows || timeoutData.records || []);
      setAnomalyAlerts(anomalyData.rows || anomalyData.records || []);
    } catch (error) {
      console.error('加载告警数据失败:', error);
      toast.error('加载告警数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [filters]);

  const filteredTimeoutAlerts = useMemo(() => {
    const keywordValue = keyword.trim().toLowerCase();
    if (!keywordValue) {
      return timeoutAlerts;
    }

    return timeoutAlerts.filter((alert) =>
      [alert.targetName, alert.assigneeName, alert.targetId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keywordValue)),
    );
  }, [keyword, timeoutAlerts]);

  const filteredAnomalyAlerts = useMemo(() => {
    const keywordValue = keyword.trim().toLowerCase();
    if (!keywordValue) {
      return anomalyAlerts;
    }

    return anomalyAlerts.filter((alert) =>
      [alert.processName, alert.processDefKey, alert.anomalyType, getAnomalyMessage(alert)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keywordValue)),
    );
  }, [keyword, anomalyAlerts]);

  const handleTimeoutAction = async (alertId: number, action: string) => {
    try {
      await handleTimeoutAlert(alertId, action);
      toast.success(action === 'notify' ? '已发送通知' : '已升级处理');
      await loadAlerts();
    } catch (error) {
      console.error('处理告警失败:', error);
      toast.error('处理告警失败');
    }
  };

  const handleResolve = async () => {
    if (!selectedAlert || !resolveNote.trim()) {
      return;
    }

    try {
      await resolveAnomalyAlert(selectedAlert.id, resolveNote.trim());
      toast.success('异常告警已标记为解决');
      setShowResolveModal(false);
      setResolveNote('');
      setSelectedAlert(null);
      await loadAlerts();
    } catch (error) {
      console.error('解决告警失败:', error);
      toast.error('解决告警失败');
    }
  };

  const unresolvedTimeoutCount = timeoutAlerts.filter((alert) => alert.resolved !== 'Y').length;
  const unresolvedAnomalyCount = anomalyAlerts.filter((alert) => alert.resolved !== 'Y').length;
  const criticalTimeoutCount = timeoutAlerts.filter((alert) => alert.timeoutLevel === 'CRITICAL').length;
  const criticalAnomalyCount = anomalyAlerts.filter((alert) => ['CRITICAL', 'HIGH'].includes(alert.severity)).length;
  const currentList = activeTab === 'timeout' ? filteredTimeoutAlerts : filteredAnomalyAlerts;
  const currentUnresolvedCount = currentList.filter((alert) => alert.resolved !== 'Y').length;
  const focusAlerts = currentList
    .filter((alert) => alert.resolved !== 'Y')
    .slice(0, 4);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '当前页签', value: activeTab === 'timeout' ? '超时告警' : '异常告警' },
    { label: '筛选结果', value: `${currentList.length} 条` },
    { label: '未处理告警', value: `${currentUnresolvedCount} 条` },
    { label: '状态筛选', value: filters.resolved ? (filters.resolved === 'true' ? '已处理' : '未处理') : '全部状态' },
  ];

  const hasActiveFilters = Boolean(keyword || filters.alertLevel || filters.severity || filters.resolved);

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent className="space-y-4">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                <Bell size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/90">
                {timeLabel}
              </span>
            </div>
          )}
          title="告警管理"
          description="把超时告警和异常告警统一到同一套监控工作台里，页签切换、筛选、处置和回看都保持一致。"
          actions={(
            <Button variant="outline" onClick={() => void loadAlerts()}>
              <RefreshCw size={15} />
              刷新告警
            </Button>
          )}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="超时告警"
              value={timeoutAlerts.length}
              hint={`未处理 ${unresolvedTimeoutCount} 条`}
              aside={<Clock3 size={18} className="text-amber-500 dark:text-amber-200" />}
            />
            <WorkspaceMetricCard
              label="异常告警"
              value={anomalyAlerts.length}
              hint={`未处理 ${unresolvedAnomalyCount} 条`}
              aside={<AlertTriangle size={18} className="text-rose-500 dark:text-rose-300" />}
            />
            <WorkspaceMetricCard
              label="严重超时"
              value={criticalTimeoutCount}
              hint="级别为 CRITICAL"
              aside={<Bell size={18} className="text-cyan-600 dark:text-cyan-200" />}
            />
            <WorkspaceMetricCard
              label="高危异常"
              value={criticalAnomalyCount}
              hint="级别为 HIGH / CRITICAL"
              aside={<ShieldAlert size={18} className="text-emerald-500 dark:text-emerald-200" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          eyebrow="Alert Filters"
          title="告警工作台"
          total={currentList.length}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          quickFilters={[
            { label: '超时告警', value: 'timeout' },
            { label: '异常告警', value: 'anomaly' },
          ]}
          activeQuickFilter={activeTab}
          onQuickFilterChange={(value) => setActiveTab(value as AlertType)}
          quickFilterAside={(
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              当前页签 {activeTab === 'timeout' ? '更适合处理流程超时' : '更适合排查流程异常'}
            </span>
          )}
          filterBar={(
            <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={activeTab === 'timeout' ? '按目标名称、处理人或目标 ID 搜索' : '按流程、类型或异常内容搜索'}
                  className="pl-10"
                />
              </div>

              {activeTab === 'timeout' ? (
                <Select
                  value={filters.alertLevel || 'all'}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, alertLevel: value === 'all' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="级别" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有级别</SelectItem>
                    <SelectItem value="REMIND">提醒</SelectItem>
                    <SelectItem value="WARNING">警告</SelectItem>
                    <SelectItem value="CRITICAL">严重</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={filters.severity || 'all'}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, severity: value === 'all' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="严重程度" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有严重程度</SelectItem>
                    <SelectItem value="LOW">低</SelectItem>
                    <SelectItem value="MEDIUM">中</SelectItem>
                    <SelectItem value="HIGH">高</SelectItem>
                    <SelectItem value="CRITICAL">严重</SelectItem>
                  </SelectContent>
                </Select>
              )}

              <Select
                value={filters.resolved || 'all'}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, resolved: value === 'all' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有状态</SelectItem>
                  <SelectItem value="false">未处理</SelectItem>
                  <SelectItem value="true">已处理</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setKeyword('');
                  setFilters({ alertLevel: '', severity: '', resolved: '' });
                }}
              >
                <Filter size={15} />
                清空筛选
              </Button>
            </div>
          )}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
          <WorkspaceSectionCard
            title="处理焦点"
            description="优先查看当前页签下尚未处理的高关注告警，减少在长列表中来回查找。"
            eyebrow="Priority Queue"
            bodyClassName="space-y-3"
          >
            {focusAlerts.length > 0 ? (
              focusAlerts.map((alert) => {
                const meta = activeTab === 'timeout'
                  ? getTimeoutLevelMeta((alert as TimeoutAlert).timeoutLevel)
                  : getAnomalySeverityMeta((alert as AnomalyAlert).severity);

                return (
                  <div key={`${activeTab}-${alert.id}`} className={cardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {'processName' in alert ? alert.processName : alert.targetName}
                        </div>
                        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                          {'processDefKey' in alert ? alert.processDefKey : alert.targetId}
                        </div>
                      </div>
                      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', meta.className)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {'anomalyType' in alert
                        ? getAnomalyMessage(alert as AnomalyAlert)
                        : `已超时 ${getTimeoutHours((alert as TimeoutAlert).timeoutDuration)} 小时`}
                    </div>
                  </div>
                );
              })
            ) : (
              <WorkspaceEmptyPanel
                variant="glass"
                icon={activeTab === 'timeout' ? <Clock3 className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
                title={activeTab === 'timeout' ? '暂无待处理超时告警' : '暂无待处理异常告警'}
                description="当前页签下已经没有需要优先处理的未解决告警。"
              />
            )}
          </WorkspaceSectionCard>

          <WorkspaceSectionCard
            title="处置建议"
            description="告警页要和监控、性能页保持同一套处理语义，避免再出现分散的处置入口。"
            eyebrow="Response Guide"
            bodyClassName="space-y-3"
          >
            {[
              activeTab === 'timeout'
                ? '超时告警优先判断是否需要发送通知或升级处理，避免用户在流程中长时间无反馈。'
                : '异常告警优先补充解决说明，确保后续复盘时能追溯到具体处理动作。',
              '筛选区、告警卡、状态标签和处理按钮已统一到同一套工作台视觉比例。',
              'Light / Dark 一起验收，监控批次后续只需要继续收口更复杂的交互联动。',
            ].map((item) => (
              <div key={item} className={cardClassName}>
                <div className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-300" />
                  <span>{item}</span>
                </div>
              </div>
            ))}
          </WorkspaceSectionCard>
        </div>

        <WorkspaceResultCard
          total={currentList.length}
          title={activeTab === 'timeout' ? '超时告警结果' : '异常告警结果'}
          description="告警列表、处理动作和异常解决入口全部收口到统一工作台页面结构。"
        >
          <div className="p-4">
            {loading ? (
              <WorkspaceInlineState
                type="loading"
                title={activeTab === 'timeout' ? '正在加载超时告警...' : '正在加载异常告警...'}
                className="py-12"
              />
            ) : currentList.length === 0 ? (
              activeTab === 'timeout' ? (
                <WorkspaceEmptyPanel
                  variant="glass"
                  icon={<Clock3 className="h-7 w-7" />}
                  title="暂无超时告警"
                  description="当前筛选条件下还没有需要处理的超时告警。"
                />
              ) : (
                <WorkspaceEmptyPanel
                  variant="glass"
                  icon={<AlertTriangle className="h-7 w-7" />}
                  title="暂无异常告警"
                  description="当前筛选条件下还没有需要关注的异常告警。"
                />
              )
            ) : (
              <div className="space-y-4">
                {activeTab === 'timeout'
                  ? filteredTimeoutAlerts.map((alert) => {
                      const levelMeta = getTimeoutLevelMeta(alert.timeoutLevel);

                      return (
                        <div key={alert.id} className={cardClassName}>
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1 space-y-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', levelMeta.className)}>
                                  {levelMeta.label}
                                </span>
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                  {alert.alertType === 'TASK' ? '任务超时' : '流程超时'}
                                </span>
                                {alert.resolved === 'Y' ? (
                                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">
                                    已处理
                                  </span>
                                ) : null}
                              </div>

                              <div>
                                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{alert.targetName}</div>
                                <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                  已超时 <span className="font-semibold text-rose-600 dark:text-rose-300">{getTimeoutHours(alert.timeoutDuration)}</span> 小时
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-3">
                                <div className={infoBlockClassName}>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">目标 ID</div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.targetId}</div>
                                </div>
                                <div className={infoBlockClassName}>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">处理人</div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {alert.assigneeName || '未分配'}
                                  </div>
                                </div>
                                <div className={infoBlockClassName}>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">告警时间</div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {new Date(alert.alertTime || alert.createTime).toLocaleString('zh-CN')}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap gap-2">
                              {alert.notificationSent !== 'Y' ? (
                                <Button size="sm" onClick={() => void handleTimeoutAction(alert.id, 'notify')}>
                                  <Send size={14} />
                                  发送通知
                                </Button>
                              ) : null}
                              {alert.escalated !== 'Y' && alert.timeoutLevel === 'CRITICAL' ? (
                                <Button size="sm" variant="secondary" onClick={() => void handleTimeoutAction(alert.id, 'escalate')}>
                                  <ShieldAlert size={14} />
                                  升级处理
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  : filteredAnomalyAlerts.map((alert) => {
                      const severityMeta = getAnomalySeverityMeta(alert.severity);
                      const anomalyDetails = getAnomalyDetails(alert);

                      return (
                        <div key={alert.id} className={cardClassName}>
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1 space-y-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', severityMeta.className)}>
                                  {severityMeta.label}
                                </span>
                                <span className="text-sm text-slate-500 dark:text-slate-400">{alert.anomalyType}</span>
                                {alert.resolved === 'Y' ? (
                                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">
                                    已解决
                                  </span>
                                ) : null}
                              </div>

                              <div>
                                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{alert.processName}</div>
                                <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{getAnomalyMessage(alert)}</div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <div className={infoBlockClassName}>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">流程 Key</div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.processDefKey}</div>
                                </div>
                                <div className={infoBlockClassName}>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">告警时间</div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {new Date(alert.alertTime || alert.createTime).toLocaleString('zh-CN')}
                                  </div>
                                </div>
                                <div className={infoBlockClassName}>
                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">解决状态</div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {alert.resolved === 'Y' ? '已解决' : '待处理'}
                                  </div>
                                </div>
                              </div>

                              {anomalyDetails ? (
                                <details className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                                  <summary className="cursor-pointer font-medium text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white">
                                    错误详情
                                  </summary>
                                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-white/80 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-300">
                                    {anomalyDetails}
                                  </pre>
                                </details>
                              ) : null}

                              {alert.resolveNote ? (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                                  解决说明：{alert.resolveNote}
                                </div>
                              ) : null}
                            </div>

                            {alert.resolved !== 'Y' ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedAlert(alert);
                                  setShowResolveModal(true);
                                }}
                              >
                                标记已解决
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
              </div>
            )}
          </div>
        </WorkspaceResultCard>

        {showResolveModal ? (
          <ResolveModal
            alert={selectedAlert}
            note={resolveNote}
            setNote={setResolveNote}
            onClose={() => {
              setShowResolveModal(false);
              setResolveNote('');
              setSelectedAlert(null);
            }}
            onSubmit={() => void handleResolve()}
          />
        ) : null}
      </WorkspacePageContent>
    </div>
  );
};

export default AlertList;
