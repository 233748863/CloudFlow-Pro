import React from 'react';
import { Hr09Access } from '../components/Hr09Shared';
import { HrShiftRequestWorkspace } from '../components/HrShiftRequestWorkspace';

export default function HrEssShiftRequestPage() {
  return <Hr09Access permission="hr:shift-request:mine"><HrShiftRequestWorkspace mine /></Hr09Access>;
}
