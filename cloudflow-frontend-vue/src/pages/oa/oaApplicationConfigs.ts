import type { RecordPageConfig } from '@/pages/shared/recordPageConfig'

const statusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '待审批' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已拒绝' }
]

const baseConfig = { eyebrow: 'OA', description: '', icon: {} as any, idKey: 'id', primaryKey: 'id', searchPlaceholder: '搜索' }

export const expenseClaimConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/expense',
  title: '费用报销',
  listPath: '/oa/expense/list',
  fields: [
    { key: 'claimNo', label: '报销单号', type: 'text', table: true },
    { key: 'applicant', label: '申请人', type: 'text', table: true },
    { key: 'amount', label: '报销金额', type: 'number', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions },
    { key: 'applyDate', label: '申请日期', type: 'date', table: true }
  ]
}

export const paymentRequestConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/payment',
  title: '付款申请',
  listPath: '/oa/payment/list',
  fields: [
    { key: 'paymentNo', label: '付款单号', type: 'text', table: true },
    { key: 'payee', label: '收款方', type: 'text', table: true },
    { key: 'amount', label: '付款金额', type: 'number', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions }
  ]
}

export const purchaseRequestConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/purchase',
  title: '采购申请',
  listPath: '/oa/purchase/list',
  fields: [
    { key: 'purchaseNo', label: '采购单号', type: 'text', table: true },
    { key: 'itemName', label: '采购项目', type: 'text', table: true },
    { key: 'quantity', label: '数量', type: 'number', table: true },
    { key: 'amount', label: '金额', type: 'number', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions }
  ]
}

export const sealApplicationConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/seal',
  title: '用印申请',
  listPath: '/oa/seal/list',
  fields: [
    { key: 'applicationNo', label: '申请单号', type: 'text', table: true },
    { key: 'sealType', label: '印章类型', type: 'text', table: true },
    { key: 'purpose', label: '用途', type: 'text', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions }
  ]
}

export const businessTripConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/trip',
  title: '出差申请',
  listPath: '/oa/trip/list',
  fields: [
    { key: 'tripNo', label: '出差单号', type: 'text', table: true },
    { key: 'destination', label: '目的地', type: 'text', table: true },
    { key: 'startDate', label: '开始日期', type: 'date', table: true },
    { key: 'endDate', label: '结束日期', type: 'date', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions }
  ]
}

export const contractConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/contract',
  title: '合同管理',
  listPath: '/oa/contract/list',
  fields: [
    { key: 'contractNo', label: '合同编号', type: 'text', table: true },
    { key: 'contractName', label: '合同名称', type: 'text', table: true },
    { key: 'partyB', label: '乙方', type: 'text', table: true },
    { key: 'amount', label: '合同金额', type: 'number', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions }
  ]
}

export const meetingRoomConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/meeting-room',
  title: '会议室预约',
  listPath: '/oa/meeting-room/list',
  fields: [
    { key: 'roomName', label: '会议室', type: 'text', table: true },
    { key: 'booker', label: '预约人', type: 'text', table: true },
    { key: 'startTime', label: '开始时间', type: 'datetime-local', table: true },
    { key: 'endTime', label: '结束时间', type: 'datetime-local', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions }
  ]
}

export const visitorConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/visitor',
  title: '访客管理',
  listPath: '/oa/visitor/list',
  fields: [
    { key: 'visitorName', label: '访客姓名', type: 'text', table: true },
    { key: 'company', label: '来访单位', type: 'text', table: true },
    { key: 'host', label: '接待人', type: 'text', table: true },
    { key: 'visitDate', label: '来访日期', type: 'date', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions }
  ]
}

export const dutyScheduleConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/duty',
  title: '值班排班',
  listPath: '/oa/duty/list',
  fields: [
    { key: 'dutyDate', label: '值班日期', type: 'date', table: true },
    { key: 'dutyPerson', label: '值班人', type: 'text', table: true },
    { key: 'shift', label: '班次', type: 'text', table: true },
    { key: 'location', label: '值班地点', type: 'text', table: true }
  ]
}

export const licenseBorrowConfig: RecordPageConfig = {
  ...baseConfig,
  path: '/oa/license-borrow',
  title: '证照借用',
  listPath: '/oa/license-borrow/list',
  fields: [
    { key: 'borrowNo', label: '借用单号', type: 'text', table: true },
    { key: 'licenseName', label: '证照名称', type: 'text', table: true },
    { key: 'borrower', label: '借用人', type: 'text', table: true },
    { key: 'borrowDate', label: '借用日期', type: 'date', table: true },
    { key: 'status', label: '状态', type: 'select', table: true, options: statusOptions }
  ]
}
