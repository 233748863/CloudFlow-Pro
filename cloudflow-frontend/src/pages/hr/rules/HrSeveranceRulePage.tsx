import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { downloadBlob } from '@/utils/download';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import { severanceRulesApi, type SeveranceRule, type SeveranceSettings, type SeveranceQuery } from '@/services/api/hr/severanceRules';
import { Hr09Access, Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Page, Hr09Select, Hr09State, Hr09Textarea, Hr09Value, dateTimeText, useHr09Mutation, useHr09Resource } from '../components/Hr09Shared';
import './severance-rules.css';

const statuses = { DRAFT: '草稿', CONFIRMED: '已核定', DISABLED: '已停用' };
const algorithms: Record<string, string> = { ACTUAL_MONTHS: '按完整日历月及不足月实际天数', FLOOR_YEAR: '按完整年向下取整', CEIL_HALF_YEAR: '向上取半年的整数倍' };
const modes: Record<string, string> = { FIXED: '固定补偿月数', PER_YEAR: '每工龄年对应月数' };
const options = (values: Record<string, string>) => Object.entries(values).map(([value, label]) => ({ value, label }));
const unknownResult = (error: unknown) => !(error instanceof Hr09Error) || !error.status || error.status >= 500;
const emptySettings = (): SeveranceSettings => ({ ruleName: '', effectiveFrom: '', effectiveTo: null, salaryComponentIds: [], averagingMonths: 0, serviceRounding: '',
  socialMonthlySalary: null, baseCapMultiplier: null, maxCompensationMonths: null, noticeMonths: '', leaveDailyDivisor: null, leaveHoursPerDay: null, leaveCashMultiplier: null, remark: null, slabs: [] });

