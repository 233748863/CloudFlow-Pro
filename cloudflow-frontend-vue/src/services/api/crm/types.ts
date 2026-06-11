import type { ApiRecord, ListParams, NormalizedPage } from '@/services/api/page'

export type CrmRecord = ApiRecord
export type CrmListParams = ListParams
export type CrmPage<T extends CrmRecord = CrmRecord> = NormalizedPage<T>
