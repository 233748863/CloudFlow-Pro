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
  TableActionHead,
  TableHead,
  TableHeader,
  TableRowActions,
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
      <table className="w-full min-w-[900px]">
        <TableHeader>
          <tr>
            <TableHead>客户</TableHead>
            <TableHead>健康度</TableHead>
            <TableHead>联系人 / 跟进</TableHead>
            <TableHead>负责人</TableHead>
            <TableHead>状态</TableHead>
            <TableActionHead>操作</TableActionHead>
          </tr>
        </TableHeader>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {customers.map((item) => {
            const contactCount = contacts.filter((contact) => contact.customerId === item.customerId).length;
            const followCount = followUps.filter((follow) => follow.customerId === item.customerId).length;
            return (
              <tr key={item.customerId}>
                <td className="px-4 py-3 text-sm">
                  <div>{item.customerName}</div>
                  <div className="text-xs text-slate-500">{item.customerCode || '-'} / {item.customerTags || '-'}</div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div>{renderHealthBadge(item.healthLevel)}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.healthReason || '-'}</div>
                </td>
                <td className="px-4 py-3 text-sm">{contactCount} / {followCount}</td>
                <td className="px-4 py-3 text-sm">{item.ownerName || '-'}</td>
                <td className="px-4 py-3 text-sm">{renderStatus(item.status)}</td>
                <td className="px-4 py-3 text-right">
                  <TableRowActions
                    align="end"
                    overflowLabel="更多"
                    actions={[
                      { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                      { label: '编辑客户', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'customer', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:customer:edit' },
                      { label: '释放审批', icon: <RefreshCcw size={14} />, onClick: () => { setReleaseCustomer(item); setReleaseReason(''); }, semantic: 'disable', hidden: item.poolFlag === '1', permissionKey: 'crm:approval:customer-claim' },
                      { label: '分级审批', icon: <UserRound size={14} />, onClick: () => { setLevelCustomer(item); setLevelAction('LEVEL_UP'); setTargetLevel(item.levelCode || ''); setLevelReason(''); }, semantic: 'custom', permissionKey: 'crm:approval:customer-level' },
                      { label: '新增联系人', icon: <UserRound size={14} />, onClick: () => openDialog({ type: 'contact', item: { ...emptyContact, customerId: item.customerId! } }), semantic: 'custom', permissionKey: 'crm:contact:add' },
                      { label: '新增跟进', icon: <RefreshCcw size={14} />, onClick: () => openDialog({ type: 'followUp', item: { ...emptyFollowUp, customerId: item.customerId! } }), semantic: 'custom', permissionKey: 'crm:follow-up:add' },
                    ]}
                  />
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
