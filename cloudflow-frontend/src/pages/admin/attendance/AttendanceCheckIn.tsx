import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { checkIn } from '@/services/api/admin';
import { EffectiveAttendanceRule, getEffectiveAttendanceRule } from '@/services/api/hr';
import { useAuth } from '@/context/AuthContext';
import { useHrSelfServiceEligibility } from '@/hooks/useHrSelfServiceEligibility';
import { useMount } from '@/hooks/useMount';
import './admin-attendance.css';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const buildTimeDate = (time: string, base: Date) => {
  const [hours = '00', minutes = '00'] = (time || '').split(':');
  const result = new Date(base);
  result.setHours(Number(hours), Number(minutes), 0, 0);
  return result;
};

const InlineState = ({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="admin-source-stat-icon mb-3">
      {icon || <Clock3 className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div> : null}
  </div>
);

const DetailItem = ({
  label,
  value,
  description,
  icon,
}: {
  label: string;
  value: string;
  description?: string;
  icon: React.ReactNode;
}) => (
  <div className="flex gap-3 px-4 py-3">
    <div className="admin-source-stat-icon flex-shrink-0 text-cf-subtle">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[11px] font-medium text-cf-faint">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-cf-title">{value}</div>
      {description ? (
        <div className="mt-0.5 truncate text-xs text-cf-subtle">{description}</div>
      ) : null}
    </div>
  </div>
);

const ActionButton = ({
  title,
  icon,
  onClick,
  disabled,
  variant = 'default',
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  variant?: 'default' | 'outline' | 'destructive';
}) => (
  <Button
    variant={variant}
    className="h-12 justify-start px-4 text-left"
    onClick={onClick}
    disabled={disabled}
  >
    <div className="flex items-center gap-3">
      <div className="admin-source-stat-icon text-current">
        {icon}
      </div>
      <div className="text-sm font-semibold">{title}</div>
    </div>
  </Button>
);

const AttendanceCheckIn: React.FC = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [rule, setRule] = useState<EffectiveAttendanceRule | null>(null);
  const [ruleLoading, setRuleLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [autoLocationRequested, setAutoLocationRequested] = useState(false);
  const {
    loading: eligibilityLoading,
    canStartSelfService,
    restrictionMessage,
  } = useHrSelfServiceEligibility();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useMount(() => {
    void getEffectiveAttendanceRule()
      .then((response) => {
        setRule(response || null);
      })
      .catch(() => {
        setRule(null);
      })
      .finally(() => {
        setRuleLoading(false);
      });
  });

  const getLocation = () => {
    if (eligibilityLoading) {
      return;
    }
    if (!canStartSelfService) {
      setLocationError(restrictionMessage || '当前账号暂不能继续发起 HR 自助流程');
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('您的浏览器不支持地理定位');
      return;
    }

    setLocationError(null);
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationError(null);
        setLoading(false);
      },
      (error) => {
        setLocationError(`获取位置失败: ${error.message}`);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
    );
  };

  useEffect(() => {
    if (autoLocationRequested || eligibilityLoading || !canStartSelfService) {
      return;
    }
    setAutoLocationRequested(true);
    getLocation();
  }, [autoLocationRequested, canStartSelfService, eligibilityLoading]);

  const selfServiceLocked = eligibilityLoading || !canStartSelfService;

  const ensureCanCheckIn = () => {
    if (eligibilityLoading) {
      setResult({ success: false, msg: '正在核对当前员工状态，请稍后再试' });
      return false;
    }
    if (!canStartSelfService) {
      setResult({ success: false, msg: restrictionMessage || '当前账号暂不能继续发起 HR 自助流程' });
      return false;
    }
    return true;
  };

  const handleCheckIn = async (type: '1' | '2') => {
    if (!ensureCanCheckIn()) {
      return;
    }
    if (!location) {
      setResult({ success: false, msg: '请先获取定位信息' });
      return;
    }

    setLoading(true);
    try {
      await checkIn({
        type,
        location: `${location.lat},${location.lng}`,
        address: 'Web端定位',
        deviceInfo: navigator.userAgent,
        wifiInfo: 'Web端无法获取Mac',
      });
      setResult({ success: true, msg: type === '1' ? '签到成功' : '签退成功' });
    } catch (error) {
      setResult({ success: false, msg: error instanceof Error ? error.message : '打卡失败，请重试' });
    } finally {
      setLoading(false);
    }
  };

  const dateLabel = formatDateCN(currentTime);
  const timeLabel = currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const secondLabel = currentTime.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const shiftLabel = `${rule?.checkInTime || '--:--'} - ${rule?.checkOutTime || '--:--'}`;
  const sourceLabel =
    rule?.sourceType === 'EMPLOYEE'
      ? `员工规则 ${rule.sourceTargetName || ''}`
      : rule?.sourceType === 'POST'
        ? `岗位规则 ${rule.sourceTargetName || ''}`
        : rule?.sourceType === 'DEPT'
          ? `部门规则 ${rule.sourceTargetName || ''}`
          : '默认规则';
  const dayTypeLabel =
    rule?.dayType === 'WORKDAY'
      ? '工作日'
      : rule?.dayType === 'HOLIDAY'
        ? '节假日'
        : rule?.dayType === 'REST'
          ? '休息日'
          : '未设置日历';
  const methodLabel = rule?.checkMethods?.join(' / ') || '--';

  const phaseInfo = useMemo(() => {
    if (ruleLoading) {
      return {
        title: '规则加载中',
        hint: '正在同步今日考勤规则',
      };
    }

    if (!rule) {
      return {
        title: '未配置考勤规则',
        hint: '当前未读取到有效考勤规则，请联系 HR 检查班次与规则配置',
      };
    }

    const now = currentTime.getTime();
    const checkInTime = buildTimeDate(rule.checkInTime || '09:00', currentTime).getTime();
    const checkOutTime = buildTimeDate(rule.checkOutTime || '18:00', currentTime).getTime();

    if (now < checkInTime) {
      return {
        title: '上班前准备',
        hint: `距离上班时间 ${rule.checkInTime} 还有安排空间`,
      };
    }
    if (now >= checkInTime && now < checkOutTime) {
      return {
        title: '工作时段',
        hint: '当前处于上班到下班之间，可进行签到或补充定位',
      };
    }
    return {
      title: '下班签退时段',
      hint: `当前已过下班时间 ${rule.checkOutTime}，请确认是否需要签退`,
    };
  }, [currentTime, rule, ruleLoading]);

  const locationStatus = location
    ? {
        title: '定位已准备',
        hint: `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
      }
    : {
        title: loading ? '正在定位' : '定位待处理',
        hint: loading ? '正在获取当前坐标信息' : (locationError || '请先获取定位信息'),
      };
  const locationSummary = location ? '定位已就绪' : '待定位';
  const locationDetail = location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : locationStatus.title;

  const pageActions = (
    <div className="grid gap-5">
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">ATTENDANCE CHECK-IN</p>
            <h2>考勤打卡</h2>
            <span>同步今日考勤规则、定位状态和员工签到签退</span>
          </div>
          {!ruleLoading ? (
            <div className="admin-source-controls">
              <Button variant="outline" size="sm" onClick={getLocation} disabled={loading || selfServiceLocked}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                {loading ? '定位中...' : '刷新定位'}
              </Button>
            </div>
          ) : null}
        </header>

        {!ruleLoading ? (
          <section className="admin-source-stat-grid">
            {[
              { label: '当前日期', value: dateLabel, meta: dayTypeLabel, icon: <Calendar size={18} />, tone: 'blue' },
              { label: '当前时间', value: timeLabel, meta: phaseInfo.title, icon: <Clock3 size={18} />, tone: 'green' },
              { label: '今日班次', value: shiftLabel, meta: rule?.ruleName || '未配置', icon: <CheckCircle2 size={18} />, tone: 'amber' },
              { label: '定位状态', value: locationSummary, meta: locationDetail, icon: <MapPin size={18} />, tone: 'violet' },
            ].map((stat) => (
              <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
                <div className="admin-source-stat-icon">{stat.icon}</div>
                <div>
                  <p>{stat.label}</p>
                  <strong>{stat.value}</strong>
                  <span>{stat.meta}</span>
                </div>
              </article>
            ))}
          </section>
        ) : null}
    </div>
  );

  const pageFilters = (
    <div className="grid gap-4">
      <section className="card admin-users-toolbar">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-cf-muted dark:border-slate-800 dark:bg-slate-900">
            规则 {rule?.ruleName || '未配置'}
          </span>
          <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-cf-muted dark:border-slate-800 dark:bg-slate-900">
            {sourceLabel}
          </span>
          <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-cf-muted dark:border-slate-800 dark:bg-slate-900">
            {methodLabel}
          </span>
        </div>
      </section>

      {restrictionMessage ? (
        <div
          data-testid="hr-self-service-restriction"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-amber-200 bg-[var(--cf-surface-strong)] p-2 text-amber-600 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              <AlertCircle size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold">当前账号暂不能继续发起 HR 自助流程</div>
              <div className="mt-1 text-xs leading-6">{restrictionMessage}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const pageContent = ruleLoading ? (
    <InnerTableSurface
      className="flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col"
    >
      <InlineState title="正在加载考勤规则..." className="py-10" />
    </InnerTableSurface>
  ) : (
    <InnerTableSurface
      className="flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-[560px] flex-col">
        <section className="min-w-0">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-cf-title">{user?.name || '当前员工'}</div>
                <div className="mt-1 text-xs text-cf-subtle">{phaseInfo.title}</div>
              </div>
              <div className="text-xs text-cf-subtle">{timeLabel}</div>
            </div>
          </div>

          <div className="admin-source-content-grid p-5">
            <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-5 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-[40px] font-semibold leading-none text-cf-title">
                {secondLabel}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-cf-subtle">
                <span>{dateLabel}</span>
                <span>{shiftLabel}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ActionButton
                title="上班打卡"
                icon={<LogIn size={16} />}
                onClick={() => handleCheckIn('1')}
                disabled={loading || !location || selfServiceLocked}
              />
              <ActionButton
                title="下班签退"
                icon={<LogOut size={16} />}
                onClick={() => handleCheckIn('2')}
                disabled={loading || !location || selfServiceLocked}
                variant="destructive"
              />
            </div>

            <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="admin-source-stat-icon flex-shrink-0 text-cf-subtle">
                    <MapPin size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-cf-title">{locationStatus.title}</div>
                    {locationError || location ? (
                      <div className="mt-1 truncate text-xs text-cf-subtle">{locationStatus.hint}</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-cf-subtle">{locationSummary}</div>
              </div>
            </div>

            <div
              className={`rounded-md border px-4 py-4 text-sm leading-6 ${
 result
 ? result.success
 ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
 : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200'
 : 'border-slate-200 bg-[var(--cf-surface-muted)] text-cf-subtle dark:border-slate-800 dark:bg-slate-900/60 '
 }`}
            >
              {result ? (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {result.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  </div>
                  <div>
                    <div className="font-semibold">{result.success ? '打卡成功' : '打卡失败'}</div>
                    <div className="mt-1">{result.msg}</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-semibold text-cf-body">等待打卡</div>
                  <div className="mt-1 text-xs text-cf-subtle">完成定位后可直接签到或签退。</div>
                </div>
              )}
            </div>

            <section className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-cf-title">今日规则</div>
                <div className="mt-1 text-xs text-cf-subtle">当前考勤规则、允许方式和定位状态</div>
              </div>
              <div className="grid divide-y divide-slate-200 dark:divide-slate-800 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
                <DetailItem
                  label="当前阶段"
                  value={phaseInfo.title}
                  icon={<Calendar size={15} />}
                />
                <DetailItem
                  label="规则来源"
                  value={sourceLabel}
                  description={rule?.ruleName}
                  icon={<CheckCircle2 size={15} />}
                />
                <DetailItem
                  label="允许方式"
                  value={methodLabel}
                  description={`半径 ${rule?.radius ?? '--'} 米`}
                  icon={<MapPin size={15} />}
                />
                <DetailItem
                  label="定位状态"
                  value={locationDetail}
                  icon={<MapPin size={15} />}
                />
                <DetailItem
                  label="签到时间"
                  value={rule?.checkInTime || '--:--'}
                  icon={<LogIn size={15} />}
                />
                <DetailItem
                  label="签退时间"
                  value={rule?.checkOutTime || '--:--'}
                  icon={<LogOut size={15} />}
                />
              </div>
            </section>
          </div>
        </section>
      </div>
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page admin-attendance-check-page">
      <TablePageLayout
        actions={pageActions}
        filters={ruleLoading ? undefined : pageFilters}
        table={pageContent}
      />
    </section>
  );
};

export default AttendanceCheckIn;
