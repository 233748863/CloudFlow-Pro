import request from '@/services/api/request'

export type OaRecord = Record<string, unknown>

export interface OaPageResult<T extends OaRecord = OaRecord> {
  list?: T[]
  records?: T[]
  rows?: T[]
  total?: number
  current?: number
  size?: number
  pageNum?: number
  pageSize?: number
}

export interface OaBorrowSummary extends OaRecord {
  sealBorrowing?: number
  sealOverdue?: number
  licenseBorrowing?: number
  licenseOverdue?: number
  pendingHandover?: number
}

export interface OaBorrowStats extends OaRecord {
  totalBorrowing?: number
  totalOverdue?: number
  sealApplications?: number
  licenseBorrows?: number
  reminders?: number
}

export const normalizeOaRows = <T extends OaRecord>(data: OaPageResult<T> | T[] | null | undefined): T[] => {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.list)) return data.list
  if (Array.isArray(data.records)) return data.records
  if (Array.isArray(data.rows)) return data.rows
  return []
}

export const getOaTotal = <T extends OaRecord>(data: OaPageResult<T> | T[] | null | undefined, fallback = 0) => {
  if (!data) return fallback
  if (Array.isArray(data)) return data.length
  return Number(data.total ?? data.list?.length ?? data.records?.length ?? data.rows?.length ?? fallback)
}

export const listOaPage = <T extends OaRecord>(basePath: string, params?: OaRecord) =>
  request.get<OaPageResult<T> | T[]>(`${basePath}/list`, { params })

export const createOaRecord = (basePath: string, data: OaRecord) =>
  request.post<void>(basePath, data)

export const updateOaRecord = (basePath: string, data: OaRecord) =>
  request.put<void>(basePath, data)

export const deleteOaRecords = (basePath: string, ids: Array<string | number>) =>
  request.delete<void>(`${basePath}/${ids.join(',')}`)

export const getOaStats = <T extends OaRecord>(path: string, params?: OaRecord) =>
  request.get<T>(path, { params })

export const assetReturn = (id: string | number) =>
  request.post<void>(`/oa/asset/${id}/return`)

export const assetRepair = (id: string | number, remark = '') =>
  request.post<void>(`/oa/asset/${id}/repair`, undefined, { params: { remark } })

export const assetScrap = (id: string | number, remark = '') =>
  request.post<void>(`/oa/asset/${id}/scrap`, undefined, { params: { remark } })

export const approveVehicleUsage = (id: string | number, approved: boolean, remark = '') =>
  request.put<void>(`/oa/vehicle/usage/${id}/approve`, { approved, remark })

export const cancelVehicleUsage = (id: string | number) =>
  request.put<void>(`/oa/vehicle/usage/${id}/cancel`)

export const confirmVehicleReturn = (id: string | number, endMileage?: number, remark = '') =>
  request.put<void>(`/oa/vehicle/usage/${id}/return`, { endMileage, remark })

export const confirmVisitor = (id: string | number) =>
  request.put<void>(`/oa/visitor/confirm/${id}`)

export const checkInVisitor = (id: string | number) =>
  request.put<void>(`/oa/visitor/checkin/${id}`)

export const checkOutVisitor = (id: string | number) =>
  request.put<void>(`/oa/visitor/checkout/${id}`)

export const cancelVisitor = (id: string | number) =>
  request.put<void>(`/oa/visitor/cancel/${id}`)

export const checkInDuty = (id: string | number) =>
  request.put<void>(`/oa/duty/checkin/${id}`)

export const checkOutDuty = (id: string | number) =>
  request.put<void>(`/oa/duty/checkout/${id}`)

export const addConsumableStock = (id: string | number, quantity: number, remark: string) =>
  request.post<void>(`/oa/consumable/${id}/add-stock`, { quantity, remark })

export const reduceConsumableStock = (id: string | number, quantity: number, stockOutType: string, remark: string) =>
  request.post<void>(`/oa/consumable/${id}/reduce-stock`, { quantity, stockOutType, remark })

export const submitLicenseBorrow = (id: string | number) =>
  request.post<void>(`/oa/license/borrow/submit/${id}`)

export const cancelLicenseBorrow = (id: string | number) =>
  request.put<void>(`/oa/license/borrow/cancel/${id}`)

export const confirmLicenseBorrow = (id: string | number, remark = '') =>
  request.put<void>(`/oa/license/borrow/${id}/borrow`, { remark })

