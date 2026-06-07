import React from 'react';
import {
  createRehabilitation,
  listRehabilitation,
  updateRehabilitation,
  type HrWorkInjuryRehabilitation,
  type HrWorkInjuryRehabilitationPayload,
} from '@/services/api/hr';
import { enumLabel, formatDateValue } from '../hrShared';
import { HrSubRecordCrudPage } from '../components/HrSubRecordCrudPage';

const positionAdjustmentLabel: Record<string, string> = {
  SAME: '原岗位',
  RELIGHTED: '减轻工作',
  CHANGED: '调整岗位',
};

const statusLabel: Record<string, string> = {
  IN_REHAB: '康复中',
  RETURNED: '已返岗',
  UNABLE_RETURN: '无法返岗',
};

export const HrWorkInjuryRehabilitationPage: React.FC = () => (
  <HrSubRecordCrudPage<HrWorkInjuryRehabilitation, HrWorkInjuryRehabilitationPayload>
    parentLabel="工伤记录 ID"
    parentPayloadKey="injuryId"
    api={{ list: listRehabilitation, create: createRehabilitation, update: updateRehabilitation }}
    createLabel="新增康复"
    createTitle="新增康复记录"
    editTitle="编辑康复记录"
    columns={[
      { header: '状态', render: (r) => enumLabel(statusLabel, r.status) },
      { header: '返岗日', className: 'px-4 py-3 text-xs', render: (r) => formatDateValue(r.returnDate) },
      { header: '岗位调整', render: (r) => enumLabel(positionAdjustmentLabel, r.positionAdjustment) },
      { header: '新岗位 ID', render: (r) => r.newPositionId ?? '-' },
      { header: '下次随访', className: 'px-4 py-3 text-xs', render: (r) => formatDateValue(r.followUpAt) },
      { header: '能力评估', className: 'px-4 py-3 max-w-[12rem] truncate text-xs', render: (r) => r.abilityAssessment ?? '-' },
    ]}
    emptyForm={{
      returnDate: '',
      positionAdjustment: 'SAME',
      newPositionId: undefined,
      abilityAssessment: '',
      followUpAt: '',
      status: 'IN_REHAB',
    }}
    toEditForm={(r) => ({
      returnDate: r.returnDate,
      positionAdjustment: r.positionAdjustment,
      newPositionId: r.newPositionId,
      abilityAssessment: r.abilityAssessment,
      followUpAt: r.followUpAt,
      status: r.status,
    })}
    fields={[
      { type: 'select', key: 'status', label: '状态', options: statusLabel },
      { type: 'date', key: 'returnDate', label: '返岗日' },
      { type: 'select', key: 'positionAdjustment', label: '岗位调整', options: positionAdjustmentLabel },
      { type: 'number', key: 'newPositionId', label: '新岗位 ID' },
      { type: 'datetime', key: 'followUpAt', label: '下次随访时间', colSpan: 2 },
      { type: 'textarea', key: 'abilityAssessment', label: '能力评估' },
    ]}
  />
);

export default HrWorkInjuryRehabilitationPage;
