import request from './request'
import type { PageResult } from '@/types'

export interface ExpenseItem {
  id?: number
  claimId?: number
  expenseType: string
  amount: number
  expenseDate: string
  description?: string
}

export interface ExpenseClaim {
  id?: number
  userId?: number
  userName?: string
  claimNo?: string
  category: string
  totalAmount?: number
  description?: string
  status?: string
  items?: ExpenseItem[]
  createTime?: string
}

export const expenseClaimApi = {
  list: (params?: Record<string, unknown>) =>
    request.get<PageResult<ExpenseClaim>>('/oa/expense/claim/list', { params }),
  add: (data: ExpenseClaim) =>
    request.post<ExpenseClaim>('/oa/expense/claim', data),
  submit: (id: number) =>
    request.post<void>(`/oa/expense/claim/submit/${id}`)
}