function Editor({ row, onClose, onSaved }: { row?: SeveranceRule; onClose: () => void; onSaved: (id: string) => void }) {
  const [code, setCode] = useState(row?.ruleCode || '');
  const [value, setValue] = useState<SeveranceSettings>(() => row ? structuredClone(row.settings) : emptySettings());
  const [uncertain, setUncertain] = useState(false); const [recovered, setRecovered] = useState<SeveranceRule>();
  const recover = useHr09Mutation(); const components = useHr09Resource(signal => severanceRulesApi.components(signal), []);
  const set = <Key extends keyof SeveranceSettings>(key: Key, next: SeveranceSettings[Key]) => setValue(previous => ({ ...previous, [key]: next }));
  const recoverSaved = () => void recover.run(async () => {
    const found = row ? await severanceRulesApi.detail(row.ruleId) : (await severanceRulesApi.list({ keyword: code, pageNum: 1, pageSize: 100 })).rows.find(item => item.ruleCode.toLowerCase() === code.trim().toLowerCase());
    if (!found) throw new Hr09Error('暂未查到该编号的政策，输入仍保留，请稍后再次核对。'); setRecovered(found);
  });
  return <Hr09FormDialog title={row ? '编辑补偿政策草稿' : '新增离职补偿政策'} panelClassName="severance-rules" onClose={onClose} submitText="保存草稿" successText="补偿政策草稿已保存"
    blocked={uncertain || components.loading || Boolean(components.error)} onReload={recoverSaved} onSubmit={async () => {
      try { if (row) { await severanceRulesApi.update(row, value); onSaved(row.ruleId); } else onSaved(await severanceRulesApi.create(code, value)); }
      catch (error) { if (unknownResult(error)) setUncertain(true); throw error; }
    }}>
    {uncertain && <Hr09Notice danger>保存结果尚未确定，输入已保留。<Button type="button" variant="outline" className="mt-2" disabled={recover.busy} onClick={recoverSaved}>核对已保存政策</Button></Hr09Notice>}
    {recovered && <Hr09Notice>已读取到“{recovered.settings.ruleName}”，状态：{statuses[recovered.status]}。<Button type="button" variant="outline" className="mt-2" onClick={() => onSaved(recovered.ruleId)}>查看已保存政策</Button></Hr09Notice>}
    <Hr09ErrorNotice error={recover.error} />
    <fieldset disabled={uncertain} className="min-w-0 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="政策编号" required maxLength={64} value={code} disabled={Boolean(row)} onChange={event => setCode(event.target.value)} hint="编号保存后固定，可按编号核对原记录。" />
        <Hr09Input label="政策名称" required maxLength={100} value={value.ruleName} onChange={event => set('ruleName', event.target.value)} />
        <Hr09Input label="生效日期" required type="date" value={value.effectiveFrom} onChange={event => set('effectiveFrom', event.target.value)} />
        <Hr09Input label="失效日期（可选）" type="date" value={value.effectiveTo || ''} onChange={event => set('effectiveTo', event.target.value || null)} /></div>
      <section aria-label="工资基数项目" className="space-y-3"><h3 className="text-sm font-medium text-cf-title">月工资基数项目</h3>
        {components.loading ? <Hr09State loading title="正在读取工资项目" /> : components.error ? <Hr09State error title="工资项目读取失败" onRetry={components.refresh} /> : !components.data?.length ? <Hr09Notice>当前没有可用收入项目，可先保存草稿，核定前须选择有效项目。</Hr09Notice> :
          <div className="grid gap-2 sm:grid-cols-2">{components.data.map(component => <label key={component.value} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-[var(--cf-border)] p-3 text-sm">
            <input type="checkbox" checked={value.salaryComponentIds.includes(component.value)} onChange={event => set('salaryComponentIds', event.target.checked ? [...value.salaryComponentIds, component.value] : value.salaryComponentIds.filter(id => id !== component.value))} />
            <span className="break-words">{component.label}</span></label>)}</div>}
        <Hr09Input label="工资取样月数" required type="number" min={1} max={120} step={1} value={value.averagingMonths || ''} onChange={event => set('averagingMonths', Number(event.target.value))} hint="必须明确填写1至120个月，不自动套用政策。" /></section>
      <div className="grid gap-4 sm:grid-cols-2"><Hr09Select label="工龄算法" required value={value.serviceRounding} options={options(algorithms)} onChange={next => set('serviceRounding', next)} />
        <Hr09Input label="额外通知补偿月数" required inputMode="decimal" value={value.noticeMonths} onChange={event => set('noticeMonths', event.target.value)} hint="无额外通知补偿时明确填写0；最多4位小数。" /></div>
      <section aria-label="工龄分档" className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium text-cf-title">工龄分档</h3>
        <Button type="button" variant="outline" disabled={value.slabs.length >= 100} onClick={() => set('slabs', [...value.slabs, { sortNo: value.slabs.length, minServiceYears: '', maxServiceYears: null, calculationMode: '', compensationMonths: '' }])}>添加分档</Button></div>
        <p className="text-xs leading-5 text-cf-subtle">下限包含该工龄，上限不包含；最后一档上限留空。核定前必须从0年起连续覆盖全部工龄。</p>
        {value.slabs.map((slab, index) => {
          const change = (key: keyof typeof slab, next: string | null) => set('slabs', value.slabs.map((item, at) => at === index ? { ...item, [key]: next } : item));
          return <fieldset key={index} className="min-w-0 space-y-3 rounded-lg border border-[var(--cf-border)] p-3"><legend className="px-1 text-sm">第{index + 1}档</legend>
            <div className="grid gap-3 sm:grid-cols-2"><Hr09Input label="工龄下限（年）" required inputMode="decimal" value={slab.minServiceYears} onChange={event => change('minServiceYears', event.target.value)} />
              <Hr09Input label="工龄上限（年，可选）" inputMode="decimal" value={slab.maxServiceYears || ''} onChange={event => change('maxServiceYears', event.target.value || null)} />
              <Hr09Select label="分档计算方式" required value={slab.calculationMode} options={options(modes)} onChange={next => change('calculationMode', next)} />
              <Hr09Input label="补偿月数" required inputMode="decimal" value={slab.compensationMonths} onChange={event => change('compensationMonths', event.target.value)} /></div>
            <Button type="button" variant="outline" onClick={() => set('slabs', value.slabs.filter((_, at) => at !== index))}>移除第{index + 1}档</Button></fieldset>;
        })}</section>
      <section aria-label="补偿封顶" className="space-y-3"><h3 className="text-sm font-medium text-cf-title">补偿封顶（可选）</h3><p className="text-xs leading-5 text-cf-subtle">社会平均月工资与月基数上限倍数须同时核定；留空表示本政策未设置该封顶。</p>
        <div className="grid gap-4 sm:grid-cols-2">{([['socialMonthlySalary', '核定社会平均月工资（元）'], ['baseCapMultiplier', '月基数上限倍数'], ['maxCompensationMonths', '补偿月数上限']] as const).map(([key, label]) =>
          <Hr09Input key={key} label={label} inputMode="decimal" value={value[key] || ''} onChange={event => set(key, event.target.value || null)} />)}</div></section>
      <section aria-label="年假折现政策" className="space-y-3"><h3 className="text-sm font-medium text-cf-title">年假折现（可选）</h3><p className="text-xs leading-5 text-cf-subtle">可暂不设置；需要折现年假时，下列三项须全部明确。</p>
        <div className="grid gap-4 sm:grid-cols-2">{([['leaveDailyDivisor', '日薪除数'], ['leaveHoursPerDay', '每日小时数'], ['leaveCashMultiplier', '年假折现系数']] as const).map(([key, label]) =>
          <Hr09Input key={key} label={label} inputMode="decimal" value={value[key] || ''} onChange={event => set(key, event.target.value || null)} />)}</div></section>
      <Hr09Textarea label="核定说明（可选）" value={value.remark || ''} maxLength={500} rows={3} onChange={event => set('remark', event.target.value || null)} />
      <Hr09Notice>草稿保存后可上传政策文件。结算金额统一逐项四舍五入到分，合计累加已舍入明细。</Hr09Notice>
    </fieldset>
  </Hr09FormDialog>;
}

