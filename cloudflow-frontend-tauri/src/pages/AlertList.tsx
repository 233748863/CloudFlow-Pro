import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { getAnomalyTypeLabel } from '@/utils/enumLabels';
import { BaseDialog } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { Button, Input, SegmentedControl, SegmentedControlItem, Textarea } from '@/components/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common/select';
import {
  AnomalyAlert,
  TimeoutAlert,
  getAnomalyAlerts,
  getTimeoutEscalationTasks,
  getTimeoutAlerts,
  handleTimeoutAlert,
  resolveAnomalyAlert,
  resolveTimeoutAlert,
} from '@/services/api/monitor';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/cn';

type AlertType = 'timeout' | 'escalation' | 'anomaly';
type AlertFilters = {
  alertLevel: '' | 'REMIND' | 'WARNING' | 'CRITICAL';
  severity: '' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  resolved: '' | 'true' | 'false';
};

const getAnomalyMessage = (alert: AnomalyAlert) =>
  alert.errorMessage || alert.description || '暂无异常说明';

const getAnomalyDetails = (alert: AnomalyAlert) => alert.stackTrace || alert.errorDetails;

const getTimeoutHours = (duration: number) => Math.max(1, Math.ceil(duration / (1000 * 60 * 60)));

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN') : '-';

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

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, icon, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    {loading ? (
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const AnomalyDetailDialog: React.FC<{
  alert: AnomalyAlert | null;
  onClose: () => void;
}> = ({ alert, onClose }) => (
  <BaseDialog
    open={Boolean(alert)}
    title="异常详情"
    onClose={onClose}
    maxWidthClassName="max-w-3xl"
    footer={
      <Button variant="outline" onClick={onClose}>
        关闭
      </Button>
    }
  >
    {alert ? (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs text-slate-400 dark:text-slate-500">流程</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {alert.processName}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs text-slate-400 dark:text-slate-500">流程 Key</div>
            <div className="mt-1 break-all text-sm font-medium text-slate-900 dark:text-slate-100">
              {alert.processDefKey}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs text-slate-400 dark:text-slate-500">异常类型</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {getAnomalyTypeLabel(alert.anomalyType)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs text-slate-400 dark:text-slate-500">告警时间</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              {formatDateTime(alert.alertTime || alert.createTime)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-xs text-slate-400 dark:text-slate-500">异常说明</div>
          <div className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">
            {getAnomalyMessage(alert)}
          </div>
        </div>

        {alert.resolveNote ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/70 dark:bg-emerald-950/30">
            <div className="text-xs text-emerald-500 dark:text-emerald-400">解决说明</div>
            <div className="mt-1 text-sm leading-6 text-emerald-700 dark:text-emerald-200">
              {alert.resolveNote}
            </div>
          </div>
        ) : null}

        {getAnomalyDetails(alert) ? (
          <div className="rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 dark:border-slate-800">
            <div className="text-xs text-slate-400">错误详情</div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-200">
              {getAnomalyDetails(alert)}
            </pre>
          </div>
        ) : null}
      </div>
    ) : null}
  </BaseDialog>
);

const ResolveModal: React.FC<{
  alert: AnomalyAlert | null;
  note: string;
  setNote: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ alert, note, setNote, onClose, onSubmit }) => (
  <BaseDialog
    open={Boolean(alert)}
    title="标记解决"
    onClose={onClose}
    maxWidthClassName="max-w-2xl"
    footer={
      <>
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button onClick={onSubmit} disabled={!note.trim()}>
          确认
        </Button>
      </>
    }
  >
    {alert ? (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{alert.processName}</div>
          <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {getAnomalyMessage(alert)}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            处理说明
          </label>
          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="填写排查结果和处理结论"
          />
        </div>
      </div>
    ) : null}
  </BaseDialog>
);

const TimeoutResolveModal: React.FC<{
  alert: TimeoutAlert | null;
  note: string;
  setNote: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ alert, note, setNote, onClose, onSubmit }) => (
  <BaseDialog
    open={Boolean(alert)}
    title="处置超时告警"
    onClose={onClose}
    maxWidthClassName="max-w-2xl"
    footer={
      <>
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button onClick={onSubmit} disabled={!note.trim()}>
          确认处置
        </Button>
      </>
    }
  >
    {alert ? (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {alert.targetName}
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {alert.alertType === 'TASK' ? '任务超时' : '流程超时'} / 目标 ID: {alert.targetId}
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            升级给: {alert.escalatedToName || '-'} / 升级时间: {formatDateTime(alert.escalatedTime)}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            处置说明
          </label>
          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="填写排查结果、沟通情况和处理结论"
          />
        </div>
      </div>
    ) : null}
  </BaseDialog>
);

