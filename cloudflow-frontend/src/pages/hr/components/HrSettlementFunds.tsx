import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { Button } from '@/components/common';
import { downloadBlob } from '@/utils/download';
import { finalSettlementApi, type FinalSettlement, type SettlementProof } from '@/services/api/hr/finalSettlements';
import { Hr09Error, shanghaiDate } from '@/services/api/hr/hr09Model';
import { Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Value, dateTimeText, useHr09Mutation } from './Hr09Shared';

export type SettlementFundsAction = 'CONFIRM' | 'RECEIPT' | 'CLOSE';
const directionText = { PAYMENT: '向员工支付', RECEIPT: '向员工收取', NETTING: '净额抵销' };
const statusText = { DRAFT: '待确认结算', CONFIRMED: '已确认，待完成收付', PAID: '已结清，待核对资产关闭', CLOSED: '已关闭' };

export function SettlementFundsProgress({ row }: { row: FinalSettlement }) {
  const download = useHr09Mutation();
  return <section aria-label="收付进度" className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3">
    <h3 className="font-medium text-cf-title">收付进度</h3>
    <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="收付状态">{statusText[row.status]}</Hr09Value>
      <Hr09Value label="收付方向">{directionText[row.funds.direction]} · {new Decimal(row.netAmount).abs().toFixed(2)} 元</Hr09Value>
      {row.funds.confirmedTime && <Hr09Value label="结算确认时间">{dateTimeText(row.funds.confirmedTime)}</Hr09Value>}
      {row.funds.paymentRequestId && <Hr09Value label="付款申请编号">{row.funds.paymentRequestId}</Hr09Value>}
      {row.funds.actualDate && <Hr09Value label="实际收付日期">{row.funds.actualDate}</Hr09Value>}
      {row.funds.paidTime && <Hr09Value label="结清确认时间">{dateTimeText(row.funds.paidTime)}</Hr09Value>}
      {row.funds.closedTime && <Hr09Value label="关闭时间">{dateTimeText(row.funds.closedTime)}</Hr09Value>}
    </dl>
    {row.status === 'CONFIRMED' && <Hr09Notice>{row.funds.direction === 'PAYMENT'
      ? row.funds.paymentRequestId ? '付款申请已建立。请由财务在付款管理中核对实际付款；完成后本单同步入账。' : '正在建立付款申请，请重新读取进度。'
      : row.funds.direction === 'RECEIPT' ? '请由财务核对实际到账金额，上传收款凭据并登记实际日期。' : '正在处理净额抵销，请重新读取进度。'}</Hr09Notice>}
    {row.funds.proofFileId && <Button type="button" variant="outline" disabled={download.busy} onClick={() => void download.run(async () => {
      const blob = await finalSettlementApi.downloadProof(row); const extension = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : 'jpg';
      downloadBlob(blob, `结算收款凭据-${row.settlementNo}.${extension}`);
    })}>下载收款凭据</Button>}
    <Hr09ErrorNotice error={download.error} />
  </section>;
}

export function SettlementFundsDialog({ row, action, onClose, onChanged }: {
  row: FinalSettlement; action: SettlementFundsAction; onClose: () => void; onChanged: () => void;
}) {
  const [file, setFile] = useState<File>(); const [proof, setProof] = useState<SettlementProof>();
  const [actualDate, setActualDate] = useState(shanghaiDate()); const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState<FinalSettlement>(); const upload = useHr09Mutation(); const recovery = useHr09Mutation();
  const receipt = action === 'RECEIPT'; const closing = action === 'CLOSE';
  const recover = () => void recovery.run(async () => { setSaved(await finalSettlementApi.detail(row.settlementId)); });
  return <Hr09FormDialog title={receipt ? '登记结算实际收款' : closing ? '核对并关闭结算' : '确认离职结算'} panelClassName="final-settlements"
    description={receipt ? '核对本单全部应收金额实际到账后确认。上传凭据后仍须确认收款。' : closing ? '核对全部来源已经入账，且资产归还或损失处理已经完成。' : '按财务已审批的金额确认，确认后金额只读。'}
    submitText={receipt ? '确认实际收款' : closing ? '核对并关闭' : '确认结算'} successText={receipt ? '实际收款及来源入账已完成' : closing ? '结算已关闭' : '结算已确认'}
    confirmation={receipt ? '我已核对本单全部应收金额实际到账，凭据及日期真实完整。' : closing ? '我已核对收付与资产处理结果。' : `我已核对财务审批及${directionText[row.funds.direction]}金额，按原核定确认。`}
    blocked={uncertain || upload.busy || recovery.busy || receipt && !proof} onClose={() => { if (!upload.busy && !recovery.busy) onClose(); }}
    onReload={recover} onSubmit={async () => {
      try {
        if (receipt) { if (!proof) throw new Hr09Error('请先上传收款凭据。', 400); await finalSettlementApi.receipt(row, proof.fileId, actualDate); }
        else if (closing) await finalSettlementApi.close(row); else await finalSettlementApi.confirm(row);
        onChanged();
      } catch (error) {
        if (!(error instanceof Hr09Error) || error.status == null || error.status === 409 || error.status >= 500) setUncertain(true);
        throw error;
      }
    }}>
    <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="员工">{row.employeeName}</Hr09Value><Hr09Value label="本次方向与金额">{directionText[row.funds.direction]} · {new Decimal(row.netAmount).abs().toFixed(2)} 元</Hr09Value></dl>
    {receipt && <fieldset disabled={uncertain || upload.busy || recovery.busy} className="min-w-0 space-y-3">
      <Hr09Input label="实际收款日期" type="date" value={actualDate} min={row.funds.confirmedTime?.slice(0, 10)} max={shanghaiDate()} onChange={event => setActualDate(event.target.value)} />
      <Hr09Input label="收款凭据（PDF、PNG、JPEG，最多10MiB）" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={event => { setFile(event.target.files?.[0]); setProof(undefined); }} />
      {file && <p className="break-all text-sm text-cf-body">已选择：{file.name}</p>}
      <Button type="button" variant="outline" disabled={!file || Boolean(proof)} onClick={() => void upload.run(async () => {
        if (file) setProof(await finalSettlementApi.uploadProof(row, file));
      })}>{upload.busy ? '正在上传…' : '上传收款凭据'}</Button>
      {proof && <p role="status" className="break-all text-sm text-cf-body">凭据已上传：{proof.fileName}</p>}
      <Hr09ErrorNotice error={upload.error} />
    </fieldset>}
    {uncertain && <Hr09Notice>操作结果尚待核对，输入已保留。请先读取原单，核对收付状态。<div className="mt-2"><Button type="button" variant="outline" disabled={recovery.busy} onClick={recover}>读取已保存结果</Button></div></Hr09Notice>}
    {saved && <section aria-label="已保存收付结果" className="space-y-3"><SettlementFundsProgress row={saved} /><Button type="button" variant="outline" onClick={() => { onClose(); onChanged(); }}>返回最新结算详情</Button></section>}
    <Hr09ErrorNotice error={recovery.error} />
  </Hr09FormDialog>;
}