function PolicyAction({ row, mode, onClose, onChanged }: { row: SeveranceRule; mode: 'upload' | 'confirm'; onClose: () => void; onChanged: () => void }) {
  const [file, setFile] = useState<File>(); const [uncertain, setUncertain] = useState(false);
  return <Hr09FormDialog title={mode === 'upload' ? '上传核定政策文件' : '确认离职补偿政策'} panelClassName="severance-rules" onClose={onClose} onReload={onChanged}
    submitText={mode === 'upload' ? '保存政策文件' : '确认核定'} blocked={uncertain || mode === 'upload' && !file}
    confirmation={mode === 'confirm' ? '我已核对工资基数项目、工龄分档及政策文件；确认后本政策版本只读。' : undefined}
    onSubmit={async () => { try { if (mode === 'upload') await severanceRulesApi.upload(row, file!); else await severanceRulesApi.confirm(row); onChanged(); } catch (error) { if (unknownResult(error)) setUncertain(true); throw error; } }}>
    {uncertain && <Hr09Notice danger>尚未取得处理结果，请先读取政策核对。<Button type="button" variant="outline" className="mt-2" onClick={onChanged}>核对政策当前状态</Button></Hr09Notice>}
    <p className="break-words text-sm text-cf-title">{row.settings.ruleName} · {row.ruleCode}</p>
    {mode === 'upload' ? <Hr09Input label="核定政策文件" type="file" accept=".pdf,.png,.jpg,.jpeg" required disabled={uncertain} hint="PDF、PNG或JPEG，每份不超过10MiB；替换后以本次文件为准。" onChange={event => setFile(event.target.files?.[0])} /> : <Hr09Notice>金额统一逐项四舍五入到分；核定政策不会生成付款或完成离职结算。</Hr09Notice>}
  </Hr09FormDialog>;
}

