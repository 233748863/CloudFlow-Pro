import React, { useState } from 'react';
import { Button } from '@/components/common';
import { oaGet, oaPost, oaDownload, type Comparison, type ComparisonSupplier, type OaPurchaseRfq } from '@/services/api/oaOperations';
import { Section, OpsTable, Metric, money, labelOf, useRemote, useMutation, useAccess } from './OperationsKit';
import { RecordEditor, standings, today } from './RecordEditor';
import './RfqComparisonPanel.css';

interface ComparisonRow {
  key: number;
  label: string;
  cells: React.ReactNode[];
}

function ComparisonRecords({ label, headers, rows }: { label: string; headers: string[]; rows: ComparisonRow[] }) {
  return <section aria-label={label}>
    <div className="rfq-comparison__table"><OpsTable headers={headers} empty={!rows.length}>
      {rows.map(row => <tr key={row.key}>{row.cells.map((cell, index) => <td key={headers[index]}>{cell}</td>)}</tr>)}
    </OpsTable></div>
    <div className="rfq-comparison__cards" role="list">
      {!rows.length && <p className="text-cf-muted">暂无报价</p>}
      {rows.map(row => <article key={row.key} className="rfq-comparison__card" role="listitem" aria-label={row.label}>
        <dl>{row.cells.map((cell, index) => <div className="rfq-comparison__field" key={headers[index]}>
          <dt>{headers[index]}</dt><dd>{cell}</dd>
        </div>)}</dl>
      </article>)}
    </div>
  </section>;
}

function supplierScore(supplier?: ComparisonSupplier) {
  return <span>{supplier?.score == null ? '未评分' : money(supplier.score)} / {labelOf(standings, supplier?.standing)}</span>;
}

export default function RfqComparisonPanel({ rfq, owner, onChanged }: { rfq: OaPurchaseRfq; owner: boolean; onChanged: () => void }) {
  const can = useAccess();
  const mutation = useMutation();
  const [view, setView] = useState<'items' | 'suppliers'>('items');
  const [award, setAward] = useState<{ quotationId: number; supplierName: string; reason: string } | null>(null);
  const closed = !!rfq.quoteDeadline && today() > rfq.quoteDeadline;
  const data = useRemote(() => closed && can('oa:rfq:comparison')
    ? oaGet<Comparison>('/rfq/' + rfq.rfqId + '/comparison') : Promise.resolve(null), [rfq.rfqId, rfq.version, closed]);
  if (!can('oa:rfq:comparison')) return null;
  const canAward = owner && !rfq.instanceId && ['SENT', 'QUOTING', 'COMPARING'].includes(rfq.status || '') && can('oa:rfq:award');
  const suppliers: ComparisonSupplier[] = data.data?.suppliers || [];
  const supplierByQuotation = new Map<number, ComparisonSupplier>(suppliers.map(supplier => [supplier.quotationId, supplier]));
  return <Section title="报价横向比较">
    {!closed ? <p className="oa-ops-warning">报价截止日期当天仍处于保密期，截止后仅采购负责人或指定定标审批人可横向查看。</p>
      : data.error ? <p role="alert" className="oa-ops-warning">{data.error}</p>
        : data.loading ? <p role="status">正在加载比价</p> : <>
          <div className="rfq-comparison__toolbar">
            <div className="rfq-comparison__views" role="group" aria-label="比价视角">
              <Button type="button" variant={view === 'items' ? undefined : 'outline'} aria-pressed={view === 'items'}
                onClick={() => setView('items')}>按物料</Button>
              <Button type="button" variant={view === 'suppliers' ? undefined : 'outline'} aria-pressed={view === 'suppliers'}
                onClick={() => setView('suppliers')}>按供应商</Button>
            </div>
            {can('oa:rfq:export') && <Button variant="outline" disabled={mutation.busy}
              onClick={() => void mutation.run(() => oaDownload('/rfq/' + rfq.rfqId + '/comparison/export', '询价比价.xlsx'), undefined, '')}>导出比价表</Button>}
          </div>
          <div className="grid gap-3 my-4 md:grid-cols-3">{data.data?.summaries.map(item => <Metric key={item.currency}
            label={item.currency + ' 报价区间'} value={money(item.lowestTotal) + ' ~ ' + money(item.highestTotal)}
            detail={'同币种均价 ' + money(item.avgTotal) + '；价差 ' + money(item.priceSpread)} />)}</div>
          {view === 'suppliers' ? <ComparisonRecords label="按供应商比较"
            headers={['供应商', '含税总额 / 币种', '税额', '交期 / 质保', '付款条件', '评分 / 分档', '排名', '操作']}
            rows={suppliers.map(item => ({ key: item.quotationId, label: item.supplierName + ' 总报价', cells: [
              item.supplierName,
              <span className={item.isLowestTotal ? 'oa-ops-positive' : undefined}>{money(item.totalAmount)} {item.currency}{item.isLowestTotal && ' · 最低'}</span>,
              money(item.taxAmount),
              <span>{item.deliveryDays ?? '—'} 天 / {item.warrantyMonths ?? '—'} 月{item.isShortestDelivery && ' · 最短交期'}</span>,
              item.paymentTerms || '—', supplierScore(item), item.rank,
              canAward ? <Button variant="link" onClick={() => setAward({ quotationId: item.quotationId, supplierName: item.supplierName, reason: '' })}>选择定标</Button> : '—',
            ] }))} /> : <div className="rfq-comparison__items" aria-label="按物料比较">
              {data.data?.items.map(item => <div key={item.rfqItemId} className="rfq-comparison__item">
                <h4>{item.itemName} · {item.quantity} {item.unit}{item.spec && ' · ' + item.spec}</h4>
                <ComparisonRecords label={item.itemName + ' 各家报价'}
                  headers={['供应商', '币种', '未税单价', '折扣', '税率', '含税行额', '品牌 / 型号', '交期', '评分 / 分档']}
                  rows={item.quotes.map(quote => ({ key: quote.quotationId, label: quote.supplierName + ' 的' + item.itemName + '报价', cells: [
                    quote.supplierName, quote.currency,
                    <span className={quote.isLowest ? 'oa-ops-positive' : undefined}>{money(quote.unitPrice)}{quote.isLowest && ' · 最低'}</span>,
                    (Number(quote.discountRate) * 100).toFixed(2) + '%', (Number(quote.taxRate) * 100).toFixed(2) + '%',
                    money(quote.grossAmount), [quote.brand, quote.model].filter(Boolean).join(' / ') || '—',
                    <span>{quote.deliveryDays ?? '—'} 天{quote.isShortestDelivery && ' · 最短'}</span>, supplierScore(supplierByQuotation.get(quote.quotationId)),
                  ] }))} />
              </div>)}
              {!data.data?.items.length && <p className="text-cf-muted">暂无可比价物料</p>}
            </div>}
          <p className="mt-3 text-sm text-cf-muted">不同币种分别比较；审批通过后才能形成采购，当前采购账本仅接受人民币成交。</p>
        </>}
    <RecordEditor title="询价定标" value={award} onClose={() => setAward(null)}
      description="所有定标必须填写理由；非同币种最低价的详细理由至少 20 字，审批要求按金额规则执行。"
      onSave={async value => { await oaPost('/rfq/' + rfq.rfqId + '/award', { quotationId: value.quotationId, reason: value.reason }); data.refresh(); onChanged(); }}
      fields={[{ key: 'supplierName', label: '中标供应商', disabled: true },
        { key: 'reason', label: '定标理由', type: 'textarea', maxLength: 500, required: true, wide: true }]} />
  </Section>;
}
