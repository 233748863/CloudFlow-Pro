import React from 'react';
import { CrmProfile } from '@/services/api/crm';
import { crmOperations } from '@/services/api/crm/operations';
import { useDict } from '@/hooks/useDict';
import { Amount, Field, Flag, OpsSelect, useAccess, useRemote } from './OperationsKit';

export function ProfileFields({ value, onChange }: { value: CrmProfile; onChange: (fields: Partial<CrmProfile>) => void }) {
  const can = useAccess();
  const segment = useDict('crm_market_segment');
  const scale = useDict('crm_employee_scale');
  const territorySource = useRemote(() => can('crm:territory:list') ? crmOperations.territories() : Promise.resolve([]));
  const campaignSource = useRemote(() => can('crm:campaign:list') ? crmOperations.campaignChoices() : Promise.resolve({ rows: [] }));
  return <>
    <Field label="销售区域"><OpsSelect label="销售区域" value={value.territoryId} empty="未设置" options={Object.fromEntries((territorySource.data || []).map(row => [String(row.territoryId), `${'　'.repeat(Math.max(0, (row.levelPath?.split('/').filter(Boolean).length || 1) - 1))}${row.territoryName}${row.status === 'INACTIVE' ? '（停用）' : ''}`]))} onChange={selected => onChange({ territoryId: selected ? Number(selected) : undefined })} /></Field>
    <Field label="细分市场"><OpsSelect label="细分市场" value={value.marketSegment} empty="未设置" options={Object.fromEntries(segment.getOptions().map(option => [option.value, option.label]))} onChange={selected => onChange({ marketSegment: selected || undefined })} /></Field>
    <Field label="员工规模"><OpsSelect label="员工规模" value={value.employeeScale} empty="未设置" options={Object.fromEntries(scale.getOptions().map(option => [option.value, option.label]))} onChange={selected => onChange({ employeeScale: selected || undefined })} /></Field>
    <Field label="年营收（元）"><Amount label="年营收（元）" value={value.annualRevenue} onChange={amount => onChange({ annualRevenue: amount || undefined })} /></Field>
    <Field label="来源营销活动"><OpsSelect label="来源营销活动" value={value.campaignId} empty="无营销来源" options={Object.fromEntries((campaignSource.data?.rows || []).map(row => [String(row.campaignId), row.campaignName]))} onChange={selected => onChange({ campaignId: selected ? Number(selected) : undefined })} /></Field>
    <div className="flex items-center"><Flag label="已退订营销消息（保留正常业务联系）" value={value.unsubscribeFlag} onChange={checked => onChange({ unsubscribeFlag: checked ? 1 : 0 })} /></div>
  </>;
}
