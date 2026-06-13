import React from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useCrmManagement } from '../store';
import { DroppableStageColumn } from './DroppableStageColumn';

export const OpportunityBoard: React.FC = () => {
  const { board, opportunities, openDialog, handleBoardDragEnd } = useCrmManagement();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  return (
    <DndContext sensors={sensors} onDragEnd={handleBoardDragEnd}>
      <div className="grid gap-4 xl:grid-cols-6">
        {board.map((column) => (
          <DroppableStageColumn
            key={column.stage}
            column={column}
            onCardClick={(card) => {
              const matched = opportunities.find((item) => item.opportunityId === card.opportunityId);
              openDialog({
                type: 'opportunity',
                item: matched || {
                  customerId: card.customerId || 0,
                  opportunityId: card.opportunityId,
                  opportunityName: card.opportunityName || '',
                  customerName: card.customerName,
                },
              });
            }}
          />
        ))}
      </div>
    </DndContext>
  );
};
