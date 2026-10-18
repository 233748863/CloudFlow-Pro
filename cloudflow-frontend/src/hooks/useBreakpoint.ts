import { useSyncExternalStore } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const resolveBreakpoint = (width: number): Breakpoint =>
  width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';

const getSnapshot = (): Breakpoint => resolveBreakpoint(window.innerWidth);
const getServerSnapshot = (): Breakpoint => 'desktop';

const subscribe = (onChange: () => void) => {
  const queries = [window.matchMedia('(min-width: 640px)'), window.matchMedia('(min-width: 1024px)')];
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
};

export const useBreakpoint = (): Breakpoint =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