const AlertList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AlertType>('timeout');
  const [timeoutAlerts, setTimeoutAlerts] = useState<TimeoutAlert[]>([]);
  const [escalationTasks, setEscalationTasks] = useState<TimeoutAlert[]>([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [detailAlert, setDetailAlert] = useState<AnomalyAlert | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AnomalyAlert | null>(null);
  const [selectedTimeoutAlert, setSelectedTimeoutAlert] = useState<TimeoutAlert | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [timeoutResolveNote, setTimeoutResolveNote] = useState('');
  const [filters, setFilters] = useState<AlertFilters>({
    alertLevel: '',
    severity: '',
    resolved: '',
  });
  const { user } = useAuth();
  const isMonitorAdmin = ['ADMIN', 'MANAGER', 'admin', 'manager'].includes(String(user?.role || ''));

  useEffect(() => {
    if (!isMonitorAdmin) {
      setActiveTab('escalation');
    }
  }, [isMonitorAdmin]);

  const loadAlerts = async () => {
    try {
      setLoading(true);

      const timeoutParams: NonNullable<Parameters<typeof getTimeoutAlerts>[0]> = {
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

      const monitorRequests = isMonitorAdmin ? Promise.all([
        getTimeoutAlerts(timeoutParams),
        getTimeoutEscalationTasks({ pageNum: 1, pageSize: 100 }),
        getAnomalyAlerts(anomalyParams),
      ]) : null;

      if (monitorRequests) {
        const [timeoutData, escalationData, anomalyData] = await monitorRequests;
        setTimeoutAlerts(timeoutData.rows || timeoutData.records || []);
        setEscalationTasks(escalationData.rows || escalationData.records || []);
        setAnomalyAlerts(anomalyData.rows || anomalyData.records || []);
        return;
      }

      const escalationRequest = getTimeoutEscalationTasks({ pageNum: 1, pageSize: 100 });
      const escalationData = await escalationRequest;
      setTimeoutAlerts([]);
      setEscalationTasks(escalationData.rows || escalationData.records || []);
      setAnomalyAlerts([]);
    } catch (error) {
      console.error('加载告警数据失败:', error);
      toast.error(getErrorMessage(error, '加载告警数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [filters, isMonitorAdmin]);

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

  const filteredEscalationTasks = useMemo(() => {
    const keywordValue = keyword.trim().toLowerCase();
    return escalationTasks.filter((alert) => {
      if (filters.alertLevel && alert.timeoutLevel !== filters.alertLevel) {
        return false;
      }

      if (filters.resolved && (alert.resolved === 'Y') !== (filters.resolved === 'true')) {
        return false;
      }

      if (!keywordValue) {
        return true;
      }

      return [alert.targetName, alert.assigneeName, alert.escalatedToName, alert.targetId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keywordValue));
    });
  }, [keyword, escalationTasks, filters.alertLevel, filters.resolved]);

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

  const currentList =
    activeTab === 'timeout'
      ? filteredTimeoutAlerts
      : activeTab === 'escalation'
        ? filteredEscalationTasks
        : filteredAnomalyAlerts;
  const currentPendingCount = currentList.filter((alert) => alert.resolved !== 'Y').length;
  const currentFocusCount =
    activeTab === 'timeout' || activeTab === 'escalation'
      ? (activeTab === 'escalation' ? filteredEscalationTasks : filteredTimeoutAlerts).filter(
          (alert) => alert.timeoutLevel === 'CRITICAL',
        ).length
      : filteredAnomalyAlerts.filter((alert) => ['CRITICAL', 'HIGH'].includes(alert.severity)).length;

  const hasActiveFilters = Boolean(keyword || filters.alertLevel || filters.severity || filters.resolved);
  const currentTabLabel =
    activeTab === 'timeout' ? '超时告警' : activeTab === 'escalation' ? '我的升级待办' : '异常告警';

  const handleResetFilters = () => {
    setKeyword('');
    setFilters({ alertLevel: '', severity: '', resolved: '' });
  };

  const handleTimeoutAction = async (alertId: number, action: string) => {
    try {
      const result = await handleTimeoutAlert(alertId, action);
      toast.success(action === 'notify' ? '已发送通知' : result.message || '已升级处理');
      await loadAlerts();
    } catch (error) {
      console.error('处理告警失败:', error);
      toast.error(getErrorMessage(error, '处理告警失败'));
    }
  };

  const handleResolveTimeout = async () => {
    if (!selectedTimeoutAlert || !timeoutResolveNote.trim()) {
      return;
    }

    try {
      await resolveTimeoutAlert(selectedTimeoutAlert.id, timeoutResolveNote.trim());
      toast.success('超时告警已处置');
      setTimeoutResolveNote('');
      setSelectedTimeoutAlert(null);
      await loadAlerts();
    } catch (error) {
      console.error('处置超时告警失败:', error);
      toast.error(getErrorMessage(error, '处置超时告警失败'));
    }
  };

  const handleResolve = async () => {
    if (!selectedAlert || !resolveNote.trim()) {
      return;
    }

    try {
      await resolveAnomalyAlert(selectedAlert.id, resolveNote.trim());
      toast.success('异常告警已标记解决');
      setResolveNote('');
      setSelectedAlert(null);
      await loadAlerts();
    } catch (error) {
      console.error('解决告警失败:', error);
      toast.error(getErrorMessage(error, '解决告警失败'));
    }
  };

  return (
    <>
      <TablePageLayout
        className="gap-4"
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <SegmentedControl className="min-h-9">
                <SegmentedControlItem
                  size="sm"
                  disabled={!isMonitorAdmin}
                  active={activeTab === 'timeout'}
                  count={timeoutAlerts.length}
                  onClick={() => {
                    if (isMonitorAdmin) {
                      setActiveTab('timeout');
                    }
                  }}
                >
                  超时告警
                </SegmentedControlItem>
                <SegmentedControlItem
                  size="sm"
                  active={activeTab === 'escalation'}
                  count={escalationTasks.length}
                  onClick={() => setActiveTab('escalation')}
                >
                  我的升级待办
                </SegmentedControlItem>
                <SegmentedControlItem
                  size="sm"
                  disabled={!isMonitorAdmin}
                  active={activeTab === 'anomaly'}
                  count={anomalyAlerts.length}
                  onClick={() => {
                    if (isMonitorAdmin) {
                      setActiveTab('anomaly');
                    }
                  }}
                >
                  异常告警
                </SegmentedControlItem>
              </SegmentedControl>

              <div className="relative min-w-[220px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  size={16}
                />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={
                    activeTab === 'timeout' || activeTab === 'escalation'
                      ? '按目标名称、处理人或目标 ID 搜索'
                      : '按流程、类型或异常内容搜索'
                  }
                  className="pl-10"
                />
              </div>

              {activeTab === 'timeout' || activeTab === 'escalation' ? (
                <div className="w-full sm:w-36">
                  <Select
                    value={filters.alertLevel || 'all'}
                    onValueChange={(value) =>
                      setFilters((prev) => ({
                        ...prev,
                        alertLevel: value === 'all' ? '' : value as AlertFilters['alertLevel'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="告警级别" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">所有级别</SelectItem>
                      <SelectItem value="REMIND">提醒</SelectItem>
                      <SelectItem value="WARNING">警告</SelectItem>
                      <SelectItem value="CRITICAL">严重</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="w-full sm:w-36">
                  <Select
                    value={filters.severity || 'all'}
                    onValueChange={(value) =>
                      setFilters((prev) => ({
                        ...prev,
                        severity: value === 'all' ? '' : value as AlertFilters['severity'],
                      }))
                    }
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
                </div>
              )}

              <div className="w-full sm:w-32">
                <Select
                  value={filters.resolved || 'all'}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      resolved: value === 'all' ? '' : value as AlertFilters['resolved'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="处理状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有状态</SelectItem>
                    <SelectItem value="false">未处理</SelectItem>
                    <SelectItem value="true">已处理</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                  清空
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => void loadAlerts()} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                刷新
              </Button>
            </div>
          </div>
        }
        table={(<TableSurfaceCard fill><div className="divide-y divide-slate-200 dark:divide-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-900 dark:text-slate-100">{currentTabLabel}</span>
                <span className="mx-2 text-slate-300 dark:text-slate-600">/</span>
                <span>共 {currentList.length} 条</span>
                <span className="mx-2 text-slate-300 dark:text-slate-600">/</span>
                <span>未处理 {currentPendingCount} 条</span>
                <span className="mx-2 text-slate-300 dark:text-slate-600">/</span>
                <span>重点 {currentFocusCount} 条</span>
              </div>
            </div>

            {loading ? (
              <InlineState
                title={
                  activeTab === 'anomaly'
                    ? '正在加载异常告警'
                    : activeTab === 'escalation'
                      ? '正在加载升级待办'
                      : '正在加载超时告警'
                }
                loading
              />
            ) : currentList.length === 0 ? (
              <InlineState
                icon={
                  activeTab === 'anomaly' ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : activeTab === 'escalation' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Clock3 className="h-5 w-5" />
                  )
                }
                title={
                  activeTab === 'anomaly'
                    ? '暂无异常告警'
                    : activeTab === 'escalation'
                      ? '暂无升级待办'
                      : '暂无超时告警'
                }
              />
            ) : (
              <div>

                {activeTab === 'timeout' || activeTab === 'escalation'
                  ? (activeTab === 'escalation' ? filteredEscalationTasks : filteredTimeoutAlerts).map((alert) => {
                      const levelMeta = getTimeoutLevelMeta(alert.timeoutLevel);

                      return (
                        <div
                          key={alert.id}
                          className="grid gap-4 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,0.8fr)_auto] lg:items-center"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                  levelMeta.className,
                                )}
                              >
                                {levelMeta.label}
                              </span>
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                {alert.alertType === 'TASK' ? '任务超时' : '流程超时'}
                              </span>
                              {alert.resolved === 'Y' ? (
                                <span className="text-xs text-emerald-600 dark:text-emerald-300">
                                  已处理
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {alert.targetName}
                            </div>
                            <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                              已超时{' '}
                              <span className="font-medium text-rose-600 dark:text-rose-300">
                                {getTimeoutHours(alert.timeoutDuration)}
                              </span>{' '}
                              小时
                            </div>
                          </div>

                          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                            <div>目标 ID: {alert.targetId}</div>
                            <div>处理人: {alert.assigneeName || '未分配'}</div>
                            <div>通知状态: {alert.notificationSent === 'Y' ? '已通知' : '未通知'}</div>
                            <div>升级给: {alert.escalatedToName || '-'}</div>
                          </div>

                          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                            <div>告警时间: {formatDateTime(alert.alertTime || alert.createTime)}</div>
                            <div>处理状态: {alert.resolved === 'Y' ? '已处理' : '待处理'}</div>
                            <div>升级状态: {alert.escalated === 'Y' ? '已升级' : '未升级'}</div>
                            <div>升级时间: {formatDateTime(alert.escalatedTime)}</div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            {activeTab === 'timeout' && alert.notificationSent !== 'Y' ? (
                              <Button size="sm" onClick={() => void handleTimeoutAction(alert.id, 'notify')}>
                                <Send className="h-4 w-4" />
                                发送通知
                              </Button>
                            ) : null}
                            {activeTab === 'timeout' && alert.timeoutLevel === 'CRITICAL' && alert.escalated !== 'Y' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleTimeoutAction(alert.id, 'escalate')}
                              >
                                <ShieldAlert className="h-4 w-4" />
                                升级处理
                              </Button>
                            ) : null}
                            {activeTab === 'escalation' && alert.resolved !== 'Y' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setTimeoutResolveNote('');
                                  setSelectedTimeoutAlert(alert);
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                处置
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  : filteredAnomalyAlerts.map((alert) => {
                      const severityMeta = getAnomalySeverityMeta(alert.severity);
                      const anomalyDetails = getAnomalyDetails(alert);

                      return (
                        <div
                          key={alert.id}
                          className="grid gap-4 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,0.8fr)_auto] lg:items-start"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                  severityMeta.className,
                                )}
                              >
                                {severityMeta.label}
                              </span>
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                {getAnomalyTypeLabel(alert.anomalyType)}
                              </span>
                              {alert.resolved === 'Y' ? (
                                <span className="text-xs text-emerald-600 dark:text-emerald-300">
                                  已解决
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {alert.processName}
                            </div>
                            <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                              {getAnomalyMessage(alert)}
                            </div>
                            {alert.resolveNote ? (
                              <div className="mt-2 text-xs leading-5 text-emerald-600 dark:text-emerald-300">
                                解决说明: {alert.resolveNote}
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                            <div>流程 Key: {alert.processDefKey}</div>
                            <div>异常类型: {getAnomalyTypeLabel(alert.anomalyType)}</div>
                            <div>通知状态: {alert.notificationSent === 'Y' ? '已通知' : '未通知'}</div>
                          </div>

                          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                            <div>告警时间: {formatDateTime(alert.alertTime || alert.createTime)}</div>
                            <div>处理状态: {alert.resolved === 'Y' ? '已解决' : '待处理'}</div>
                            <div>解决时间: {formatDateTime(alert.resolveTime)}</div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            {anomalyDetails ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDetailAlert(alert)}
                              >
                                <Eye className="h-4 w-4" />
                                查看详情
                              </Button>
                            ) : null}
                            {alert.resolved !== 'Y' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setResolveNote('');
                                  setSelectedAlert(alert);
                                }}
                              >
                                标记解决
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
              </div>
            )}
          </div></TableSurfaceCard>)}
      />

      <AnomalyDetailDialog
        alert={detailAlert}
        onClose={() => {
          setDetailAlert(null);
        }}
      />

      <ResolveModal
        alert={selectedAlert}
        note={resolveNote}
        setNote={setResolveNote}
        onClose={() => {
          setResolveNote('');
          setSelectedAlert(null);
        }}
        onSubmit={() => void handleResolve()}
      />

      <TimeoutResolveModal
        alert={selectedTimeoutAlert}
        note={timeoutResolveNote}
        setNote={setTimeoutResolveNote}
        onClose={() => {
          setTimeoutResolveNote('');
          setSelectedTimeoutAlert(null);
        }}
        onSubmit={() => void handleResolveTimeout()}
      />
    </>
  );
};

export default AlertList;
