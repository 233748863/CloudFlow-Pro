import React, { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { BaseDialog, Button, Input, Pagination } from '@/components/common';
import { listPrintRecords } from '@/services/api/print';
import type { PrintRecord, PrintRecordQuery } from '@/services/api/print';
import { InfrastructureField, InfrastructureSelect, InfrastructureTableStateRow } from '../_components/InfrastructurePrimitives';
import { useInfrastructurePage } from '../_components/useInfrastructurePage';

export function PrintRecordsDialog({ onClose, bizOptions }: { onClose: () => void; bizOptions: { value: string; label: string }[] }) {
  const page = useInfrastructurePage<PrintRecord, PrintRecordQuery>(listPrintRecords, { pageNum: 1, pageSize: 10 });
  const [bizType, setBizType] = useState('ALL');
  const [bizId, setBizId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  return <BaseDialog open title="打印记录" description="查询当前租户已成功生成的业务打印记录。" width="extra-wide" onClose={onClose} footer={<Button className="min-h-11" variant="outline" onClick={onClose}>关闭</Button>}>
    <div className="space-y-4">
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={event => { event.preventDefault(); page.setQuery(current => ({ ...current, pageNum: 1, bizType: bizType === 'ALL' ? undefined : bizType, bizId: bizId.trim() || undefined, operatorId: operatorId.trim() || undefined })); }}>
        <InfrastructureField label="业务类型"><InfrastructureSelect options={[{ value: 'ALL', label: '全部业务' }, ...bizOptions]} value={bizType} onValueChange={setBizType} /></InfrastructureField>
        <InfrastructureField label="业务记录 ID"><Input maxLength={64} value={bizId} onChange={event => setBizId(event.target.value)} /></InfrastructureField>
        <InfrastructureField label="操作人 ID"><Input inputMode="numeric" pattern="[1-9][0-9]{0,18}" maxLength={19} value={operatorId} onChange={event => setOperatorId(event.target.value)} /></InfrastructureField>
        <div className="flex items-end gap-2"><Button className="min-h-11" type="submit" disabled={page.loading}><Search size={16} />查询</Button><Button className="min-h-11 min-w-11" variant="outline" type="button" aria-label="刷新打印记录" disabled={page.loading} onClick={page.refresh}><RefreshCw size={16} /></Button></div>
      </form>
      <div className="admin-horizontal-scroll"><table className="unity-data-table admin-source-table min-w-[850px]">
        <thead><tr>{['业务类型 / ID', '模板编码', '格式', '操作人', '打印时间', '文件大小', '来源 IP'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{page.loading || page.error || page.rows.length === 0 ? <InfrastructureTableStateRow colSpan={7} loading={page.loading} title={page.loading ? '正在加载打印记录' : page.error || '暂无打印记录'} description={page.error ? '点击刷新重试' : '成功生成业务单据后会保存记录'} /> : page.rows.map(row => <tr key={row.recordId}>
          <td><p>{bizOptions.find(option => option.value === row.bizType)?.label || row.bizType}</p><p className="font-mono text-xs text-cf-subtle">{row.bizId}</p></td>
          <td className="font-mono text-xs">{row.templateCode}</td><td>{row.outputFormat === 'EXCEL' ? 'Excel' : row.outputFormat}</td>
          <td><p>{row.operatorName || '-'}</p><p className="text-xs text-cf-subtle">ID: {row.operatorId}</p></td><td>{row.printTime}</td><td>{row.fileSize.toLocaleString()} B</td><td>{row.ipAddress || '-'}</td>
        </tr>)}</tbody>
      </table></div>
      <Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={pageNum => page.setQuery(current => ({ ...current, pageNum }))} onPageSizeChange={pageSize => page.setQuery(current => ({ ...current, pageNum: 1, pageSize }))} />
    </div>
  </BaseDialog>;
}
