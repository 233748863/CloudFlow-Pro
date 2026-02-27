import { useState, useCallback } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/** 历史记录最大保留条数，超出时丢弃最早的记录，防止内存无限增长 */
const MAX_HISTORY_SIZE = 50;

export function useHistory<T>(initialPresent: T) {
  const [state, setState] = useState<HistoryState<T>>({
    past: [],
    present: initialPresent,
    future: []
  });

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const undo = useCallback(() => {
    setState(currentState => {
      const { past, present, future } = currentState;
      if (past.length === 0) return currentState;

      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [present, ...future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState(currentState => {
      const { past, present, future } = currentState;
      if (future.length === 0) return currentState;

      const next = future[0];
      const newFuture = future.slice(1);

      return {
        past: [...past, present],
        present: next,
        future: newFuture
      };
    });
  }, []);

  const set = useCallback((newPresent: T) => {
    setState(currentState => {
      const { past, present } = currentState;
      
      if (newPresent === present) return currentState;

      // P1-6: 限制历史记录最大条数，超出时丢弃最早的记录
      const newPast = [...past, present];
      if (newPast.length > MAX_HISTORY_SIZE) {
        newPast.splice(0, newPast.length - MAX_HISTORY_SIZE);
      }

      return {
        past: newPast,
        present: newPresent,
        future: []
      };
    });
  }, []);

  return { 
    state: state.present, 
    set, 
    undo, 
    redo, 
    canUndo, 
    canRedo,
    past: state.past,
    future: state.future 
  };
}
