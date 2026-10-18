import React from 'react';
import { createRoot } from 'react-dom/client';
import { DndContext } from '@dnd-kit/core';
import { FieldPalette } from '../../cloudflow-frontend/src/components/form-builder/FieldPalette';
import '../../cloudflow-frontend/src/index.css';
import '../../cloudflow-frontend/src/styles/unity2-refresh.css';
import '../../cloudflow-frontend/src/styles/mobile-foundation.css';

const added: string[] = [];
Object.assign(window, { paletteAdded: added });
createRoot(document.getElementById('root')!).render(
  <main style={{ height: '100dvh' }}>
    <DndContext><FieldPalette columnMode={false} onAdd={type => added.push(type)} /></DndContext>
  </main>,
);
