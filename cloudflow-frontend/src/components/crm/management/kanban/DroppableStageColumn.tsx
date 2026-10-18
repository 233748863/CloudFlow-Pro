import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { CrmOpportunityBoardCard, CrmOpportunityBoardColumn } from '@/services/api/crm';
import { DraggableOpportunityCard } from './DraggableOpportunityCard';

export const DroppableStageColumn: React.FC<{
  column: CrmOpportunityBoardColumn;
  onCardClick: (item: CrmOpportunityBoardCard) => void;
  draggable: boolean;
}> = ({ column, onCardClick, draggable }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${column.stage}`, disabled: !column.enabled });
  const items = Array.isArray(column.items) ? column.items : [];

  return (
    <section ref={setNodeRef} className={`admin-crm-board-column${isOver ? ' is-over' : ''}`}>
      <header>
        <strong>{column.stageLabel || column.stage}{column.enabled ? '' : '（已停用）'}</strong>
        <span>{column.count || 0} 条 / {column.totalAmount || 0}</span>
      </header>
      <div className="admin-crm-board-list">
        {items.length ? items.map((item) => (
          <DraggableOpportunityCard key={item.opportunityId} item={item} draggable={draggable} onClick={() => onCardClick(item)} />
        )) : <div className="admin-crm-board-empty">暂无商机</div>}
      </div>
    </section>
  );
};
