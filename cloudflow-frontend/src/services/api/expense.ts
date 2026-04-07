import request from './request';
import { PageResult } from '@/types';
import { toBackendDateString } from '@/utils/dateFormat';

export interface ExpenseItem {
  id?: number;
  claimId?: number;
  expenseType: string;
  amount: number;
  expenseDate: string;
  description?: string;
  receiptUrl?: string;
  vehicleExpenseId?: number;
}

export interface ExpenseClaim {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  claimNo?: string;
  category: string;
  totalAmount?: number;
  description?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  items?: ExpenseItem[];
  createTime?: string;
  updateTime?: string;
}

export interface PaymentRequest {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  paymentNo?: string;
  payeeName: string;
  payeeAccount?: string;
  payeeBank?: string;
  amount: number;
  paymentType: string;
  reason: string;
  expectedDate?: string;
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
  updateTime?: string;
}

const normalizePaymentExpectedDateForDisplay = (value?: string) =>
  value ? String(value).slice(0, 10) : undefined;

const normalizePaymentExpectedDateForSubmit = (value?: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} 00:00:00`;
  }

  return toBackendDateString(trimmed);
};

const normalizePaymentRequest = (item: PaymentRequest): PaymentRequest => ({
  ...item,
  expectedDate: normalizePaymentExpectedDateForDisplay(item.expectedDate),
});

const normalizePaymentRequestPage = (page: PageResult<PaymentRequest>) => ({
  ...page,
  records: Array.isArray(page.records) ? page.records.map(normalizePaymentRequest) : page.records,
  rows: Array.isArray(page.rows) ? page.rows.map(normalizePaymentRequest) : page.rows,
});

const normalizePaymentRequestPayload = (data: PaymentRequest): PaymentRequest => ({
  ...data,
  expectedDate: normalizePaymentExpectedDateForSubmit(data.expectedDate),
});

// 报销申请相关 API
export const expenseClaimApi = {
  // 分页查询报销申请列表
  list: (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    category?: string;
    userId?: number;
  }) => request.get('/oa/expense/claim/list', { params }) as Promise<PageResult<ExpenseClaim>>,

  // 导出报销申请
  export: (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    category?: string;
    userId?: number;
  }) => request.get('/oa/expense/claim/export', { params, responseType: 'blob' }) as Promise<Blob>,

  // 查询报销申请详情
  getInfo: (id: number) => request.get(`/oa/expense/claim/${id}`) as Promise<ExpenseClaim>,

  // 新增报销申请
  add: (data: ExpenseClaim) => request.post('/oa/expense/claim', data),

  // 修改报销申请
  edit: (data: ExpenseClaim) => request.put('/oa/expense/claim', data),

  // 删除报销申请
  remove: (ids: number[]) => request.delete(`/oa/expense/claim/${ids.join(',')}`),

  // 提交报销申请
  submit: (id: number) => request.post(`/oa/expense/claim/submit/${id}`),

  // 车辆费用转报销单
  convertVehicleExpense: (data: { vehicleExpenseIds: number[]; userId: number }) =>
    request.post('/oa/expense/claim/convert', data),

  // 按部门统计月度报销费用
  getMonthlyExpenseByDept: (month: string) =>
    request.get('/oa/expense/claim/stats/dept', { params: { month } }),

  // 按类别统计月度报销费用
  getMonthlyExpenseByCategory: (month: string) =>
    request.get('/oa/expense/claim/stats/category', { params: { month } }),
};

// 付款申请相关 API
export const paymentRequestApi = {
  // 分页查询付款申请列表
  list: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    paymentType?: string;
    userId?: number;
  }) => {
    const response = await request.get('/oa/payment/request/list', { params }) as PageResult<PaymentRequest>;
    return normalizePaymentRequestPage(response);
  },

  // 导出付款申请
  export: (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    paymentType?: string;
    userId?: number;
  }) => request.get('/oa/payment/request/export', { params, responseType: 'blob' }) as Promise<Blob>,

  // 查询付款申请详情
  getInfo: async (id: number) => {
    const response = await request.get(`/oa/payment/request/${id}`) as PaymentRequest;
    return normalizePaymentRequest(response);
  },

  // 新增付款申请
  add: (data: PaymentRequest) => request.post('/oa/payment/request', normalizePaymentRequestPayload(data)),

  // 修改付款申请
  edit: (data: PaymentRequest) => request.put('/oa/payment/request', normalizePaymentRequestPayload(data)),

  // 删除付款申请
  remove: (ids: number[]) => request.delete(`/oa/payment/request/${ids.join(',')}`),

  // 提交付款申请
  submit: (id: number) => request.post(`/oa/payment/request/submit/${id}`),

  // 按部门统计月度付款费用
  getMonthlyPaymentByDept: (month: string) =>
    request.get('/oa/payment/request/stats/dept', { params: { month } }),
};
