import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { CrmOpportunityBoardCard } from '@/services/api/crm';
import { money } from '../../operations/OperationsKit';

export const DraggableOpportunityCard: React.FC<{
  item: CrmOpportunityBoardCard;
  onClick: () => void;
  draggable: boolean;
}> = ({ item, onClick, draggable }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `opp:${item.opportunityId}`, disabled: !draggable });
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
      <span>{item.customerName || '-'} / {item.stageStayDays == null ? '阶段进入时间未记录' : `停留 ${item.stageStayDays} 个完整天`}</span>
      <span>{money(item.expectedAmount)} 元 / 赢率 {item.winRate ?? 0}%</span>
      <span>加权金额 {money(item.weightedAmount)} 元</span>
    </button>
  );
};