export const confirmLicenseReturn = (id: string | number, remark = '') =>
  request.put<void>(`/oa/license/borrow/${id}/return`, { remark })

export const remindLicenseBorrow = (id: string | number, remark = '') =>
  request.post<void>(`/oa/license/borrow/${id}/remind`, { remark })

export const submitSealApplication = (id: string | number) =>
  request.post<void>(`/oa/seal/application/submit/${id}`)

export const cancelSealApplication = (id: string | number) =>
  request.put<void>(`/oa/seal/application/cancel/${id}`)

export const confirmSealBorrow = (id: string | number, remark = '') =>
  request.put<void>(`/oa/seal/application/${id}/borrow`, { remark })

export const confirmSealReturn = (id: string | number, remark = '') =>
  request.put<void>(`/oa/seal/application/${id}/return`, { remark })

export const remindSealApplication = (id: string | number, remark = '') =>
  request.post<void>(`/oa/seal/application/${id}/remind`, { remark })

export const updateRiskStatus = (id: string | number, riskStatus: string, handleRemark = '') =>
  request.put<void>(`/oa/risk/${id}/status`, { riskStatus, handleRemark })

export const assignRisk = (id: string | number, ownerId: number, ownerName: string) =>
  request.put<void>(`/oa/risk/${id}/assign`, { ownerId, ownerName })

export const getBorrowSummary = () =>
  request.get<OaBorrowSummary>('/oa/borrow-management/summary')

export const getBorrowStats = () =>
  request.get<OaBorrowStats>('/oa/borrow-management/stats')

export const submitOaRecord = (basePath: string, id: string | number) =>
  request.post<void>(`${basePath}/submit/${id}`)

export const cancelOaRecord = (basePath: string, id: string | number) =>
  request.put<void>(`${basePath}/cancel/${id}`)

export const confirmPaymentRequest = (id: string | number) =>
  request.post<void>(`/oa/payment/request/${id}/pay`)

export const receivePurchaseRequest = (id: string | number, remark = '前端确认入库') =>
  request.post<void>(`/oa/purchase/request/${id}/receipt`, { remark })

export const createPurchasePaymentRequest = (id: string | number) =>
  request.post<OaRecord>(`/oa/purchase/request/${id}/create-payment`)

export const revokeAnnouncement = (id: string | number) =>
  request.post<void>(`/oa/announcement/revoke/${id}`)

export const toggleAnnouncementTop = (id: string | number) =>
  request.post<void>(`/oa/announcement/toggle-top/${id}`)

export const publishAnnouncement = (data: OaRecord) =>
  request.post<void>('/oa/announcement/publish', data)

export const updateAnnouncement = (data: OaRecord) =>
  request.put<void>('/oa/announcement', data)

export const deleteAnnouncement = (id: string | number) =>
  request.delete<void>(`/oa/announcement/${id}`)

export const listAnnouncementManage = <T extends OaRecord>(params?: OaRecord) =>
  request.get<OaPageResult<T> | T[]>('/oa/announcement/manage-list', { params })

export const listContacts = <T extends OaRecord>(params?: OaRecord) =>
  request.get<OaPageResult<T>>('/oa/contact/list', { params })

export const getContactDeptTree = <T extends OaRecord>() =>
  request.get<T[]>('/oa/contact/dept/tree')

export const getContactDetail = <T extends OaRecord>(userId: string | number) =>
  request.get<T>(`/oa/contact/user/${userId}`)

export const listKnowledgeMy = <T extends OaRecord>(params?: OaRecord) =>
  request.get<T[]>('/oa/knowledge/my-list', { params })

export const listKnowledgeSubmissions = <T extends OaRecord>(params?: OaRecord) =>
  request.get<OaPageResult<T>>('/oa/knowledge/my-submissions', { params })

export const createKnowledge = (data: OaRecord) =>
  request.post<void>('/oa/knowledge', data)

export const updateKnowledge = (data: OaRecord) =>
  request.put<void>('/oa/knowledge', data)

export const deleteKnowledge = (id: string | number) =>
  request.delete<void>(`/oa/knowledge/${id}`)

export const submitKnowledge = (id: string | number) =>
  request.post<void>(`/oa/knowledge/submit/${id}`)

export const recallKnowledge = (id: string | number) =>
  request.post<void>(`/oa/knowledge/recall/${id}`)

export const readKnowledge = (id: string | number) =>
  request.post<boolean>(`/oa/knowledge/read/${id}`)
