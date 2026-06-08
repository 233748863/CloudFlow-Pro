import React from 'react';
import {
  createRehabilitation,
  listRehabilitation,
  updateRehabilitation,
  type HrWorkInjuryRehabilitation,
  type HrWorkInjuryRehabilitationPayload,
} from '@/services/api/hr';
import { formatDateValue } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { HrSubRecordCrudPage } from '../components/HrSubRecordCrudPage';

export const HrWorkInjuryRehabilitationPage: React.FC = () => (
  <HrSubRecordCrudPage<HrWorkInjuryRehabilitation, HrWorkInjuryRehabilitationPayload>
    parentLabel="工伤记录 ID"
    parentPayloadKey="injuryId"
    api={{ list: listRehabilitation, create: createRehabilitation, update: updateRehabilitation }}
    createLabel="新增康复"
    createTitle="新增康复记录"
    editTitle="编辑康复记录"
    columns={[
      { header: '状态', render: (r) => <DictLabel dictType="hr_work_injury_rehab_status" value={r.status} fallback="-" /> },
      { header: '返岗日', className: 'px-4 py-3 text-xs', render: (r) => formatDateValue(r.returnDate) },
      { header: '岗位调整', render: (r) => <DictLabel dictType="hr_work_injury_rehab_position" value={r.positionAdjustment} fallback="-" /> },
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
      { type: 'select', key: 'status', label: '状态', dictType: 'hr_work_injury_rehab_status' },
      { type: 'date', key: 'returnDate', label: '返岗日' },
      { type: 'select', key: 'positionAdjustment', label: '岗位调整', dictType: 'hr_work_injury_rehab_position' },
      { type: 'number', key: 'newPositionId', label: '新岗位 ID' },
      { type: 'datetime', key: 'followUpAt', label: '下次随访时间', colSpan: 2 },
      { type: 'textarea', key: 'abilityAssessment', label: '能力评估' },
    ]}
  />
);

export default HrWorkInjuryRehabilitationPage;
