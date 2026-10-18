import React from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useCrmManagement } from '../store';
import { DroppableStageColumn } from './DroppableStageColumn';

export const OpportunityBoard: React.FC<{ onOpen: (id: number) => void }> = ({ onOpen }) => {
  const { board, hasPermission, handleBoardDragEnd } = useCrmManagement();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  return (
    <DndContext sensors={sensors} onDragEnd={handleBoardDragEnd}>
      <div className="admin-crm-board-grid">
        {board.map((column) => (
          <DroppableStageColumn
            key={column.stage}
            column={column}
            draggable={!['WON', 'LOST'].includes(column.stage || '') && (hasPermission('crm:opportunity:edit') || hasPermission('crm:opportunity:win') || hasPermission('crm:approval:opportunity-downgrade'))}
            onCardClick={card => { if (card.opportunityId) onOpen(card.opportunityId); }}
          />
        ))}
      </div>
    </DndContext>
  );
};
