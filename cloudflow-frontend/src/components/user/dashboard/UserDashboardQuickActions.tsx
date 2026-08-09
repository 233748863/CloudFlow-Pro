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
  <article className="quick-actions-card">
    <div className="quick-actions-header">
      <h2>快捷入口</h2>
    </div>

    <div className="quick-actions-list">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="quick-action-row group"
        >
          <div
            className={`quick-action-icon ${action.toneClassName}`}
          >
            {action.icon}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-cf-title">
              {action.label}
            </p>
            <p className="text-xs text-cf-subtle">
              {action.description}
            </p>
          </div>

          <ArrowRight className="h-4 w-4 text-cf-faint transition-transform group-hover:translate-x-0.5" />
        </button>
      ))}
    </div>
  </article>
);
