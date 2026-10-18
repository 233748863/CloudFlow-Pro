import React from 'react';
import { Hr09Access } from '../components/Hr09Shared';
import { AppraisalWorkspace } from '../appraisals/AppraisalWorkspace';

export default function HrEssAppraisalPage() {
  return <Hr09Access permission="hr:appraisal:own"><AppraisalWorkspace mine /></Hr09Access>;
}
