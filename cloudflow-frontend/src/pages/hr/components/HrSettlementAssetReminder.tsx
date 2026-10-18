import React, { useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { finalSettlementApi, type AssetReturnReminder, type FinalSettlement, type SettlementItem } from '@/services/api/hr/finalSettlements';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import { Hr09ErrorNotice, Hr09Notice, Hr09State, Hr09Value, dateTimeText, useHr09Mutation, useHr09Resource } from './Hr09Shared';

export function HrSettlementAssetReminder({ row, item, onClose }: { row: FinalSettlement; item: SettlementItem; onClose: () => void }) {
  const [uncertain, setUncertain] = useState(false); const [sent, setSent] = useState<AssetReturnReminder>();
  const mutation = useHr09Mutation();
  const source = useHr09Resource(async signal => {
    const saved = await finalSettlementApi.detail(row.settlementId, signal);
    const currentItem = saved.items.find(value => value.itemId === item.itemId);
    if (!currentItem) throw new Hr09Error('该资产已不在当前结算明细中，请关闭并重新读取结算。');
    const reminder = await finalSettlementApi.assetReminder(saved, currentItem, signal);
    setSent(undefined); setUncertain(false); return { row: saved, item: currentItem, reminder };
  }, [row.settlementId, item.itemId]);
  const observed = sent || source.data?.reminder;
  const busy = mutation.busy || source.loading;
  const blocked = busy || uncertain || Boolean(source.error) || !observed?.canSend || !source.data?.row.canRemindAssets;
  return <BaseDialog open title="资产归还提醒" description={item.itemName} panelClassName="final-settlements" width="wide"
    onClose={() => { if (!busy) onClose(); }} hideCloseButton={busy} closeOnEscape={!busy}
    footer={<div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={source.refresh}>读取最近提醒</Button>
      <Button type="button" disabled={blocked} onClick={() => void mutation.run(async () => {
        if (!source.data || !observed || blocked) return;
        try { setSent(await finalSettlementApi.sendAssetReminder(source.data.row, source.data.item, observed)); }
        catch (error) { setUncertain(true); throw error; }
      })}>发送站内提醒</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>关闭</Button>
    </div>}>
    <div className="space-y-4" aria-busy={busy}>
      <p className="text-sm text-cf-body">由人事手动提醒该员工归还资产。提醒发送至员工的站内消息。</p>
      {source.loading ? <Hr09State loading title="正在核实资产及最近提醒" /> : source.error ? <Hr09State error title="归还提醒读取失败" description={source.error.message} onRetry={source.refresh} /> : observed && <>
        <dl className="grid gap-3 sm:grid-cols-2"><Hr09Value label="接收员工">{source.data?.row.employeeName}</Hr09Value>
          <Hr09Value label="资产编号">{observed.assetCode}</Hr09Value><Hr09Value label="资产名称">{observed.assetName}</Hr09Value></dl>
        {!observed.canSend && <Hr09Notice>{observed.blockedReason}</Hr09Notice>}
        {observed.latest ? <section aria-label="最近归还提醒" className="space-y-3">
          <Hr09Notice>站内提醒已提交</Hr09Notice>
          <dl className="grid gap-3 sm:grid-cols-2"><Hr09Value label="最近提醒时间">{dateTimeText(observed.latest.reminderTime)}</Hr09Value>
            <Hr09Value label="提醒经办人">{observed.latest.operatorName}</Hr09Value></dl><p className="break-words text-sm text-cf-body">{observed.latest.content}</p>
        </section> : <p className="text-sm text-cf-subtle">尚无归还提醒记录。</p>}
      </>}
      {uncertain && <Hr09Notice>发送结果尚待核实，已暂停重复发送。请读取最近提醒后再操作。</Hr09Notice>}
      <Hr09ErrorNotice error={uncertain ? mutation.error : undefined} />
    </div>
  </BaseDialog>;
}
