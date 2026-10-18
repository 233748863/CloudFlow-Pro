import React from 'react';
import { Hr09Access } from '../components/Hr09Shared';
import { ReferralWorkspace } from '../referrals/ReferralWorkspace';

export default function HrEssReferralPage() {
  return <Hr09Access permission="hr:referral:own"><ReferralWorkspace mine /></Hr09Access>;
}
