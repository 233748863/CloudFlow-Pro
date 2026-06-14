import React from 'react';
import { ArrowRight } from 'lucide-react';

export interface UserDashboardQuickAction {
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  toneClassName: string;
}

interface UserDashboardQuickActionsProps {
  actions: UserDashboardQuickAction[];
}

export const UserDashboardQuickActions: React.FC<UserDashboardQuickActionsProps> = ({
  actions,
}) => (
  <section className="card overflow-hidden">
    <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        快捷入口
      </h2>
    </div>

    <div className="space-y-3 p-4 bg-gradient-to-b from-white/40 to-slate-50/10 dark:from-slate-900/20 dark:to-slate-950/10">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="group flex w-full items-center gap-4 rounded-xl border border-slate-100/50 bg-white/40 p-4 text-left shadow-[0_2px_8px_-2px_rgba(15,23,42,0.01)] transition-all duration-300 hover:translate-x-1 hover:bg-white/80 dark:border-slate-800/30 dark:bg-slate-950/20 dark:hover:bg-slate-950/60"
        >
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${action.toneClassName}`}
          >
            {action.icon}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {action.label}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {action.description}
            </p>
          </div>

          <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500" />
        </button>
      ))}
    </div>
  </section>
);
