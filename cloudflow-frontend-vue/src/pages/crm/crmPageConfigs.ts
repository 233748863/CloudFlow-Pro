import type { RecordPageConfig } from '@/pages/shared/recordPageConfig'

const base = { eyebrow: 'CRM', description: '', icon: {} as any, idKey: 'id', primaryKey: 'id', searchPlaceholder: '搜索' }

export const customerConfig: RecordPageConfig = {
  ...base,
  path: '/crm/customer',
  title: '客户管理',
  listPath: '/crm/customer/list',
  fields: [
    { key: 'customerName', label: '客户名称', type: 'text', table: true },
    { key: 'industry', label: '行业', type: 'text', table: true },
    { key: 'owner', label: '负责人', type: 'text', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: [{ value: 'ACTIVE', label: '活跃' }, { value: 'INACTIVE', label: '未活跃' }] }
  ]
}

export const leadConfig: RecordPageConfig = {
  ...base,
  path: '/crm/lead',
  title: '线索管理',
  listPath: '/crm/lead/list',
  fields: [
    { key: 'leadName', label: '线索名称', type: 'text', table: true },
    { key: 'company', label: '公司', type: 'text', table: true },
    { key: 'source', label: '来源', type: 'text', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: [{ value: 'NEW', label: '新线索' }, { value: 'QUALIFIED', label: '已验证' }] }
  ]
}

export const opportunityConfig: RecordPageConfig = {
  ...base,
  path: '/crm/opportunity',
  title: '商机管理',
  listPath: '/crm/opportunity/list',
  fields: [
    { key: 'opportunityName', label: '商机名称', type: 'text', table: true },
    { key: 'amount', label: '金额', type: 'number', table: true },
    { key: 'stage', label: '阶段', type: 'text', table: true },
    { key: 'closeDate', label: '预计成交日期', type: 'date', table: true }
  ]
}

export const contractConfig: RecordPageConfig = {
  ...base,
  path: '/crm/contract',
  title: '合同管理',
  listPath: '/crm/contract/list',
  fields: [
    { key: 'contractNo', label: '合同编号', type: 'text', table: true },
    { key: 'contractName', label: '合同名称', type: 'text', table: true },
    { key: 'amount', label: '合同金额', type: 'number', table: true },
    { key: 'signDate', label: '签订日期', type: 'date', table: true }
  ]
}

export const receivableConfig: RecordPageConfig = {
  ...base,
  path: '/crm/receivable',
  title: '应收管理',
  listPath: '/crm/receivable/list',
  fields: [
    { key: 'receivableNo', label: '应收单号', type: 'text', table: true },
    { key: 'amount', label: '应收金额', type: 'number', table: true },
    { key: 'receivedAmount', label: '已收金额', type: 'number', table: true },
    { key: 'dueDate', label: '到期日期', type: 'date', table: true }
  ]
}

export const crmPageConfigByPath: Record<string, RecordPageConfig> = {
  '/crm/customer': customerConfig,
  '/crm/lead': leadConfig,
  '/crm/opportunity': opportunityConfig,
  '/crm/contract': contractConfig,
  '/crm/receivable': receivableConfig
}
