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
  pink: 'bg-pink-500/[0.14] text-pink-100 ring-1 ring-pink-400/[0.2]',
  rose: 'bg-rose-500/[0.14] text-rose-100 ring-1 ring-rose-400/[0.2]',
  amber: 'bg-amber-400/[0.14] text-amber-100 ring-1 ring-amber-300/[0.18]',
  slate: 'bg-white/10 text-slate-100 ring-1 ring-white/12',
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
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#edf2f8_0%,#f8fafc_42%,#eef2ff_100%)] px-4 py-4 sm:px-6 lg:px-8 lg:py-4 xl:flex xl:items-center">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
        <div className="absolute left-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-slate-300/[0.24] blur-3xl" />
        <div className="absolute right-[-10%] top-[12%] h-[460px] w-[460px] rounded-full bg-pink-200/[0.28] blur-3xl" />
        <div className="absolute bottom-[-12%] left-[28%] h-[360px] w-[360px] rounded-full bg-sky-200/[0.22] blur-3xl" />
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl gap-5 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-stretch">
        <section className="order-2 overflow-hidden rounded-[34px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.96))] p-5 shadow-[0_28px_80px_rgba(15,23,42,0.2)] sm:p-6 xl:order-1 xl:p-8">
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)]">
                  <Activity size={22} />
                </div>
                <div>
                  <div className="text-lg font-semibold tracking-tight text-white">CloudFlow Pro</div>
                  <div className="text-xs text-slate-300 sm:text-sm">Unified Workspace Access</div>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                <ShieldCheck size={13} />
                办公系统入口
              </div>
            </div>

            <div className="mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
              <Sparkles size={14} className="text-pink-200" />
              {heroEyebrow}
            </div>

            <div className="mt-5 max-w-2xl">
              <h1 className="text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-4xl xl:text-[2.8rem]">
                {heroTitle}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                {heroDescription}
              </p>
            </div>

            {/* 关键实现说明：
                左侧不再承担宣传页职能，只保留系统入口必需的访问说明和能力概览，
                让信息层级更接近企业办公系统，而不是产品介绍页。 */}
            <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(17rem,0.95fr)]">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">系统访问</div>
                    <div className="mt-1 text-sm font-semibold text-white">登录前信息确认</div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-slate-950/30 px-3 py-1 text-[11px] font-medium text-slate-300">
                    Access Overview
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {heroStats.map(stat => (
                    <div
                      key={stat.label}
                      className="flex items-start justify-between gap-4 rounded-[22px] border border-white/[0.08] bg-slate-950/[0.22] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{stat.label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">{stat.hint}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm font-semibold tracking-tight text-white">{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">使用说明</div>
                <div className="mt-1 text-sm font-semibold text-white">进入系统前的必要提示</div>

                <div className="mt-5 space-y-3">
                  {heroPoints.map(point => {
                    const Icon = point.icon;
                    const tone = point.tone ?? 'pink';
                    return (
                      <div
                        key={point.title}
                        className="rounded-[22px] border border-white/[0.08] bg-slate-950/[0.22] px-4 py-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('inline-flex shrink-0 rounded-2xl p-2.5', pointToneClassMap[tone])}>
                            <Icon size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold tracking-tight text-white">{point.title}</div>
                            <div className="mt-1 text-xs leading-5 text-slate-400">{point.description}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 rounded-[24px] border border-white/10 bg-slate-950/20 px-4 py-3 text-xs text-slate-300">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/8 px-2.5 py-1 font-semibold text-white">
                <Activity size={14} />
                认证链路
              </div>
              <span className="leading-5">{heroFootnote}</span>
            </div>
          </div>
        </section>

        {/* 关键实现说明：
            移动端继续让表单优先出现，桌面端则用右侧独立表单卡承载核心操作，
            减少干扰后，用户进入页后的第一动作会更明确。 */}
        <section className="order-1 flex xl:order-2 xl:items-stretch">
          <div className="flex h-full w-full flex-col rounded-[34px] border border-white/90 bg-white/92 p-5 shadow-[0_24px_72px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="inline-flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_14px_30px_rgba(236,72,153,0.18)]">
                  <Activity size={18} />
                </div>
                <div>
                  <div className="text-base font-semibold tracking-tight text-slate-900">CloudFlow Pro</div>
                  <div className="text-xs text-slate-500 sm:text-sm">统一办公系统</div>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{formAside.label}</div>
                <div className="mt-1.5 text-sm font-semibold tracking-tight text-slate-900">{formAside.value}</div>
                <div className="mt-0.5 text-xs leading-5 text-slate-500">{formAside.hint}</div>
              </div>
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              <Sparkles size={14} className="text-pink-500" />
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
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:20px_20px] opacity-30" />
        <div className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.12),transparent_70%)]" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </Button>

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            <ShieldCheck size={14} />
            安全验证
          </div>
          <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>

          {/* 关键实现说明：
              验证弹层沿用认证页同一套系统化视觉，避免用户在验证步骤感到跳出主流程。 */}
          <div className="mt-6">
            <SliderCaptcha onVerify={onVerify} width={300} />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <span>滑动拼图完成验证</span>
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
              下一步
              <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
