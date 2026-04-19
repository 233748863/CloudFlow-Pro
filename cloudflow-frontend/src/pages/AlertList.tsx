import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Filter,
  Search,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button, Textarea, Input, Card } from '@/components/ui';
import {
  getTimeoutAlerts,
  getAnomalyAlerts,
  handleTimeoutAlert,
  resolveAnomalyAlert,
  TimeoutAlert,
  AnomalyAlert,
} from '@/services/api/monitor';
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
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace/WorkspacePanels';

type AlertType = 'timeout' | 'anomaly';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const getAnomalyMessage = (alert: AnomalyAlert) =>
  alert.errorMessage || alert.description || '暂无异常说明';

const getAnomalyDetails = (alert: AnomalyAlert) =>
  alert.stackTrace || alert.errorDetails;

const getLevelBadge = (alert: TimeoutAlert | AnomalyAlert, type: AlertType) => {
  if (type === 'timeout') {
    const timeoutAlert = alert as TimeoutAlert;
    if (timeoutAlert.timeoutLevel === 'CRITICAL') {
      return <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-100">严重</span>;
    }
    if (timeoutAlert.timeoutLevel === 'WARNING') {
      return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100">警告</span>;
    }
    return <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-100">提醒</span>;
  }

  const anomalyAlert = alert as AnomalyAlert;
  const severityMap: Record<string, { className: string; label: string }> = {
    CRITICAL: { className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100', label: '严重' },
    HIGH: { className: 'bg-orange-50 text-orange-600 ring-1 ring-orange-100', label: '高' },
    MEDIUM: { className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', label: '中' },
    LOW: { className: 'border border-cyan-200 bg-cyan-50 text-cyan-700', label: '低' },
  };
  const severity = severityMap[anomalyAlert.severity] || severityMap.MEDIUM;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${severity.className}`}>{severity.label}</span>;
};

const ResolveModal: React.FC<{
  alert: TimeoutAlert | AnomalyAlert | null;
  note: string;
  setNote: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ alert, note, setNote, onClose, onSubmit }) => {
  if (!alert) return null;

  return (
    <WorkspaceDialogShell
      title="解决异常告警"
      description="记录本次排查结果和处理方案，便于后续审计与交接。"
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">
            {'processName' in alert ? alert.processName : alert.targetName}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            {'anomalyType' in alert ? getAnomalyMessage(alert as AnomalyAlert) : `已超时 ${Math.max(1, Math.ceil((alert as TimeoutAlert).timeoutDuration / (1000 * 60 * 60)))} 小时`}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
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
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onSubmit} disabled={!note.trim()}>确认解决</Button>
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
  const [selectedAlert, setSelectedAlert] = useState<TimeoutAlert | AnomalyAlert | null>(null);
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
      if (activeTab === 'timeout') {
        const params: any = { pageNum: 1, pageSize: 100 };
        if (filters.alertLevel) params.alertLevel = filters.alertLevel;
        if (filters.resolved) params.resolved = filters.resolved === 'true';

        const data = await getTimeoutAlerts(params);
        setTimeoutAlerts(data.rows || data.records || []);
      } else {
        const params: any = { pageNum: 1, pageSize: 100 };
        if (filters.severity) params.severity = filters.severity;
        if (filters.resolved) params.resolved = filters.resolved === 'true';

        const data = await getAnomalyAlerts(params);
        setAnomalyAlerts(data.rows || data.records || []);
      }
    } catch (error) {
      console.error('加载告警数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [activeTab, filters]);

  const filteredTimeoutAlerts = useMemo(() => {
    const keywordValue = keyword.trim().toLowerCase();
    if (!keywordValue) return timeoutAlerts;
    return timeoutAlerts.filter((alert) =>
      [alert.targetName, alert.assigneeName, alert.targetId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keywordValue)),
    );
  }, [keyword, timeoutAlerts]);

  const filteredAnomalyAlerts = useMemo(() => {
    const keywordValue = keyword.trim().toLowerCase();
    if (!keywordValue) return anomalyAlerts;
    return anomalyAlerts.filter((alert) =>
      [alert.processName, alert.processDefKey, alert.anomalyType, getAnomalyMessage(alert)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keywordValue)),
    );
  }, [keyword, anomalyAlerts]);

  const handleTimeout = async (alertId: number, action: string) => {
    try {
      await handleTimeoutAlert(alertId, action);
      await loadAlerts();
    } catch (error) {
      console.error('处理告警失败:', error);
    }
  };

  const handleResolve = async () => {
    if (!selectedAlert || !resolveNote.trim()) return;

    try {
      await resolveAnomalyAlert(selectedAlert.id, resolveNote);
      setShowResolveModal(false);
      setResolveNote('');
      setSelectedAlert(null);
      await loadAlerts();
    } catch (error) {
      console.error('解决告警失败:', error);
    }
  };

  const unresolvedTimeoutCount = timeoutAlerts.filter((alert) => alert.resolved !== 'Y').length;
  const unresolvedAnomalyCount = anomalyAlerts.filter((alert) => alert.resolved !== 'Y').length;
  const criticalTimeoutCount = timeoutAlerts.filter((alert) => alert.timeoutLevel === 'CRITICAL').length;
  const criticalAnomalyCount = anomalyAlerts.filter((alert) => ['CRITICAL', 'HIGH'].includes(alert.severity)).length;
  const currentList = activeTab === 'timeout' ? filteredTimeoutAlerts : filteredAnomalyAlerts;
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '当前页签', value: activeTab === 'timeout' ? '超时告警' : '异常告警' },
    { label: '筛选结果', value: `${currentList.length} 条` },
    { label: '未处理超时', value: `${unresolvedTimeoutCount} 条` },
    { label: '未处理异常', value: `${unresolvedAnomalyCount} 条` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700">
                <Bell size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{timeLabel}</span>
            </div>
          )}
          title="告警管理"
          description="把超时告警和异常告警统一到同一工作台页面结构，提升监控页面与业务页面的一致性。"
          actions={(
            <Button variant="outline" onClick={() => void loadAlerts()}>
              <Search size={15} />
              刷新告警
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="超时告警"
              value={timeoutAlerts.length}
              hint={`未处理 ${unresolvedTimeoutCount} 条`}
              aside={<Clock size={18} className="text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="异常告警"
              value={anomalyAlerts.length}
              hint={`未处理 ${unresolvedAnomalyCount} 条`}
              aside={<AlertTriangle size={18} className="text-rose-500" />}
            />
            <WorkspaceMetricCard
              label="严重超时"
              value={criticalTimeoutCount}
              hint="超时级别为 CRITICAL"
              aside={<Bell size={18} className="text-cyan-600" />}
            />
            <WorkspaceMetricCard
              label="高危异常"
              value={criticalAnomalyCount}
              hint="异常级别为 HIGH / CRITICAL"
              aside={<CheckCircle size={18} className="text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="告警工作台"
              total={currentList.length}
              hasActiveFilters={Boolean(keyword || filters.alertLevel || filters.severity || filters.resolved)}
              overviewItems={overviewItems}
              quickFilters={[
                { label: '超时告警', value: 'timeout' },
                { label: '异常告警', value: 'anomaly' },
              ]}
              activeQuickFilter={activeTab}
              onQuickFilterChange={(value) => setActiveTab(value as AlertType)}
              quickFilterAside={(
                <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 border border-slate-200 shadow-sm">
                  当前页签 {activeTab === 'timeout' ? '更适合处理流程超时' : '更适合排查流程异常'}
                </span>
              )}
              filterBar={(
                <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder={activeTab === 'timeout' ? '按目标名称、处理人或目标 ID 搜索' : '按流程、类型或异常内容搜索'}
                      className="pl-10"
                    />
                  </div>

                  {activeTab === 'timeout' ? (
                    <Select value={filters.alertLevel || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, alertLevel: value === 'all' ? '' : value }))}>
                      <SelectTrigger><SelectValue placeholder="级别" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">所有级别</SelectItem>
                        <SelectItem value="REMIND">提醒</SelectItem>
                        <SelectItem value="WARNING">警告</SelectItem>
                        <SelectItem value="CRITICAL">严重</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={filters.severity || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, severity: value === 'all' ? '' : value }))}>
                      <SelectTrigger><SelectValue placeholder="严重程度" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">所有严重程度</SelectItem>
                        <SelectItem value="LOW">低</SelectItem>
                        <SelectItem value="MEDIUM">中</SelectItem>
                        <SelectItem value="HIGH">高</SelectItem>
                        <SelectItem value="CRITICAL">严重</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  <Select value={filters.resolved || 'all'} onValueChange={(value) => setFilters((prev) => ({ ...prev, resolved: value === 'all' ? '' : value }))}>
                    <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
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

            <WorkspaceResultCard
              total={currentList.length}
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
                      icon={<Clock className="h-7 w-7" />}
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
                      ? filteredTimeoutAlerts.map((alert) => (
                          <div key={alert.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {getLevelBadge(alert, 'timeout')}
                                  <span className="text-sm text-slate-500">
                                    {alert.alertType === 'TASK' ? '任务超时' : '流程超时'}
                                  </span>
                                  {alert.resolved === 'Y' ? (
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                                      已处理
                                    </span>
                                  ) : null}
                                </div>
                                <h3 className="mt-3 text-lg font-semibold text-slate-900">{alert.targetName}</h3>
                                <p className="mt-2 text-sm text-slate-600">
                                  已超时 <span className="font-semibold text-rose-600">{Math.max(1, Math.ceil(alert.timeoutDuration / (1000 * 60 * 60)))}</span> 小时
                                </p>
                                {alert.assigneeName ? <p className="mt-1 text-sm text-slate-500">处理人：{alert.assigneeName}</p> : null}
                                <p className="mt-2 text-xs text-slate-400">
                                  告警时间：{new Date(alert.alertTime || alert.createTime).toLocaleString('zh-CN')}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {alert.notificationSent !== 'Y' ? (
                                  <Button size="sm" onClick={() => void handleTimeout(alert.id, 'notify')}>
                                    发送通知
                                  </Button>
                                ) : null}
                                {alert.escalated !== 'Y' && alert.timeoutLevel === 'CRITICAL' ? (
                                  <Button size="sm" variant="secondary" onClick={() => void handleTimeout(alert.id, 'escalate')}>
                                    升级处理
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))
                      : filteredAnomalyAlerts.map((alert) => {
                          const anomalyDetails = getAnomalyDetails(alert);
                          return (
                            <div key={alert.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {getLevelBadge(alert, 'anomaly')}
                                    <span className="text-sm text-slate-500">{alert.anomalyType}</span>
                                    {alert.resolved === 'Y' ? (
                                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                                        已解决
                                      </span>
                                    ) : null}
                                  </div>
                                  <h3 className="mt-3 text-lg font-semibold text-slate-900">{alert.processName}</h3>
                                  <p className="mt-2 text-sm text-slate-600">{getAnomalyMessage(alert)}</p>
                                  {anomalyDetails ? (
                                    <details className="mt-3 text-xs text-slate-500">
                                      <summary className="cursor-pointer hover:text-slate-700">错误详情</summary>
                                      <pre className="mt-2 overflow-x-auto rounded-2xl bg-slate-50 p-3 whitespace-pre-wrap break-all">{anomalyDetails}</pre>
                                    </details>
                                  ) : null}
                                  {alert.resolveNote ? <p className="mt-3 text-sm text-emerald-600">解决说明：{alert.resolveNote}</p> : null}
                                  <p className="mt-2 text-xs text-slate-400">
                                    告警时间：{new Date(alert.alertTime || alert.createTime).toLocaleString('zh-CN')}
                                  </p>
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
          </div>
        </Card>

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
