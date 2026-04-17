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
  <div className="card">
    <div className="card-header">
      <h2 className="text-lg font-semibold text-slate-900">快捷入口</h2>
    </div>
    <div className="space-y-3 p-4">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="group flex w-full items-center gap-4 rounded-xl bg-slate-50 p-4 text-left transition-all duration-200 hover:bg-slate-100"
        >
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${action.toneClassName}`}>
            {action.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{action.label}</p>
            <p className="text-xs text-slate-500">{action.description}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-teal-500" />
        </button>
      ))}
    </div>
  </div>
);
