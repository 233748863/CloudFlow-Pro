import React from 'react';
import {
  createMediation,
  listMediations,
  updateMediation,
  type HrDisputeMediation,
  type HrDisputeMediationPayload,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, formatDateValue } from '../hrShared';
import { HrSubRecordCrudPage } from '../components/HrSubRecordCrudPage';

const resultLabel: Record<string, string> = {
  SUCCESS: '调解成功',
  PARTIAL: '部分达成',
  FAILED: '调解失败',
};

export const HrDisputeMediationPage: React.FC = () => (
  <HrSubRecordCrudPage<HrDisputeMediation, HrDisputeMediationPayload>
    parentLabel="争议 ID"
    parentPayloadKey="disputeId"
    api={{ list: listMediations, create: createMediation, update: updateMediation }}
    createLabel="新增调解"
    createTitle="新增调解"
    editTitle="编辑调解"
    columns={[
      { header: '调解日期', className: 'px-4 py-3 text-xs', render: (r) => formatDateValue(r.mediationDate) },
      { header: '调解员', render: (r) => r.mediatorId ?? '-' },
      { header: '地点', className: 'px-4 py-3 max-w-[10rem] truncate text-xs', render: (r) => r.location ?? '-' },
      { header: '结果', render: (r) => enumLabel(resultLabel, r.result) },
      { header: '协议', render: (r) => r.agreementUrl ? <a href={r.agreementUrl} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline text-xs">查看</a> : '-' },
      { header: '签订时间', className: 'px-4 py-3 text-xs', render: (r) => formatDateTimeValue(r.signedAt) },
    ]}
    emptyForm={{
      mediatorId: undefined,
      mediationDate: '',
      location: '',
      processSummary: '',
      result: 'SUCCESS',
      agreementUrl: '',
    }}
    toEditForm={(r) => ({
      mediatorId: r.mediatorId,
      mediationDate: r.mediationDate,
      location: r.location,
      processSummary: r.processSummary,
      result: r.result,
      agreementUrl: r.agreementUrl,
    })}
    fields={[
      { type: 'user', key: 'mediatorId', label: '调解员' },
      { type: 'date', key: 'mediationDate', label: '调解日期' },
      { type: 'text', key: 'location', label: '地点', colSpan: 2 },
      { type: 'select', key: 'result', label: '调解结果', options: resultLabel },
      { type: 'text', key: 'agreementUrl', label: '协议 URL' },
      { type: 'textarea', key: 'processSummary', label: '过程纪要', rows: 5 },
    ]}
  />
);

export default HrDisputeMediationPage;
