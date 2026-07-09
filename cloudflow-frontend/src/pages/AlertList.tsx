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
import { Button, Input, Label, SegmentedControl, SegmentedControlItem, Textarea } from '@/components/common';
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
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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
      className: 'is-critical',
    };
  }

  if (level === 'WARNING') {
    return {
      label: '警告',
      className: 'is-warning',
    };
  }

  return {
    label: '提醒',
    className: 'is-remind',
  };
};

const getAnomalySeverityMeta = (severity: AnomalyAlert['severity']) => {
  const severityMap: Record<string, { label: string; className: string }> = {
    CRITICAL: {
      label: '严重',
      className: 'is-critical',
    },
    HIGH: {
      label: '高',
      className: 'is-high',
    },
    MEDIUM: {
      label: '中',
      className: 'is-warning',
    },
    LOW: {
      label: '低',
      className: 'is-remind',
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
  <div className="admin-workflow-alert-state">
    <div className="admin-source-stat-icon">
      {loading ? <RefreshCw size={16} className="animate-spin" /> : icon}
    </div>
    <strong>{title}</strong>
  </div>
);

const AlertDetailField: React.FC<{ label: string; value: React.ReactNode; wide?: boolean }> = ({ label, value, wide }) => (
  <div className={wide ? 'admin-detail-wide' : undefined}>
    <span>{label}</span>
    <strong>{value || '-'}</strong>
  </div>
);

const AlertPanel: React.FC<{ title: string; children: React.ReactNode; tone?: 'default' | 'success' | 'code' }> = ({
  title,
  children,
  tone = 'default',
}) => {
  return (
    <section className={cn('admin-workflow-alert-dialog-panel', `is-${tone}`)}>
      <div className="admin-source-section-head">
        <div>
          <strong>{title}</strong>
        </div>
      </div>
      <div className="admin-workflow-alert-dialog-panel-body">{children}</div>
    </section>
  );
};

const AnomalyDetailDialog: React.FC<{
  alert: AnomalyAlert | null;
  onClose: () => void;
}> = ({ alert, onClose }) => (
  <BaseDialog
    open={Boolean(alert)}
    title="异常详情"
    onClose={onClose}
    maxWidthClassName="max-w-3xl"
    bodyClassName="admin-dialog-stack"
    footer={
      <Button variant="outline" onClick={onClose}>
        关闭
      </Button>
    }
  >
    {alert ? (
      <>
        <div className="admin-finance-detail-list admin-contract-detail-grid">
          <AlertDetailField label="流程" value={alert.processName} />
          <AlertDetailField label="流程 Key" value={alert.processDefKey} />
          <AlertDetailField label="异常类型" value={getAnomalyTypeLabel(alert.anomalyType)} />
          <AlertDetailField label="告警时间" value={formatDateTime(alert.alertTime || alert.createTime)} />
        </div>

        <AlertPanel title="异常说明">
          <div className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">
            {getAnomalyMessage(alert)}
          </div>
        </AlertPanel>

        {alert.resolveNote ? (
          <AlertPanel title="解决说明" tone="success">
            <div className="mt-1 text-sm leading-6 text-emerald-700 dark:text-emerald-200">
              {alert.resolveNote}
            </div>
          </AlertPanel>
        ) : null}

        {getAnomalyDetails(alert) ? (
          <AlertPanel title="错误详情" tone="code">
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-200">
              {getAnomalyDetails(alert)}
            </pre>
          </AlertPanel>
        ) : null}
      </>
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
    bodyClassName="admin-dialog-stack"
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
      <>
        <AlertPanel title="告警对象">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{alert.processName}</div>
          <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {getAnomalyMessage(alert)}
          </div>
        </AlertPanel>
        <div className="admin-dialog-field">
          <Label>处理说明</Label>
          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="填写排查结果和处理结论"
          />
        </div>
      </>
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
    bodyClassName="admin-dialog-stack"
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
      <>
        <AlertPanel title="超时对象">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {alert.targetName}
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {alert.alertType === 'TASK' ? '任务超时' : '流程超时'} / 目标 ID: {alert.targetId}
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            升级给: {alert.escalatedToName || '-'} / 升级时间: {formatDateTime(alert.escalatedTime)}
          </div>
        </AlertPanel>
        <div className="admin-dialog-field">
          <Label>处置说明</Label>
          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="填写排查结果、沟通情况和处理结论"
          />
        </div>
      </>
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
  const alertStats = [
    { label: '超时告警', value: String(timeoutAlerts.length), detail: `${timeoutAlerts.filter((item) => item.resolved !== 'Y').length} 条未处理`, icon: Clock3, tone: 'amber' },
    { label: '升级待办', value: String(escalationTasks.length), detail: `${escalationTasks.filter((item) => item.resolved !== 'Y').length} 条待处置`, icon: ShieldAlert, tone: 'violet' },
    { label: '异常告警', value: String(anomalyAlerts.length), detail: `${anomalyAlerts.filter((item) => item.resolved !== 'Y').length} 条未解决`, icon: AlertTriangle, tone: 'red' },
    { label: '当前视图', value: String(currentList.length), detail: `${currentFocusCount} 条重点`, icon: CheckCircle2, tone: 'blue' },
  ];

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

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ALERT CENTER</p>
          <h2>告警管理</h2>
          <span>集中处理流程超时、升级待办和异常告警</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void loadAlerts()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'mr-2 animate-spin' : 'mr-2'} />
            刷新
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid admin-workflow-alert-stat-grid">
        {alertStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon"><Icon size={18} /></div>
              <div><p>{stat.label}</p><strong>{stat.value}</strong><span>{stat.detail}</span></div>
            </article>
          );
        })}
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar admin-workflow-alert-toolbar">
      <div className="admin-workflow-alert-tabs">
        <SegmentedControl className="admin-workflow-alert-segment">
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
      </div>

      <div className="admin-workflow-alert-filter-grid">
        <label>
          <span className="input-label">搜索告警</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={
                activeTab === 'timeout' || activeTab === 'escalation'
                  ? '目标名称、处理人或目标 ID'
                  : '流程、类型或异常内容'
              }
              className="h-[42px] pl-9"
            />
          </div>
        </label>

        {activeTab === 'timeout' || activeTab === 'escalation' ? (
          <label>
            <span className="input-label">告警级别</span>
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
          </label>
        ) : (
          <label>
            <span className="input-label">严重程度</span>
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
          </label>
        )}

        <label>
          <span className="input-label">处理状态</span>
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
        </label>

        <div className="admin-users-toolbar-actions">
          {hasActiveFilters ? (
            <span className="admin-users-filter-count">已筛选</span>
          ) : null}
          <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={!hasActiveFilters}>
            <RefreshCw size={14} />
            重置
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadAlerts()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
            刷新
          </Button>
        </div>
      </div>
    </section>
  );

  const pageContent = (
    <InnerTableSurface
      className="admin-workflow-alert-panel flex min-h-0 flex-1 flex-col"
      wrapperClassName="admin-workflow-alert-panel-shell"
    >
      <div className="admin-workflow-alert-table-head">
        <div>
          <strong>{currentTabLabel}</strong>
          <span>共 {currentList.length} 条 · 未处理 {currentPendingCount} 条 · 重点 {currentFocusCount} 条</span>
        </div>
        <span className="admin-workflow-alert-page-count">{hasActiveFilters ? '筛选中' : '全部告警'}</span>
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
              <AlertTriangle size={18} />
            ) : activeTab === 'escalation' ? (
              <CheckCircle2 size={18} />
            ) : (
              <Clock3 size={18} />
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
        <div className="admin-workflow-alert-list">
          {activeTab === 'timeout' || activeTab === 'escalation'
            ? (activeTab === 'escalation' ? filteredEscalationTasks : filteredTimeoutAlerts).map((alert) => {
                const levelMeta = getTimeoutLevelMeta(alert.timeoutLevel);

                return (
                  <article key={alert.id} className="admin-workflow-alert-row">
                    <div className="admin-workflow-alert-primary">
                      <div className="admin-workflow-alert-badge-row">
                        <span className={cn('admin-workflow-alert-badge', levelMeta.className)}>
                          {levelMeta.label}
                        </span>
                        <span className="admin-workflow-alert-muted">
                          {alert.alertType === 'TASK' ? '任务超时' : '流程超时'}
                        </span>
                        {alert.resolved === 'Y' ? <span className="admin-workflow-alert-status is-done">已处理</span> : null}
                      </div>
                      <strong>{alert.targetName}</strong>
                      <span>已超时 {getTimeoutHours(alert.timeoutDuration)} 小时</span>
                    </div>

                    <div className="admin-workflow-alert-meta">
                      <span>目标 ID</span><strong>{alert.targetId}</strong>
                      <span>处理人</span><strong>{alert.assigneeName || '未分配'}</strong>
                      <span>通知</span><strong>{alert.notificationSent === 'Y' ? '已通知' : '未通知'}</strong>
                      <span>升级给</span><strong>{alert.escalatedToName || '-'}</strong>
                    </div>

                    <div className="admin-workflow-alert-meta">
                      <span>告警时间</span><strong>{formatDateTime(alert.alertTime || alert.createTime)}</strong>
                      <span>处理状态</span><strong>{alert.resolved === 'Y' ? '已处理' : '待处理'}</strong>
                      <span>升级状态</span><strong>{alert.escalated === 'Y' ? '已升级' : '未升级'}</strong>
                      <span>升级时间</span><strong>{formatDateTime(alert.escalatedTime)}</strong>
                    </div>

                    <div className="admin-workflow-alert-actions">
                      {activeTab === 'timeout' && alert.notificationSent !== 'Y' ? (
                        <Button size="sm" onClick={() => void handleTimeoutAction(alert.id, 'notify')}>
                          <Send size={15} />
                          发送通知
                        </Button>
                      ) : null}
                      {activeTab === 'timeout' && alert.timeoutLevel === 'CRITICAL' && alert.escalated !== 'Y' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleTimeoutAction(alert.id, 'escalate')}
                        >
                          <ShieldAlert size={15} />
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
                          <CheckCircle2 size={15} />
                          处置
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            : filteredAnomalyAlerts.map((alert) => {
                const severityMeta = getAnomalySeverityMeta(alert.severity);
                const anomalyDetails = getAnomalyDetails(alert);

                return (
                  <article key={alert.id} className="admin-workflow-alert-row">
                    <div className="admin-workflow-alert-primary">
                      <div className="admin-workflow-alert-badge-row">
                        <span className={cn('admin-workflow-alert-badge', severityMeta.className)}>
                          {severityMeta.label}
                        </span>
                        <span className="admin-workflow-alert-muted">
                          {getAnomalyTypeLabel(alert.anomalyType)}
                        </span>
                        {alert.resolved === 'Y' ? <span className="admin-workflow-alert-status is-done">已解决</span> : null}
                      </div>
                      <strong>{alert.processName}</strong>
                      <span>{getAnomalyMessage(alert)}</span>
                      {alert.resolveNote ? <em>解决说明: {alert.resolveNote}</em> : null}
                    </div>

                    <div className="admin-workflow-alert-meta">
                      <span>流程 Key</span><strong>{alert.processDefKey}</strong>
                      <span>异常类型</span><strong>{getAnomalyTypeLabel(alert.anomalyType)}</strong>
                      <span>通知</span><strong>{alert.notificationSent === 'Y' ? '已通知' : '未通知'}</strong>
                    </div>

                    <div className="admin-workflow-alert-meta">
                      <span>告警时间</span><strong>{formatDateTime(alert.alertTime || alert.createTime)}</strong>
                      <span>处理状态</span><strong>{alert.resolved === 'Y' ? '已解决' : '待处理'}</strong>
                      <span>解决时间</span><strong>{formatDateTime(alert.resolveTime)}</strong>
                    </div>

                    <div className="admin-workflow-alert-actions">
                      {anomalyDetails ? (
                        <Button size="sm" variant="outline" onClick={() => setDetailAlert(alert)}>
                          <Eye size={15} />
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
                  </article>
                );
              })}
        </div>
      )}
    </InnerTableSurface>
  );

  return (
    <>
      <section className="admin-source-page admin-workflow-alert-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageContent}
        />
      </section>

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
