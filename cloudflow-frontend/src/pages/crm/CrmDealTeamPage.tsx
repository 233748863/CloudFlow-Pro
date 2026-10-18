import React, { useState } from 'react';
import { Input } from '@/components/common';
import { contractApi } from '@/services/api/contractRisk';
import { useAuth } from '@/context/AuthContext';
import { DealTeamPanel } from '@/components/crm/deal/DealTeamPanel';
import { BusinessPicker } from '@/components/crm/operations/BusinessPicker';
import { OperationsPage, OpsSelect, useRemote } from '@/components/crm/operations/OperationsKit';

function ContractPicker({ value, onChange }: { value?: number; onChange: (id?: number) => void }) {
  const [search, setSearch] = useState('');
  const source = useRemote(() => contractApi.list({ pageNum: 1, pageSize: 100, contractName: search || undefined }), [search]);
  return <div className="space-y-2">
    <Input aria-label="搜索合同" value={search} onChange={event => setSearch(event.target.value)} placeholder="按合同名称搜索" />
    <OpsSelect label="合同" value={value} empty={source.loading ? '加载中' : '请选择合同'} disabled={source.loading}
      options={Object.fromEntries((source.data?.rows || source.data?.records || []).map(contract => [contract.contractId, `${contract.contractName} · ${contract.contractNo}`]))}
      onChange={selected => onChange(selected ? Number(selected) : undefined)} />
    {source.error && <p role="alert">{source.error}</p>}
  </div>;
}

export default function CrmDealTeamPage() {
  const { hasPermission } = useAuth();
  const canReadOpportunity = hasPermission('crm:opportunity:list');
  const canReadQuote = hasPermission('crm:quote:list');
  const canReadContract = hasPermission('oa:contract:list');
  const canReadReceivable = hasPermission('crm:receivable:list');
  const [businessId, setBusinessId] = useState<number>();
  const [selectedType, setSelectedType] = useState<'OPPORTUNITY' | 'QUOTE' | 'CONTRACT' | 'RECEIVABLE'>();
  const businessType = selectedType ?? (canReadOpportunity ? 'OPPORTUNITY' : canReadQuote ? 'QUOTE' : canReadContract ? 'CONTRACT' : 'RECEIVABLE');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!hasPermission('crm:deal-team:query')) return <p role="alert">无权查看销售团队分成。</p>;
  if (!canReadOpportunity && !canReadQuote && !canReadContract && !canReadReceivable) return <p role="alert">无权读取商机、报价、合同或回款计划，请联系管理员核对业务权限。</p>;
  const businessOptions = { ...(canReadOpportunity ? { OPPORTUNITY: '商机' } : {}), ...(canReadQuote ? { QUOTE: '报价' } : {}), ...(canReadContract ? { CONTRACT: '合同' } : {}), ...(canReadReceivable ? { RECEIVABLE: '回款计划' } : {}) };
  return <OperationsPage title="销售团队分成" description="团队按完整版本保存；调整当前比例不改写既有业绩，报价和合同有历史分成后锁定币种。"
    filters={<fieldset disabled={dirty || busy} className="max-w-xl space-y-3">
      <OpsSelect label="团队业务类型" value={businessType} options={businessOptions} disabled={dirty || busy} onChange={value => { if (value !== 'OPPORTUNITY' && value !== 'QUOTE' && value !== 'CONTRACT' && value !== 'RECEIVABLE') return; setSelectedType(value); setBusinessId(undefined); }} />
      {businessType === 'CONTRACT' ? <ContractPicker value={businessId} onChange={setBusinessId} /> : <BusinessPicker key={businessType} type={businessType} value={businessId} label={businessType === 'QUOTE' ? '报价' : businessType === 'RECEIVABLE' ? '回款计划' : '商机'} onChange={setBusinessId} />}
    </fieldset>}>
    {businessId ? <DealTeamPanel key={`${businessType}:${businessId}`} bizType={businessType} bizId={businessId} onDirtyChange={setDirty} onBusyChange={setBusy} /> : <p className="text-sm text-cf-muted">请选择有权访问的商机、报价、合同或回款计划，查看团队或调整分成。</p>}
    {dirty && <p className="text-sm text-cf-muted">请先保存团队草稿，再切换业务。</p>}
  </OperationsPage>;
}