function Detail({ identifier, onClose, onChanged }: { identifier: string; onClose: () => void; onChanged: () => void }) {
  const detail = useHr09Resource(signal => severanceRulesApi.detail(identifier, signal), [identifier]); const mutation = useHr09Mutation();
  const [action, setAction] = useState<'edit' | 'upload' | 'confirm'>(); const row = detail.data; const value = row?.settings; const busy = detail.loading || mutation.busy || Boolean(detail.error);
  const changed = () => { setAction(undefined); detail.refresh(); onChanged(); };
  return <><BaseDialog open title="离职补偿政策详情" width="wide" panelClassName="severance-rules" onClose={() => { if (!mutation.busy) onClose(); }} closeOnEscape={!mutation.busy}
    footer={<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.busy} onClick={onClose}>关闭</Button><Button type="button" variant="outline" disabled={detail.loading || mutation.busy} onClick={detail.refresh}>刷新详情</Button>
      {row?.editable && <><Button type="button" variant="outline" disabled={busy} onClick={() => setAction('edit')}>编辑草稿</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setAction('upload')}>上传政策文件</Button><Button type="button" disabled={busy || row.missingRequirements.length > 0} onClick={() => setAction('confirm')}>确认核定</Button></>}</div>}>
    {detail.loading ? <Hr09State loading title="正在读取补偿政策" /> : detail.error ? <Hr09State error title="补偿政策读取失败" description={detail.error.message} onRetry={detail.refresh} /> : row && value ? <div className="space-y-5">
      <Hr09Notice danger={row.missingRequirements.length > 0}>{row.missingRequirements.length ? row.missingRequirements.join('；') : row.editable ? '政策资料已齐，请核对后确认。' : '本政策版本只读，修改政策须使用新编号建立记录。'}</Hr09Notice>
      <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="政策名称">{value.ruleName}</Hr09Value><Hr09Value label="政策编号">{row.ruleCode}</Hr09Value><Hr09Value label="核定状态">{statuses[row.status]}</Hr09Value>
        <Hr09Value label="有效期">{value.effectiveFrom} 至 {value.effectiveTo || '未设失效日期'}</Hr09Value><Hr09Value label="工资取样">{value.averagingMonths}个月</Hr09Value><Hr09Value label="工资基数项目">{row.salaryComponents.map(component => component.label).join('、') || '尚未选择有效项目'}</Hr09Value>
        <Hr09Value label="工龄算法">{algorithms[value.serviceRounding]}</Hr09Value><Hr09Value label="额外通知补偿月数">{value.noticeMonths}</Hr09Value>
        <Hr09Value label="社会平均月工资 / 上限倍数">{value.socialMonthlySalary == null ? '未设置' : `${value.socialMonthlySalary} 元 / ${value.baseCapMultiplier ?? '待核定'}`}</Hr09Value><Hr09Value label="补偿月数上限">{value.maxCompensationMonths ?? '未设置'}</Hr09Value>
        <Hr09Value label="年假日薪除数 / 每日小时数 / 折现系数">{value.leaveDailyDivisor == null && value.leaveHoursPerDay == null && value.leaveCashMultiplier == null ? '未设置' : `${value.leaveDailyDivisor ?? '待核定'} / ${value.leaveHoursPerDay ?? '待核定'} / ${value.leaveCashMultiplier ?? '待核定'}`}</Hr09Value><Hr09Value label="核定时间">{row.confirmedTime ? dateTimeText(row.confirmedTime) : undefined}</Hr09Value></dl>
      <section className="space-y-2" aria-label="已存工龄分档"><h3 className="text-sm font-medium text-cf-title">工龄分档</h3>{value.slabs.map((slab, index) => <p key={index} className="rounded-lg border border-[var(--cf-border)] p-3 text-sm leading-6">第{index + 1}档：{slab.minServiceYears}年（含）至{slab.maxServiceYears == null ? '不限' : `${slab.maxServiceYears}年（不含）`}；{modes[slab.calculationMode]}：{slab.compensationMonths}个月</p>)}</section>
      <dl><Hr09Value label="核定说明">{value.remark}</Hr09Value></dl><section aria-label="私有政策文件" className="space-y-2"><h3 className="text-sm font-medium text-cf-title">核定政策文件</h3><p className="break-all text-sm">{row.policyFile?.fileName || '尚未上传'}</p>
        {row.policyFile && <Button type="button" variant="outline" disabled={busy} onClick={() => void mutation.run(async () => downloadBlob(await severanceRulesApi.download(row), row.policyFile!.fileName))}>下载政策文件</Button>}<Hr09ErrorNotice error={mutation.error} /></section>
      <Hr09Notice>结算金额逐项四舍五入到分，合计累加已舍入金额；冲正取原入账金额相反数。</Hr09Notice>
    </div> : <Hr09State error title="未取得完整政策" onRetry={detail.refresh} />}
  </BaseDialog>{row && action === 'edit' && <Editor row={row} onClose={() => setAction(undefined)} onSaved={changed} />}
    {row && (action === 'upload' || action === 'confirm') && <PolicyAction row={row} mode={action} onClose={() => setAction(undefined)} onChanged={changed} />}</>;
}

