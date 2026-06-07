import React from 'react';
import {
  createArbitration,
  listArbitrations,
  updateArbitration,
  type HrDisputeArbitration,
  type HrDisputeArbitrationPayload,
} from '@/services/api/hr';
import { formatDateValue, formatMoneyValue } from '../hrShared';
import { HrSubRecordCrudPage } from '../components/HrSubRecordCrudPage';

export const HrDisputeArbitrationPage: React.FC = () => (
  <HrSubRecordCrudPage<HrDisputeArbitration, HrDisputeArbitrationPayload>
    parentLabel="争议 ID"
    parentPayloadKey="disputeId"
    api={{ list: listArbitrations, create: createArbitration, update: updateArbitration }}
    createLabel="新增仲裁"
    createTitle="新增仲裁"
    editTitle="编辑仲裁"
    dialogWidth="wide"
    columns={[
      { header: '仲裁委', className: 'px-4 py-3 text-sm font-medium', render: (r) => r.arbitrationCommittee ?? '-' },
      { header: '案号', className: 'px-4 py-3 font-mono text-xs', render: (r) => r.caseNo ?? '-' },
      { header: '受理日', className: 'px-4 py-3 text-xs', render: (r) => formatDateValue(r.acceptedAt) },
      { header: '裁决号', className: 'px-4 py-3 font-mono text-xs', render: (r) => r.awardNo ?? '-' },
      { header: '裁决结果', className: 'px-4 py-3 max-w-[10rem] truncate text-xs', render: (r) => r.awardResult ?? '-' },
      { header: '裁决金额', render: (r) => formatMoneyValue(r.awardAmount) },
      { header: '生效日', className: 'px-4 py-3 text-xs', render: (r) => formatDateValue(r.effectiveDate) },
      { header: '裁决书', render: (r) => r.awardDocUrl ? <a href={r.awardDocUrl} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline text-xs">查看</a> : '-' },
    ]}
    emptyForm={{
      arbitrationCommittee: '',
      caseNo: '',
      acceptedAt: '',
      awardNo: '',
      awardResult: '',
      awardAmount: undefined,
      effectiveDate: '',
      awardDocUrl: '',
    }}
    toEditForm={(r) => ({
      arbitrationCommittee: r.arbitrationCommittee,
      caseNo: r.caseNo,
      acceptedAt: r.acceptedAt,
      awardNo: r.awardNo,
      awardResult: r.awardResult,
      awardAmount: r.awardAmount,
      effectiveDate: r.effectiveDate,
      awardDocUrl: r.awardDocUrl,
    })}
    fields={[
      { type: 'text', key: 'arbitrationCommittee', label: '仲裁委' },
      { type: 'text', key: 'caseNo', label: '案号' },
      { type: 'date', key: 'acceptedAt', label: '受理日' },
      { type: 'text', key: 'awardNo', label: '裁决号' },
      { type: 'number', key: 'awardAmount', label: '裁决金额' },
      { type: 'date', key: 'effectiveDate', label: '生效日' },
      { type: 'text', key: 'awardDocUrl', label: '裁决书 URL', colSpan: 2 },
      { type: 'textarea', key: 'awardResult', label: '裁决结果(支持 / 部分支持 / 驳回)', rows: 4 },
    ]}
  />
);

export default HrDisputeArbitrationPage;
