import request from '@/services/api/request'

export type ApiRecord = Record<string, unknown>

export interface NormalizedPage<T extends ApiRecord = ApiRecord> {
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

export interface ListParams extends ApiRecord {
  pageNum?: number
  pageSize?: number
}

export const normalizePageResult = <T extends ApiRecord>(
  data: unknown,
  fallbackPageNum = 1,
  fallbackPageSize = 10
): NormalizedPage<T> => {
  if (Array.isArray(data)) {
    return {
      records: data as T[],
      total: data.length,
      pageNum: fallbackPageNum,
      pageSize: fallbackPageSize
    }
  }

  const record = (data || {}) as ApiRecord
  const records =
    (Array.isArray(record.records) && record.records) ||
    (Array.isArray(record.rows) && record.rows) ||
    (Array.isArray(record.list) && record.list) ||
    []

  return {
    records: records as T[],
    total: Number(record.total ?? records.length ?? 0),
    pageNum: Number(record.pageNum ?? record.current ?? fallbackPageNum),
    pageSize: Number(record.pageSize ?? record.size ?? fallbackPageSize)
  }
}

export const listPage = async <T extends ApiRecord = ApiRecord>(path: string, params?: ListParams) =>
  normalizePageResult<T>(
    await request.get(path, { params }),
    Number(params?.pageNum ?? 1),
    Number(params?.pageSize ?? 10)
  )

export const createRecord = (path: string, data: ApiRecord) =>
  request.post(path, data)

export const updateRecord = (path: string, data: ApiRecord, id?: string | number, mode: 'body' | 'path' = 'body') =>
  mode === 'path' && id != null ? request.put(`${path}/${id}`, data) : request.put(path, data)

export const deleteRecords = (path: string, ids: Array<string | number>, mode: 'joined' | 'single' = 'joined') =>
  mode === 'single'
    ? Promise.all(ids.map((id) => request.delete(`${path}/${id}`)))
    : request.delete(`${path}/${ids.join(',')}`)

export const runRecordAction = (
  path: string,
  method: 'post' | 'put' | 'delete' = 'post',
  data?: ApiRecord | null
) => {
  if (method === 'put') return request.put(path, data ?? undefined)
  if (method === 'delete') return request.delete(path)
  return request.post(path, data ?? undefined)
}
