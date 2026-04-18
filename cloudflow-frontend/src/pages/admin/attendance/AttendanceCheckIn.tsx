import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Calendar, CheckCircle2, CircleDot, Clock3, MapPin, RefreshCw, ShieldCheck, Sparkles, Timer, Wifi } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import {
  WorkspaceBackdrop,
  WorkspacePageContent,
} from '@/components/workspace/WorkspacePrimitives';
import { checkIn, getAttendanceRule, AttendanceRule } from '@/services/api/admin';
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

const SectionHeader = ({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) => (
  <div>
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
    <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{title}</div>
  </div>
);

const AttendanceCheckIn: React.FC = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [rule, setRule] = useState<AttendanceRule | null>(null);
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
    void getAttendanceRule()
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
  const secondLabel = currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const phaseInfo = useMemo(() => {
    if (ruleLoading) {
      return {
        title: '规则加载中',
        hint: '正在同步今日考勤规则',
        tone: 'bg-slate-100 text-slate-600',
      };
    }

    if (!rule) {
      return {
        title: '未配置考勤规则',
        hint: '当前未读取到有效考勤规则，请联系 HR 检查班次与规则配置',
        tone: 'bg-amber-50 text-amber-700',
      };
    }

    const now = currentTime.getTime();
    const checkInTime = buildTimeDate(rule.checkInTime, currentTime).getTime();
    const checkOutTime = buildTimeDate(rule.checkOutTime, currentTime).getTime();

    if (now < checkInTime) {
      return {
        title: '上班前准备',
        hint: `距离上班时间 ${rule.checkInTime} 还有安排空间`,
        tone: 'bg-amber-50 text-amber-700',
      };
    }
    if (now >= checkInTime && now < checkOutTime) {
      return {
        title: '工作时段',
        hint: `当前处于上班到下班之间，可进行签到或补充定位`,
        tone: 'bg-emerald-50 text-emerald-700',
      };
    }
    return {
      title: '下班签退时段',
      hint: `当前已过下班时间 ${rule.checkOutTime}，请确认是否需要签退`,
      tone: 'bg-teal-50 text-teal-700',
    };
  }, [currentTime, rule, ruleLoading]);

  const locationStatus = location
    ? {
        title: '定位已准备',
        hint: `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
        tone: 'bg-emerald-50 text-emerald-700',
      }
    : {
        title: loading ? '正在定位' : '定位待处理',
        hint: loading ? '正在获取当前坐标信息' : (locationError || '请先获取定位信息'),
        tone: 'bg-amber-50 text-amber-700',
      };

  const metrics = [
    {
      label: '上班时间',
      value: rule?.checkInTime || '--:--',
      desc: '今日签到基准时间',
      icon: <Clock3 size={20} />,
      iconClass: 'bg-teal-50 text-teal-700',
      ringClass: 'ring-teal-100',
    },
    {
      label: '下班时间',
      value: rule?.checkOutTime || '--:--',
      desc: '今日签退基准时间',
      icon: <Timer size={20} />,
      iconClass: 'bg-amber-50 text-amber-600',
      ringClass: 'ring-amber-100',
    },
    {
      label: '定位状态',
      value: location ? '已就绪' : '待定位',
      desc: location ? '当前坐标已经获取' : 'Web 端打卡前需要先获取定位',
      icon: <MapPin size={20} />,
      iconClass: location ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600',
      ringClass: location ? 'ring-emerald-100' : 'ring-slate-200',
    },
    {
      label: 'Wi-Fi 校验',
      value: 'Web 端受限',
      desc: '当前浏览器环境无法读取 Wi-Fi Mac 信息',
      icon: <Wifi size={20} />,
      iconClass: 'bg-slate-100 text-slate-600',
      ringClass: 'ring-slate-200',
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
            <div className="relative p-7 sm:p-8">
              <div className="relative">
                <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-teal-700">
                    <Calendar size={14} />
                    {dateLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{timeLabel}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">考勤打卡</span>
                </div>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      <Sparkles size={14} />
                      Attendance Workspace
                    </div>
                    <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.85rem]">
                      {user?.name ? `${user.name}，准备打卡` : '准备打卡'}
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                      保留当前粉色主题，把考勤入口升级成和仪表台同一套工作区语言。现在你可以更清楚地看到时间、规则、定位状态和当前打卡阶段。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button className="h-12 rounded-xl px-6" onClick={() => handleCheckIn('1')} disabled={loading || !location || selfServiceLocked}>
                      上班打卡
                      <ArrowRight size={16} className="ml-2" />
                    </Button>
                    <Button variant="outline" className="h-12 rounded-xl px-6" onClick={getLocation} disabled={loading || selfServiceLocked}>
                      <RefreshCw size={16} className={`mr-2 text-teal-600 ${loading ? 'animate-spin' : ''}`} />
                      重新定位
                    </Button>
                  </div>
                </div>

                {restrictionMessage && (
                  <div
                    data-testid="hr-self-service-restriction"
                    className="mt-5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-amber-900"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-white p-2 text-amber-600 ring-1 ring-amber-200">
                        <AlertCircle size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">当前账号暂不能继续发起 HR 自助流程</div>
                        <div className="mt-1 text-xs leading-6 text-amber-800">{restrictionMessage}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">当前时间</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{secondLabel}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">每秒自动同步当前设备时间</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">当前阶段</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{phaseInfo.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{phaseInfo.hint}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">定位状态</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{location ? '已就绪' : '待处理'}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{location ? '当前坐标已获取' : '打卡前请先获取定位信息'}</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader eyebrow="今日焦点" title="今天先看这些" />
            <div className="mt-5 space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className={`rounded-2xl p-3 ${phaseInfo.tone}`}>
                  <CircleDot size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900">打卡阶段</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{phaseInfo.hint}</div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className={`rounded-2xl p-3 ${locationStatus.tone}`}>
                  <MapPin size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900">{locationStatus.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{locationStatus.hint}</div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
                  <Wifi size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900">Web 端能力限制</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">当前浏览器无法直接读取 Wi-Fi Mac 信息，因此仅保留定位校验。</div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {metrics.map(metric => (
            <div key={metric.label}>
              <Card className={`rounded-2xl border-slate-200 bg-white p-5 shadow-sm ring-1 ${metric.ringClass}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-500">{metric.label}</div>
                    <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{metric.value}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-400">{metric.desc}</div>
                  </div>
                  <div className={`rounded-2xl p-3 ${metric.iconClass}`}>{metric.icon}</div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5">
              <SectionHeader eyebrow="考勤工作区" title="打卡面板" />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">实时打卡时钟</div>
                <div className="mt-4 text-6xl font-bold tracking-[0.1em] text-slate-900">{secondLabel}</div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
                  <Clock3 size={14} className="text-teal-600" />
                  上班：{rule?.checkInTime || '--:--'}
                  <span className="mx-1 text-slate-300">|</span>
                  下班：{rule?.checkOutTime || '--:--'}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Button
                  className="h-36 rounded-2xl"
                  onClick={() => handleCheckIn('1')}
                  disabled={loading || !location || selfServiceLocked}
                >
                  <div className="flex flex-col items-center justify-center">
                    <div className="mb-2 text-3xl font-bold">上班打卡</div>
                    <div className="text-sm opacity-85">进入工作状态并记录签到时间</div>
                  </div>
                </Button>

                <Button
                  variant="destructive"
                  className="h-36 rounded-2xl"
                  onClick={() => handleCheckIn('2')}
                  disabled={loading || !location || selfServiceLocked}
                >
                  <div className="flex flex-col items-center justify-center">
                    <div className="mb-2 text-3xl font-bold">下班签退</div>
                    <div className="text-sm opacity-85">结束工作状态并记录签退时间</div>
                  </div>
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader eyebrow="定位信息" title="当前定位" />
              <div className="mt-5 space-y-3">
                {location ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-700">
                    <div className="flex items-center gap-2 font-semibold"><MapPin size={16} />已定位成功</div>
                    <div className="mt-2 leading-6">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-700">
                    <div className="flex items-center gap-2 font-semibold"><AlertCircle size={16} />定位待完成</div>
                    <div className="mt-2 leading-6">{loading ? '正在获取当前位置...' : (locationError || '请先获取定位信息')}</div>
                  </div>
                )}

                <Button variant="outline" onClick={getLocation} disabled={loading || selfServiceLocked} className="h-11 w-full rounded-xl">
                  <RefreshCw size={16} className={`mr-2 text-teal-600 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? '定位中...' : '重新获取定位'}
                </Button>
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader eyebrow="打卡反馈" title="结果与提示" />
              <div className="mt-5">
                {result ? (
                  <div className={`rounded-xl border p-4 text-sm leading-6 ${result.success ? 'border-emerald-100 bg-emerald-50/70 text-emerald-700' : 'border-red-100 bg-red-50/70 text-red-700'}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      {result.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      {result.success ? '打卡成功' : '打卡失败'}
                    </div>
                    <div className="mt-2">{result.msg}</div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-500">
                    打卡结果会显示在这里。完成定位后，可以直接点击上班打卡或下班签退。
                  </div>
                )}
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader eyebrow="打卡说明" title="规则提示" />
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-500">
                <div className="flex items-center gap-2 font-semibold text-slate-700">
                  <ShieldCheck size={16} className="text-teal-600" />
                  Web 端打卡说明
                </div>
                <div className="mt-2">浏览器端目前通过地理定位辅助校验；Wi-Fi 信息在 Web 环境下无法读取，因此不会参与校验。</div>
              </div>
            </Card>
          </div>
        </div>
      </WorkspacePageContent>
    </div>
  );
};

export default AttendanceCheckIn;
