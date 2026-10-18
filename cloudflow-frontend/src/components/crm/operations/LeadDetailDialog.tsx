import React, { useEffect, useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { DetailFieldGrid } from '@/components/common/DetailDialog';
import { useAuth } from '@/context/AuthContext';
import { useDict } from '@/hooks/useDict';
import { crmApi, type CrmLead } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { ActivityBusinessButton } from './ActivityBusinessButton';
import { labelOf, qualificationStatuses } from './OperationsKit';

export function LeadDetailDialog({ leadId, onClose }: { leadId: number; onClose: () => void }) {
  const { user } = useAuth();
  const status = useDict('crm_lead_status');
  const scope = JSON.stringify([user?.tenantId, user?.id, user?.permissions, leadId]);
  const [state, setState] = useState<{ scope: string; lead?: CrmLead; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(undefined);
    void crmApi.getLead(leadId, controller.signal).then(lead => {
      if (controller.signal.aborted) return;
      if (!lead || Number(lead.leadId) !== leadId) throw new Error('线索不存在或无权查看。');
      setState({ scope, lead });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ scope, error: getErrorMessage(error, '线索详情无法加载，请重试。') });
    });
    return () => controller.abort();
  }, [scope, leadId, revision]);
  const current = state?.scope === scope ? state : undefined;
  const lead = current?.lead;
  return <BaseDialog open title="线索详情" width="wide" onClose={onClose}
    footer={<Button variant="outline" className="min-h-11" onClick={onClose}>关闭</Button>}>
    {!current && <p role="status">正在读取线索详情…</p>}
    {current?.error && <div role="alert"><p>{current.error}</p><Button className="mt-3 min-h-11" variant="outline" onClick={() => setRevision(value => value + 1)}>重试</Button></div>}
    {lead && <div className="space-y-4"><ActivityBusinessButton bizType="LEAD" bizId={lead.leadId} businessName={lead.leadName} customerId={lead.convertedCustomerId} />
      <DetailFieldGrid items={[
        { label: '线索名称', value: lead.leadName }, { label: '公司名称', value: lead.companyName },
        { label: '联系人', value: lead.contactName }, { label: '手机号', value: lead.mobile },
        { label: '联系电话', value: lead.phone }, { label: '邮箱', value: lead.email },
        { label: '负责人', value: lead.ownerName }, { label: '部门', value: lead.deptName },
        { label: '状态', value: status.getLabel(lead.status || '') || lead.status }, { label: '资质', value: labelOf(qualificationStatuses, lead.qualificationStatus) },
        { label: '来源', value: lead.source }, { label: '行业', value: lead.industry },
        { label: '最近跟进', value: formatDateTimeDisplay(lead.lastFollowUpTime) }, { label: '下次跟进', value: formatDateTimeDisplay(lead.nextFollowUpTime) },
        { label: '备注', value: lead.remark, wide: true },
      ]} />
    </div>}
  </BaseDialog>;
}
