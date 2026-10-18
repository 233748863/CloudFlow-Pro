import React from 'react';
import { Hr09Access } from './components/Hr09Shared';
import { AppraisalWorkspace } from './appraisals/AppraisalWorkspace';

export default function HrAppraisalCyclePage() {
  return <Hr09Access permission="hr:appraisal:list"><AppraisalWorkspace mine={false} /></Hr09Access>;
}
