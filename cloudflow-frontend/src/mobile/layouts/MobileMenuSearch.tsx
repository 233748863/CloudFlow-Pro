import React from 'react';
import { MobileHeader } from '@/components/mobile/MobileHeader';

export const MobileMenuSearch = ({ children, onMenu }: { children: React.ReactNode; onMenu: () => void }) => (
  <MobileHeader title="功能导航" onMenu={onMenu} actions={children} />
);
