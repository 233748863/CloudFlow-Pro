import React from 'react';
import { Hr09Access } from './components/Hr09Shared';
import { ReferralWorkspace } from './referrals/ReferralWorkspace';

export default function HrReferralPage() {
  return <Hr09Access permission="hr:referral:list"><ReferralWorkspace mine={false} /></Hr09Access>;
}
