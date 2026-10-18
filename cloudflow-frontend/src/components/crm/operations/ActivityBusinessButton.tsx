import React, { useState } from 'react';
import { Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import type { ActivityDetail } from '@/services/api/crm/operations';
import { ActivityEditor, newActivity } from './ActivityEditor';
import { useAccess } from './OperationsKit';

interface Props {
  bizType: 'CUSTOMER' | 'OPPORTUNITY' | 'LEAD' | 'TICKET' | 'CONTRACT';
  bizId?: number;
  businessName: string;
  customerId?: number;
  customerName?: string;
  disabled?: boolean;
}

export function ActivityBusinessButton({ bizType, bizId, businessName, customerId, customerName, disabled }: Props) {
  const { user } = useAuth();
  const can = useAccess();
  const identity = JSON.stringify([user?.tenantId, user?.id, bizType, bizId, customerId]);
  const [draft, setDraft] = useState<{ identity: string; detail: ActivityDetail }>();
  if (!bizId || !can('crm:activity:add')) return null;
  const begin = () => {
    const detail = newActivity(customerId);
    detail.activity = { ...detail.activity, bizType, bizId, customerId, customerName };
    setDraft({ identity, detail });
  };
  return <><Button variant="outline" className="min-h-11" disabled={disabled} onClick={begin}>安排活动</Button>
    {draft?.identity === identity && <ActivityEditor key={`${identity}:${draft.detail.activity.activityId || 'new'}`}
      initial={draft.detail} businessLabel={draft.detail.activity.bizType === bizType && draft.detail.activity.bizId === bizId ? businessName : undefined} onClose={() => setDraft(undefined)}
      onSaved={detail => setDraft({ identity, detail })} />}
  </>;
}
