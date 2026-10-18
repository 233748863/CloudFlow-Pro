import React, { useState } from 'react';
import { BusinessPicker } from '@/components/crm/operations/BusinessPicker';
import { CreditPanel } from '@/components/crm/operations/CreditPanel';
import { Empty, OperationsPage } from '@/components/crm/operations/OperationsKit';

export default function CrmCreditPage() {
  const [customerId, setCustomerId] = useState<number>();
  return <OperationsPage title="客户信用管理" description="审批额度变更，实时查看占用与超期风险，受权管理临时放行。" filters={<div className="max-w-md"><BusinessPicker type="CUSTOMER" label="客户" value={customerId} onChange={setCustomerId} /></div>}>
    {customerId ? <CreditPanel key={customerId} customerId={customerId} /> : <Empty text="请先搜索并选择客户" />}
  </OperationsPage>;
}
