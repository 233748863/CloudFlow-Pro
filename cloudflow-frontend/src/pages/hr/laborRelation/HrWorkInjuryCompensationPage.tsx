import React from 'react';
import { toast } from 'sonner';
import {
  createCompensation,
  listCompensations,
  payCompensation,
  updateCompensation,
  type HrWorkInjuryCompensation,
  type HrWorkInjuryCompensationPayload,
} from '@/services/api/hr';
import { formatDateTimeValue, formatMoneyValue, hasWorkflowStatus } from '../hrShared';
import { getErrorMessage } from '@/utils/errorMessage';
import { DictLabel } from '@/components/common/DictLabel';
import { HrSubRecordCrudPage } from '../components/HrSubRecordCrudPage';

export const HrWorkInjuryCompensationPage: React.FC = () => (
  <HrSubRecordCrudPage<HrWorkInjuryCompensation, HrWorkInjuryCompensationPayload>
    parentLabel="工伤记录 ID"
    parentPayloadKey="injuryId"
    api={{ list: listCompensations, create: createCompensation, update: updateCompensation }}
    createLabel="新增赔偿项"
    createTitle="新增赔偿项"
    editTitle="编辑赔偿项"
    columns={[
      { header: '赔偿项', render: (r) => <DictLabel dictType="hr_work_injury_comp_item" value={r.itemType} fallback="-" /> },
      { header: '金额', render: (r) => formatMoneyValue(r.amount) },
      { header: '状态', render: (r) => <DictLabel dictType="hr_work_injury_comp_status" value={r.paymentStatus} fallback="-" /> },
      { header: '支付时间', className: 'px-4 py-3 text-xs', render: (r) => formatDateTimeValue(r.paidAt) },
      { header: '备注', className: 'px-4 py-3 max-w-[12rem] truncate text-xs', render: (r) => r.remark ?? '-' },
    ]}
    emptyForm={{
      itemType: 'MEDICAL',
      amount: undefined,
      paymentStatus: 'PLANNED',
      bankAccount: '',
      remark: '',
    }}
    toEditForm={(r) => ({
      itemType: r.itemType,
      amount: r.amount,
      paymentStatus: r.paymentStatus,
      bankAccount: r.bankAccount,
      remark: r.remark,
    })}
    fields={[
      { type: 'select', key: 'itemType', label: '赔偿项', dictType: 'hr_work_injury_comp_item' },
      { type: 'number', key: 'amount', label: '金额' },
      { type: 'text', key: 'bankAccount', label: '银行账号(加密)', colSpan: 2 },
      { type: 'textarea', key: 'remark', label: '备注', rows: 2 },
    ]}
    extraActions={(row, injuryId, reload) =>
      hasWorkflowStatus(row.paymentStatus, 'PLANNED')
        ? [{
            key: 'pay',
            semantic: 'confirm',
            label: '标记已支付',
            onClick: async () => {
              try {
                await payCompensation(injuryId, row.id);
                toast.success('已标记支付');
                reload();
              } catch (error) {
                toast.error(getErrorMessage(error, '操作失败'));
              }
            },
          }]
        : []
    }
  />
);

export default HrWorkInjuryCompensationPage;
