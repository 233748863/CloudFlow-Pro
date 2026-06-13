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
import { checkIn } from '@/services/api/admin';
import { EffectiveAttendanceRule, getEffectiveAttendanceRule } from '@/services/api/hr';
import { useAuth } from '@/context/AuthContext';
import { useHrSelfServiceEligibility } from '@/hooks/useHrSelfServiceEligibility';
import { useMount } from '@/hooks/useMount';

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
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Clock3 className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
  </div>
);

const SideItem = ({
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
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
      {description ? (
        <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{description}</div>
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
    className="h-12 justify-start rounded-xl px-4 text-left"
    onClick={onClick}
    disabled={disabled}
  >
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-current/10 bg-white/70 text-current dark:bg-slate-950/30">
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

  if (ruleLoading) {
    return (
      <div className="space-y-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <Clock3 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
            Attendance Check-In
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            考勤打卡
          </h1>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <InlineState title="正在加载考勤规则..." className="py-16" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Clock3 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Attendance Check-In
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          考勤打卡
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {dateLabel}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          规则 {rule?.ruleName || '未配置'}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {dayTypeLabel}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {locationSummary}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={getLocation} disabled={loading || selfServiceLocked}>
            <RefreshCw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
            {loading ? '定位中...' : '刷新定位'}
          </Button>
        </div>
      </div>

      {restrictionMessage ? (
        <div
          data-testid="hr-self-service-restriction"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full border border-amber-200 bg-white p-2 text-amber-600 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              <AlertCircle size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold">当前账号暂不能继续发起 HR 自助流程</div>
              <div className="mt-1 text-xs leading-6">{restrictionMessage}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name || '当前员工'}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{phaseInfo.title}</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{timeLabel}</div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[40px] font-semibold leading-none tracking-[0.08em] text-slate-900 dark:text-slate-100">
                {secondLabel}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
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

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    <MapPin size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{locationStatus.title}</div>
                    {locationError || location ? (
                      <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{locationStatus.hint}</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{locationSummary}</div>
              </div>
            </div>

            <div
              className={`rounded-xl border px-4 py-4 text-sm leading-6 ${
                result
                  ? result.success
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
                  : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400'
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
                  <div className="font-semibold text-slate-700 dark:text-slate-200">等待打卡</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">完成定位后可直接签到或签退。</div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">今日规则</div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <SideItem
              label="当前阶段"
              value={phaseInfo.title}
              icon={<Calendar size={15} />}
            />
            <SideItem
              label="规则来源"
              value={sourceLabel}
              description={rule?.ruleName}
              icon={<CheckCircle2 size={15} />}
            />
            <SideItem
              label="允许方式"
              value={methodLabel}
              description={`半径 ${rule?.radius ?? '--'} 米`}
              icon={<MapPin size={15} />}
            />
            <SideItem
              label="定位状态"
              value={locationDetail}
              icon={<MapPin size={15} />}
            />
            <SideItem
              label="签到时间"
              value={rule?.checkInTime || '--:--'}
              icon={<LogIn size={15} />}
            />
            <SideItem
              label="签退时间"
              value={rule?.checkOutTime || '--:--'}
              icon={<LogOut size={15} />}
            />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AttendanceCheckIn;
