import React from 'react';
import { Hr09Access } from './hr/components/Hr09Shared';
import { HrOvertimeWorkspace } from './hr/components/HrOvertimeWorkspace';

export function OvertimeApplicationPage() {
  return <Hr09Access permission="hr:overtime:mine"><HrOvertimeWorkspace mine /></Hr09Access>;
}

export default OvertimeApplicationPage;
