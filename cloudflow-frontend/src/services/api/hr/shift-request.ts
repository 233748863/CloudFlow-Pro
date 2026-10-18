import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, requireDate, requireId, requireText, requireVersion, shiftDraft, shiftQuery } from './hr09Model';
import { requireCreationKey } from './overtime';
import type { Hr09Page, ReasonVersionDTO, ShiftDraftDTO, ShiftInvitationVO, ShiftOptionsVO, ShiftPreviewVO, ShiftRequestDetailVO, ShiftRequestQuery, ShiftRequestVO, ShiftResponseDTO, VersionDTO } from './hr09Types';

const root = '/hr/attendance/shift-requests';

export const hrShiftRequestApi = {
  list: async (query: ShiftRequestQuery, mine: boolean, signal?: AbortSignal) => hr09Page(await hr09Request<Hr09Page<ShiftRequestVO>>({ method: 'GET', url: `${root}${mine ? '/mine' : ''}`, params: shiftQuery(query, !mine), signal })),
  invitations: async (query: ShiftRequestQuery, signal?: AbortSignal) => hr09Page(await hr09Request<Hr09Page<ShiftInvitationVO>>({ method: 'GET', url: `${root}/invitations`, params: shiftQuery(query, false), signal })),
  detail: (id: string, signal?: AbortSignal) => hr09Request<ShiftRequestDetailVO>({ method: 'GET', url: `${root}/${requireId(id)}`, signal }),
  invitation: (id: string, signal?: AbortSignal) => hr09Request<ShiftInvitationVO>({ method: 'GET', url: `${root}/invitations/${requireId(id)}`, signal }),
  options: (attendanceDate: string, signal?: AbortSignal) => hr09Request<ShiftOptionsVO>({ method: 'GET', url: `${root}/options`, params: { attendanceDate: requireDate(attendanceDate) }, signal }),
  preview: (data: ShiftDraftDTO, signal?: AbortSignal) => hr09Request<ShiftPreviewVO>({ method: 'POST', url: `${root}/preview`, data: shiftDraft(data), signal }),
  create: (data: ShiftDraftDTO, key: string) => hr09Request<ShiftRequestDetailVO>({ method: 'POST', url: root, data: shiftDraft(data), headers: requireCreationKey(key) }),
  update: (id: string, data: ShiftDraftDTO & VersionDTO) => hr09Request<ShiftRequestDetailVO>({ method: 'PUT', url: `${root}/${requireId(id)}`, data: { ...shiftDraft(data), ...requireVersion(data.version) } }),
  remove: (id: string, version: number) => hr09Request<void>({ method: 'DELETE', url: `${root}/${requireId(id)}`, params: requireVersion(version) }),
  submit: (id: string, version: number) => hr09Request<ShiftRequestDetailVO>({ method: 'POST', url: `${root}/${requireId(id)}/submit`, data: requireVersion(version) }),
  cancel: (id: string, data: ReasonVersionDTO) => hr09Request<ShiftRequestDetailVO>({ method: 'POST', url: `${root}/${requireId(id)}/cancel`, data: { ...requireVersion(data.version), reason: requireText(data.reason, '撤回原因', 500) } }),
  respond: (id: string, data: ShiftResponseDTO) => {
    if (!['ACCEPTED', 'DECLINED'].includes(data.decision)) throw new Hr09Error('请选择同意或拒绝。', 400);
    if (data.note && data.note.trim().length > 500) throw new Hr09Error('回应说明不能超过 500 个字符。', 400);
    return hr09Request<ShiftInvitationVO>({ method: 'POST', url: `${root}/${requireId(id)}/respond`, data: { ...requireVersion(data.version), decision: data.decision, note: data.decision === 'DECLINED' ? requireText(data.note || '', '拒绝原因', 500) : data.note?.trim() || undefined } });
  },
  retry: (id: string, data: ReasonVersionDTO) => hr09Request<ShiftRequestDetailVO>({ method: 'POST', url: `${root}/${requireId(id)}/application/retry`, data: { ...requireVersion(data.version), reason: requireText(data.reason, '重试原因', 500) } }),
};
