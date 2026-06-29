import React, { useState } from 'react';
import { toast } from 'sonner';
import { Eye, Handshake, RefreshCcw, UserRound } from 'lucide-react';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { crmApi, CrmCustomer } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { useCrmManagement } from './store';
import { emptyContact, emptyFollowUp } from './constants';
import { renderHealthBadge, renderStatus } from './helpers';

export const CustomerTab: React.FC = () => {
  const { customers, contacts, followUps, load, openDialog, openCustomerWorkspace } = useCrmManagement();
  const [releaseCustomer, setReleaseCustomer] = useState<CrmCustomer | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [levelCustomer, setLevelCustomer] = useState<CrmCustomer | null>(null);
  const [levelAction, setLevelAction] = useState<'LEVEL_UP' | 'LEVEL_DOWN'>('LEVEL_UP');
  const [targetLevel, setTargetLevel] = useState('');
  const [levelReason, setLevelReason] = useState('');

  const submitRelease = async () => {
    if (!releaseCustomer?.customerId) {
      return;
    }
    try {
      await crmApi.submitCustomerClaim({
        customerId: releaseCustomer.customerId,
        action: 'RELEASE',
        remark: releaseReason.trim() || undefined,
      });
      toast.success('已提交释放审批');
      setReleaseCustomer(null);
      setReleaseReason('');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交释放审批失败'));
    }
  };

  const submitLevelChange = async () => {
    if (!levelCustomer?.customerId || !targetLevel.trim()) {
      toast.error('请填写目标等级');
      return;
    }
    try {
      await crmApi.submitCustomerLevelChange({
        customerId: levelCustomer.customerId,
        action: levelAction,
        targetLevel: targetLevel.trim(),
        remark: levelReason.trim() || undefined,
      });
      toast.success('已提交客户分级审批');
      setLevelCustomer(null);
      setLevelAction('LEVEL_UP');
      setTargetLevel('');
      setLevelReason('');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交客户分级审批失败'));
    }
  };

  return (
    <>
      <table className="unity-data-table admin-source-table admin-crm-table min-w-[900px]">
        <thead>
          <tr>
            <th>客户</th>
            <th>健康度</th>
            <th>联系人 / 跟进</th>
            <th>负责人</th>
            <th>状态</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((item) => {
            const contactCount = contacts.filter((contact) => contact.customerId === item.customerId).length;
            const followCount = followUps.filter((follow) => follow.customerId === item.customerId).length;
            return (
              <tr key={item.customerId}>
                <td>
                  <strong>{item.customerName}</strong>
                  <small>{item.customerCode || '-'} / {item.customerTags || '-'}</small>
                </td>
                <td>
                  <div>{renderHealthBadge(item.healthLevel)}</div>
                  <small>{item.healthReason || '-'}</small>
                </td>
                <td>{contactCount} / {followCount}</td>
                <td>{item.ownerName || '-'}</td>
                <td>{renderStatus(item.status)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" title="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Eye size={15} /></button>
                    <button type="button" title="编辑客户" onClick={() => openDialog({ type: 'customer', item })}><Handshake size={15} /></button>
                    {item.poolFlag !== '1' ? <button type="button" title="释放审批" onClick={() => { setReleaseCustomer(item); setReleaseReason(''); }}><RefreshCcw size={15} /></button> : null}
                    <button type="button" title="分级审批" onClick={() => { setLevelCustomer(item); setLevelAction('LEVEL_UP'); setTargetLevel(item.levelCode || ''); setLevelReason(''); }}><UserRound size={15} /></button>
                    <button type="button" title="新增联系人" onClick={() => openDialog({ type: 'contact', item: { ...emptyContact, customerId: item.customerId! } })}><UserRound size={15} /></button>
                    <button type="button" title="新增跟进" onClick={() => openDialog({ type: 'followUp', item: { ...emptyFollowUp, customerId: item.customerId! } })}><RefreshCcw size={15} /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <BaseDialog
        open={Boolean(releaseCustomer)}
        title={`释放客户审批 - ${releaseCustomer?.customerName || ''}`}
        onClose={() => setReleaseCustomer(null)}
        width="normal"
        footer={
          <>
            <Button variant="outline" onClick={() => setReleaseCustomer(null)}>取消</Button>
            <Button onClick={() => void submitRelease()}>提交审批</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="text-sm text-slate-500">
            当前负责人：{releaseCustomer?.ownerName || '-'}；当前等级：{releaseCustomer?.levelCode || '-'}。
          </div>
          <div>
            <Label>释放原因</Label>
            <Textarea rows={4} value={releaseReason} onChange={(e) => setReleaseReason(e.target.value)} placeholder="例如：长期无跟进，申请释放到公海" />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(levelCustomer)}
        title={`客户分级审批 - ${levelCustomer?.customerName || ''}`}
        onClose={() => setLevelCustomer(null)}
        width="normal"
        footer={
          <>
            <Button variant="outline" onClick={() => setLevelCustomer(null)}>取消</Button>
            <Button onClick={() => void submitLevelChange()}>提交审批</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="text-sm text-slate-500">当前等级：{levelCustomer?.levelCode || '-'}</div>
          <div>
            <Label>动作</Label>
            <Select value={levelAction} onValueChange={(value) => setLevelAction(value as 'LEVEL_UP' | 'LEVEL_DOWN')}>
              <SelectTrigger><SelectValue placeholder="选择动作" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LEVEL_UP">升级</SelectItem>
                <SelectItem value="LEVEL_DOWN">降级</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>目标等级</Label>
            <Input value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} placeholder="例如：A / VIP / KEY" />
          </div>
          <div>
            <Label>变更原因</Label>
            <Textarea rows={4} value={levelReason} onChange={(e) => setLevelReason(e.target.value)} placeholder="例如：年度签约额达标，申请升级为重点客户" />
          </div>
        </div>
      </BaseDialog>
    </>
  );
};
