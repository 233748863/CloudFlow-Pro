import React from 'react';
import type { PageResult } from '@/types';
import type { OaContract } from '@/services/api/contractRisk';
import { oaGet, pageRows, type SysSupplier } from '@/services/api/oaOperations';
import { useRemote, useAccess } from './OperationsKit';
import { FormFields, optionsOf } from './RecordEditor';

export default function ContractSettingsFields({ value, onChange }: { value: OaContract; onChange: (value: OaContract) => void }) {
  const can = useAccess(); const suppliers = useRemote<PageResult<SysSupplier> | undefined>(() => can('oa:supplier:list') ? oaGet<PageResult<SysSupplier>>('/supplier/list', { pageNum: 1, pageSize: 200, status: 'ACTIVE' }) : Promise.resolve(undefined));
  return <FormFields value={value} onChange={onChange} fields={[
    { key: 'supplierId', label: '关联供应商（供应商合同需校验准入）', type: 'select', numeric: true, options: optionsOf(pageRows(suppliers.data), 'supplierId', 'supplierName'), when: () => can('oa:supplier:list') },
    { key: 'requiresFulfilmentFlag', label: '需要履约跟踪', type: 'checkbox' }, { key: 'fulfilmentDeadline', label: '整体履约截止日', type: 'date', when: record => !!record.requiresFulfilmentFlag },
  ]} />;
}
