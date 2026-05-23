import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common';
import type { CrmOpportunityBoardCard, CrmOpportunityBoardColumn } from '@/services/api/crm';
import { DraggableOpportunityCard } from './DraggableOpportunityCard';

export const DroppableStageColumn: React.FC<{
  column: CrmOpportunityBoardColumn;
  onCardClick: (item: CrmOpportunityBoardCard) => void;
}> = ({ column, onCardClick }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${column.stage}` });

  return (
    <Card ref={setNodeRef} className={isOver ? 'border-cyan-400 shadow-md' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{column.stageLabel || column.stage}</CardTitle>
        <div className="text-xs text-slate-500">{column.count || 0} 条 / {column.totalAmount || 0}</div>
      </CardHeader>
      <CardContent className="space-y-2">
        {column.items.length ? column.items.map((item) => (
          <DraggableOpportunityCard key={item.opportunityId} item={item} onClick={() => onCardClick(item)} />
        )) : <div className="text-sm text-slate-500">暂无商机</div>}
      </CardContent>
    </Card>
  );
};
