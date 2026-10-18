import React from 'react';
import { Hr09Access } from '../components/Hr09Shared';
import { AdvanceWorkspace } from '../advances/AdvanceWorkspace';

export default function HrEssAdvancePage() {
  return <Hr09Access permission="hr:advance:own"><AdvanceWorkspace mine /></Hr09Access>;
}
