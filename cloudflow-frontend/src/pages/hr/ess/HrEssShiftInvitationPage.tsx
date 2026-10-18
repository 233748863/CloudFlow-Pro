import React from 'react';
import { Hr09Access } from '../components/Hr09Shared';
import { HrShiftInvitationWorkspace } from '../components/HrShiftRequestWorkspace';

export default function HrEssShiftInvitationPage() {
  return <Hr09Access permission="hr:shift-request:respond"><HrShiftInvitationWorkspace /></Hr09Access>;
}
