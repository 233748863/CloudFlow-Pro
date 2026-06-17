import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { CrmOpportunityBoardCard } from '@/services/api/crm';

export const DraggableOpportunityCard: React.FC<{
  item: CrmOpportunityBoardCard;
  onClick: () => void;
}> = ({ item, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `opp:${item.opportunityId}` });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.8 : 1,
  } as React.CSSProperties;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className="cf-interactive-card w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      <div>{item.opportunityName}</div>
      <div className="mt-1 text-xs text-slate-500">{item.customerName || '-'} / 停留 {item.stageStayDays || 0} 天</div>
      <div className="mt-1 text-xs text-slate-500">{item.expectedAmount || 0} / 赢率 {item.winRate || 0}%</div>
    </button>
  );
};
