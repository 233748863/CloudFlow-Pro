import React from 'react';
import { Hr09Access } from './components/Hr09Shared';
import { HrOvertimeWorkspace } from './components/HrOvertimeWorkspace';

export default function HrOvertimePage() {
  return <Hr09Access permission="hr:overtime:list"><HrOvertimeWorkspace mine={false} /></Hr09Access>;
}
