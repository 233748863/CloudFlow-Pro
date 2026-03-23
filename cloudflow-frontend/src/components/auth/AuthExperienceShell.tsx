import React from 'react';
import { Activity, ArrowRight, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui';
import { SliderCaptcha } from '@/components/SliderCaptcha';
import { cn } from '@/utils/cn';

interface AuthHeroStat {
  label: string;
  value: string;
  hint: string;
}

interface AuthHeroPoint {
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: 'pink' | 'rose' | 'amber' | 'slate';
}

interface AuthAsideCard {
  label: string;
  value: string;
  hint: string;
}

interface AuthExperienceShellProps {
  formBadge: string;
  formTitle: string;
  formDescription: string;
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  heroStats: AuthHeroStat[];
  heroPoints: AuthHeroPoint[];
  heroFootnote: string;
  formAside: AuthAsideCard;
  children: React.ReactNode;
  footer: React.ReactNode;
}

interface AuthCaptchaDialogProps {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onVerify: (token: string) => void;
}

const pointToneClassMap: Record<NonNullable<AuthHeroPoint['tone']>, string> = {
  pink: 'bg-pink-500/12 text-pink-700 ring-1 ring-pink-200',
  rose: 'bg-rose-500/12 text-rose-700 ring-1 ring-rose-200',
  amber: 'bg-amber-500/12 text-amber-700 ring-1 ring-amber-200',
  slate: 'bg-slate-900/8 text-slate-700 ring-1 ring-slate-200',
};

export const AuthExperienceShell: React.FC<AuthExperienceShellProps> = ({
  formBadge,
  formTitle,
  formDescription,
  heroEyebrow,
  heroTitle,
  heroDescription,
  heroStats,
  heroPoints,
  heroFootnote,
  formAside,
  children,
  footer,
}) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fff8fb_0%,#fff_32%,#fff4f8_100%)] px-4 py-4 sm:px-6 lg:px-8 lg:py-4 xl:flex xl:items-center">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-8%] h-[420px] w-[420px] rounded-full bg-pink-200/40 blur-3xl" />
        <div className="absolute right-[-8%] top-[16%] h-[520px] w-[520px] rounded-full bg-rose-200/30 blur-3xl" />
        <div className="absolute bottom-[-12%] left-[18%] h-[360px] w-[360px] rounded-full bg-amber-100/55 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.12),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(251,113,133,0.12),transparent_34%)]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl gap-5 xl:grid-cols-[minmax(0,1.04fr)_500px] xl:items-stretch">
        <section className="order-2 overflow-hidden rounded-[36px] border border-white/80 bg-[linear-gradient(140deg,rgba(255,255,255,0.78)_0%,rgba(255,241,247,0.88)_44%,rgba(255,255,255,0.92)_100%)] p-5 shadow-[0_24px_64px_rgba(236,72,153,0.08)] backdrop-blur-xl sm:p-6 xl:order-1 xl:p-7">
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-[0_16px_32px_rgba(236,72,153,0.28)]">
                <Activity size={22} />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight text-slate-900">CloudFlow Pro</div>
                <div className="text-xs text-slate-500 sm:text-sm">Spring Cloud Alibaba + React</div>
              </div>
            </div>

            <div className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
              <Sparkles size={14} />
              {heroEyebrow}
            </div>

            <div className="mt-4 max-w-2xl">
              <h1 className="text-3xl font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-4xl xl:text-[2.95rem]">
                {heroTitle}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                {heroDescription}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {heroStats.map(stat => (
                <div
                  key={stat.label}
                  className="rounded-[24px] border border-white/80 bg-white/78 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] backdrop-blur"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{stat.label}</div>
                  <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{stat.value}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{stat.hint}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {heroPoints.map(point => {
                const Icon = point.icon;
                const tone = point.tone ?? 'pink';
                return (
                  <div
                    key={point.title}
                    className="flex items-start gap-3 rounded-[24px] border border-white/80 bg-white/72 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur"
                  >
                    <div className={cn('inline-flex shrink-0 rounded-2xl p-2.5', pointToneClassMap[tone])}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-semibold tracking-tight text-slate-900">{point.title}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{point.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-[22px] border border-pink-100/70 bg-white/70 px-4 py-3 text-xs text-slate-600">
              <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-2.5 py-1 font-semibold text-pink-600">
                <ShieldCheck size={14} />
                安全认证
              </div>
              <span className="leading-5">{heroFootnote}</span>
            </div>
          </div>
        </section>

        {/* 关键实现说明：
            认证页在移动端让表单优先出现，桌面端则回到“品牌展示 + 表单卡”双栏结构，
            这样既保证转化路径清晰，也让视觉表达更完整。 */}
        <section className="order-1 flex xl:order-2 xl:items-stretch">
          <div className="flex h-full w-full flex-col rounded-[36px] border border-white/85 bg-white/84 p-5 shadow-[0_28px_72px_rgba(236,72,153,0.12)] backdrop-blur-xl sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="inline-flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-[0_14px_30px_rgba(236,72,153,0.24)]">
                  <Activity size={18} />
                </div>
                <div>
                  <div className="text-base font-semibold tracking-tight text-slate-900">CloudFlow Pro</div>
                  <div className="text-xs text-slate-500 sm:text-sm">工作流 / OA / HR / 权限管理</div>
                </div>
              </div>

              <div className="rounded-[20px] border border-pink-100 bg-pink-50/80 px-3.5 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500">{formAside.label}</div>
                <div className="mt-1.5 text-sm font-semibold tracking-tight text-slate-900">{formAside.value}</div>
                <div className="mt-0.5 text-xs leading-5 text-slate-500">{formAside.hint}</div>
              </div>
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-pink-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
              <Sparkles size={14} />
              {formBadge}
            </div>

            <div className="mt-4">
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.85rem]">{formTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{formDescription}</p>
            </div>

            <div className="mt-6">{children}</div>

            <div className="mt-6 border-t border-slate-100 pt-4">{footer}</div>
          </div>
        </section>
      </div>
    </div>
  );
};

export const AuthCaptchaDialog: React.FC<AuthCaptchaDialogProps> = ({
  open,
  title,
  description,
  onClose,
  onVerify,
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[360px] overflow-hidden rounded-[32px] border border-white/80 bg-white/95 p-6 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-7">
        <div className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </Button>

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
            <ShieldCheck size={14} />
            安全验证
          </div>
          <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>

          {/* 关键实现说明：
              验证弹层不再只是一个功能弹窗，而是沿用认证页同一套视觉语言，
              这样登录和注册在切到验证步骤时不会产生“跳出当前流程”的割裂感。 */}
          <div className="mt-6">
            <SliderCaptcha onVerify={onVerify} width={300} />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <span>滑动拼图完成验证</span>
            <span className="inline-flex items-center gap-1 font-semibold text-pink-600">
              下一步
              <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
