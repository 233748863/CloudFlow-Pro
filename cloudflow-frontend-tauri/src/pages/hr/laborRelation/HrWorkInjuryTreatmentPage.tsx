import React from 'react';
import {
  createTreatment,
  listTreatments,
  updateTreatment,
  type HrWorkInjuryTreatment,
  type HrWorkInjuryTreatmentPayload,
} from '@/services/api/hr';
import { formatDateValue, formatMoneyValue } from '../hrShared';
import { HrSubRecordCrudPage } from '../components/HrSubRecordCrudPage';

export const HrWorkInjuryTreatmentPage: React.FC = () => (
  <HrSubRecordCrudPage<HrWorkInjuryTreatment, HrWorkInjuryTreatmentPayload>
    parentLabel="工伤记录 ID"
    parentPayloadKey="injuryId"
    api={{ list: listTreatments, create: createTreatment, update: updateTreatment }}
    createLabel="新增医疗"
    createTitle="新增医疗记录"
    editTitle="编辑医疗记录"
    columns={[
      { header: '医院', className: 'px-4 py-3 text-sm font-medium', render: (r) => r.hospitalName ?? '-' },
      { header: '入院 / 出院', className: 'px-4 py-3 text-xs', render: (r) => `${formatDateValue(r.admitDate)} ~ ${formatDateValue(r.dischargeDate)}` },
      { header: '总费用', render: (r) => formatMoneyValue(r.totalCost) },
      { header: '保险支付', render: (r) => formatMoneyValue(r.insuranceCovered) },
      { header: '自费', render: (r) => formatMoneyValue(r.selfPaid) },
      { header: '诊断', className: 'px-4 py-3 max-w-[12rem] truncate text-xs', render: (r) => r.diagnosis ?? '-' },
    ]}
    emptyForm={{
      hospitalName: '',
      admitDate: '',
      dischargeDate: '',
      totalCost: undefined,
      insuranceCovered: undefined,
      selfPaid: undefined,
      diagnosis: '',
      treatmentSummary: '',
    }}
    toEditForm={(r) => ({
      hospitalName: r.hospitalName,
      admitDate: r.admitDate,
      dischargeDate: r.dischargeDate,
      totalCost: r.totalCost,
      insuranceCovered: r.insuranceCovered,
      selfPaid: r.selfPaid,
      diagnosis: r.diagnosis,
      treatmentSummary: r.treatmentSummary,
    })}
    fields={[
      { type: 'text', key: 'hospitalName', label: '医院', colSpan: 2 },
      { type: 'date', key: 'admitDate', label: '入院日期' },
      { type: 'date', key: 'dischargeDate', label: '出院日期' },
      { type: 'number', key: 'totalCost', label: '总费用' },
      { type: 'number', key: 'insuranceCovered', label: '保险报销' },
      { type: 'number', key: 'selfPaid', label: '自费' },
      { type: 'textarea', key: 'diagnosis', label: '诊断(敏感字段加密存储)', rows: 2 },
      { type: 'textarea', key: 'treatmentSummary', label: '治疗摘要', rows: 3 },
    ]}
  />
);

export default HrWorkInjuryTreatmentPage;
