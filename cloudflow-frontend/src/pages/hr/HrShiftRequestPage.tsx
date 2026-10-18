import React from 'react';
import { Hr09Access } from './components/Hr09Shared';
import { HrShiftRequestWorkspace } from './components/HrShiftRequestWorkspace';

export default function HrShiftRequestPage() {
  return <Hr09Access permission="hr:shift-request:list"><HrShiftRequestWorkspace mine={false} /></Hr09Access>;
}
