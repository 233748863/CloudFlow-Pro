import React, { useId, useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button } from '@/components/common';
import { Hr09ErrorNotice, Hr09Input, Hr09Notice, Hr09Select, Hr09Textarea, useHr09Mutation } from '../components/Hr09Shared';
import { Hr09Error, shanghaiDate } from '@/services/api/hr/hr09Model';
import { hrSkillApi, skillSelfInput } from '@/services/api/hr/skills';
import type { SkillSelfInput } from '@/services/api/hr/skillTypes';
import { levelOptions, SkillPicker } from './SkillShared';

export function SkillAssessmentEditor({ mine, onClose, onSaved }: { mine: boolean; onClose: () => void; onSaved: () => void }) {
  const [selectedSkill, setSelectedSkill] = useState<{ id: string; name: string }>();
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string }>();
  const [level, setLevel] = useState('1');
  const [expiry, setExpiry] = useState('');
  const [remark, setRemark] = useState('');
  const [requestKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState<{ input: SkillSelfInput; employeeId?: string }>();
  const [uncertain, setUncertain] = useState(false);
  const mutation = useHr09Mutation();
  const formId = useId();
  const complete = () => { toast.success(mine ? '已提交技能自报，等待审核' : '已保存主管评估'); onSaved(); onClose(); };
  const findSubmitted = async () => {
    const query = { requestKey, pageNum: 1, pageSize: 1, employeeId: pending?.employeeId || selectedEmployee?.id };
    const records = mine ? (await hrSkillApi.mine(query)).assessments : await hrSkillApi.assessments(query);
    if (records.total > 0) { complete(); return true; }
    return false;
  };
  const submit = async () => {
    const input = pending?.input || skillSelfInput({ skillId: selectedSkill?.id || '', level: Number(level), expireDate: expiry || null, remark, requestKey });
    const employeeId = mine ? undefined : pending?.employeeId || selectedEmployee?.id;
    if (!mine && !employeeId) throw new Hr09Error('请选择被评估员工。', 400);
    setPending({ input, employeeId });
    setUncertain(true);
    try { await hrSkillApi.submit(input, employeeId); complete(); }
    catch (error) {
      if (error instanceof Hr09Error && [400, 403, 404, 422].includes(error.status || 0)) { setPending(undefined); setUncertain(false); }
      throw error;
    }
  };
  return <BaseDialog open title={mine ? '提交本人技能自报' : '登记主管评估'} description={mine ? '自报仅进入待审核；由管理范围内的评估人核实后生效。' : '评估须填写真实依据；本人不能评估自己。培训、考试和证书由实际业务自动关联。'} onClose={() => { if (!mutation.busy && !uncertain) onClose(); }} hideCloseButton={mutation.busy || uncertain} closeOnEscape={!mutation.busy && !uncertain} width="wide" footer={<div className="skill-workspace flex flex-wrap justify-end gap-2">
    {uncertain ? <Button type="button" variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(async () => { if (!await findSubmitted()) throw new Hr09Error('暂未查到提交记录，请使用原内容重试；当前输入和提交标识已保留。'); })}>核对提交结果</Button> : <Button type="button" variant="outline" disabled={mutation.busy} onClick={onClose}>取消</Button>}
    <Button type="submit" form={formId} disabled={mutation.busy}>{mutation.busy ? '正在处理…' : uncertain ? '原内容重试' : mine ? '提交审核' : '确认评估'}</Button>
  </div>}><form id={formId} className="skill-workspace space-y-4" aria-busy={mutation.busy} onSubmit={event => { event.preventDefault(); void mutation.run(submit); }}>
    {uncertain && <Hr09Notice>提交结果尚未确认。输入和提交标识保持不变，请核对结果或使用原内容重试，避免重复申请。</Hr09Notice>}
    <fieldset disabled={mutation.busy || uncertain} className="min-w-0 space-y-4">{!mine && <SkillPicker kind="employee" label="被评估员工" value={selectedEmployee} onChange={setSelectedEmployee} disabled={mutation.busy || uncertain} />}<SkillPicker label="技能" value={selectedSkill} onChange={setSelectedSkill} disabled={mutation.busy || uncertain} /><div className="grid gap-4 sm:grid-cols-2"><Hr09Select label={mine ? '自报等级' : '核实等级'} value={level} options={levelOptions} required onChange={setLevel} disabled={mutation.busy || uncertain} /><Hr09Input label="有效期至（可选）" type="date" min={shanghaiDate()} max="9999-12-31" value={expiry} onChange={event => setExpiry(event.target.value)} hint="留空表示本次评估未设到期日。" /></div><Hr09Textarea label="依据说明" required maxLength={500} rows={4} value={remark} onChange={event => setRemark(event.target.value)} /></fieldset><Hr09ErrorNotice error={mutation.error} />
  </form></BaseDialog>;
}