function Workspace() {
  const [query, setQuery] = useState<SeveranceQuery>({ pageNum: 1, pageSize: 20 }); const [creating, setCreating] = useState(false); const [selected, setSelected] = useState<string>();
  const list = useHr09Resource(signal => severanceRulesApi.list(query, signal), [query]);
  return <div className="severance-rules"><Hr09Page title="离职补偿政策" description="明确工资基数、工龄分档及政策依据，核定后用于离职结算。" actions={<><Button type="button" variant="outline" disabled={list.loading} onClick={list.refresh}><RefreshCw size={16} className="mr-2" />刷新</Button><Button type="button" onClick={() => setCreating(true)}><Plus size={16} className="mr-2" />新增政策</Button></>}>
    <div className="grid gap-4 rounded-lg border border-[var(--cf-border)] p-4 sm:grid-cols-2"><Hr09Input label="搜索政策名称或编号" value={query.keyword || ''} maxLength={100} onChange={event => setQuery({ ...query, keyword: event.target.value || undefined, pageNum: 1 })} />
      <Hr09Select label="核定状态" value={query.status || ''} placeholder="全部状态" options={options(statuses)} onChange={status => setQuery({ ...query, status: status || undefined, pageNum: 1 })} /></div>
    {list.loading ? <Hr09State loading title="正在读取政策列表" /> : list.error ? <Hr09State error title="政策列表读取失败" description={list.error.message} onRetry={list.refresh} /> : !list.data?.rows.length ? <Hr09State title="暂无离职补偿政策" description="调整查询条件，或新增政策并填写核定依据。" /> : <div className="space-y-3">{list.data.rows.map(row => <article key={row.ruleId} className="severance-rule-row rounded-lg border border-[var(--cf-border)] p-4">
      <div className="min-w-0"><h3 className="break-words text-sm font-medium text-cf-title">{row.settings.ruleName}</h3><p className="mt-1 break-all text-xs text-cf-subtle">{row.ruleCode}</p></div><p className="text-sm">{row.settings.effectiveFrom}起生效</p><p className="text-sm">{statuses[row.status]}</p><Button type="button" variant="outline" onClick={() => setSelected(row.ruleId)}>查看详情</Button></article>)}</div>}
    {list.data && <ListResultFooter total={list.data.total} page={query.pageNum || 1} pageSize={query.pageSize || 20} summary={`共 ${list.data.total} 项政策`} onPageChange={pageNum => setQuery({ ...query, pageNum })} />}
  </Hr09Page>{creating && <Editor onClose={() => setCreating(false)} onSaved={identifier => { setCreating(false); setSelected(identifier); list.refresh(); }} />}
    {selected && <Detail key={selected} identifier={selected} onClose={() => setSelected(undefined)} onChanged={list.refresh} />}</div>;
}
export default function HrSeveranceRulePage() { return <Hr09Access permission="hr:severance:manage"><Workspace /></Hr09Access>; }
