import request from './request';
import type { FinanceFile, FinanceKind, FinancePublication } from '@/services/portalFinanceTypes';

const path = (kind: FinanceKind, id: string | number) => `/${kind === 'RECEIVABLE' ? 'crm/receivable' : 'oa/invoice'}/${encodeURIComponent(id)}/portal-publication`;
export const financePublicationApi = {
  read: (kind: FinanceKind, id: string | number) => request.get(path(kind, id)) as Promise<FinancePublication>,
  confirm: (kind: FinanceKind, id: string | number, data: { version: number; publish: boolean; fileIds: string[] }) =>
    request.put(path(kind, id), data) as Promise<FinancePublication>,
  upload: (kind: FinanceKind, id: string | number, file: File) => {
    const data = new FormData(); data.append('file', file);
    return request.post(`${path(kind, id)}/files`, data) as Promise<FinanceFile>;
  },
};
