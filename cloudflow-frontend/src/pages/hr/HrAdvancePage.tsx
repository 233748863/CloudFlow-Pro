import React from 'react';
import { Hr09Access } from './components/Hr09Shared';
import { AdvanceWorkspace } from './advances/AdvanceWorkspace';

export default function HrAdvancePage() {
  return <Hr09Access permission="hr:advance:list"><AdvanceWorkspace mine={false} /></Hr09Access>;
}
