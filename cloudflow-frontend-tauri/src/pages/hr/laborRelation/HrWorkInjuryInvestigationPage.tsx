import React from 'react';
import {
  createInvestigation,
  listInvestigations,
  updateInvestigation,
  type HrWorkInjuryInvestigation,
  type HrWorkInjuryInvestigationPayload,
} from '@/services/api/hr';
import { formatDateValue } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { HrSubRecordCrudPage } from '../components/HrSubRecordCrudPage';

export const HrWorkInjuryInvestigationPage: React.FC = () => (
  <HrSubRecordCrudPage<HrWorkInjuryInvestigation, HrWorkInjuryInvestigationPayload>
    parentLabel="工伤记录 ID"
    parentPayloadKey="injuryId"
    api={{ list: listInvestigations, create: createInvestigation, update: updateInvestigation }}
    createLabel="新建调查"
    createTitle="新建调查"
    editTitle="编辑调查"
    columns={[
      { header: '调查日期', className: 'px-4 py-3 text-xs', render: (r) => formatDateValue(r.investigationDate) },
      { header: '调查员', render: (r) => r.investigatorId ?? '-' },
      { header: '责任类型', render: (r) => <DictLabel dictType="hr_work_injury_responsibility" value={r.responsibilityType} fallback="-" /> },
      { header: '结论', className: 'px-4 py-3 max-w-[20rem] truncate text-xs', render: (r) => r.conclusion ?? '-' },
    ]}
    emptyForm={{
      investigatorId: undefined,
      investigationDate: '',
      witnessStatements: '',
      conclusion: '',
      responsibilityType: 'WORK_RELATED',
    }}
    toEditForm={(r) => ({
      investigatorId: r.investigatorId,
      investigationDate: r.investigationDate,
      witnessStatements: r.witnessStatements,
      conclusion: r.conclusion,
      responsibilityType: r.responsibilityType,
    })}
    fields={[
      { type: 'user', key: 'investigatorId', label: '调查员' },
      { type: 'date', key: 'investigationDate', label: '调查日期' },
      { type: 'select', key: 'responsibilityType', label: '责任类型', colSpan: 2, dictType: 'hr_work_injury_responsibility' },
      { type: 'textarea', key: 'witnessStatements', label: '证人证言' },
      { type: 'textarea', key: 'conclusion', label: '调查结论' },
    ]}
  />
);

export default HrWorkInjuryInvestigationPage;
