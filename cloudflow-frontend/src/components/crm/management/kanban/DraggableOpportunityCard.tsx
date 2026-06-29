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
      className="admin-crm-board-card"
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      <strong>{item.opportunityName}</strong>
      <span>{item.customerName || '-'} / 停留 {item.stageStayDays || 0} 天</span>
      <span>{item.expectedAmount || 0} / 赢率 {item.winRate || 0}%</span>
    </button>
  );
};
