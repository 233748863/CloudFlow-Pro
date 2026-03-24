import React from 'react';
import { ChevronRight } from 'lucide-react';

export const WorkspaceBackdrop: React.FC = () => (
  <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
    <div className="absolute left-[-10%] top-[-8%] h-[32rem] w-[32rem] rounded-full bg-pink-300/18 blur-[120px]" />
    <div className="absolute right-[-12%] top-[12%] h-[38rem] w-[38rem] rounded-full bg-rose-200/20 blur-[140px]" />
    <div className="absolute bottom-[-12%] left-[18%] h-[26rem] w-[26rem] rounded-full bg-amber-100/45 blur-[110px]" />
    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.55),rgba(255,255,255,0.8))]" />
  </div>
);

export const WorkspaceSectionHeader = ({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
      <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{title}</div>
    </div>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition hover:text-pink-600"
      >
        {actionLabel}
        <ChevronRight size={14} />
      </button>
    ) : null}
  </div>
);

export const WorkspaceEmptyPanel = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
      {icon}
    </div>
    <div className="text-sm font-semibold text-slate-700">{title}</div>
    <div className="mt-2 max-w-xs text-xs leading-6 text-slate-400">{description}</div>
  </div>
);
