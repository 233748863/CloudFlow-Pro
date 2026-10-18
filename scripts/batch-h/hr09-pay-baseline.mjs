import fs from 'node:fs/promises';
import path from 'node:path';
import { check, jsonRows, sqlText, privateDirectory } from './live-lib.mjs';
import { hundredths } from './hr09-evidence.mjs';
import { syntheticPayGrade } from './hr09-payroll.mjs';

const compensation = '/hr/compensation';
const ownIds = { payGrade: '6749051', payStructure: '6849051', payAssignment: '7749051', payTaxProfile: '13849051', payTaxSlab: '13949051' };

export function payBaselinePayloads(fixture) {
  const state = fixture?.payroll;
  const assignment = state?.baselineAssignment || state?.assignment;
  if (!state?.synthetic || state.employeeId !== fixture.employeeIds?.employee
    || Object.entries(ownIds).some(([name, id]) => fixture.ids?.[name] !== id)
    || assignment?.employeeId !== state.employeeId || state.profile?.employeeId !== state.employeeId
    || assignment?.gradeId !== ownIds.payGrade || assignment?.structureId !== ownIds.payStructure
    || state.profile?.taxSlabId !== ownIds.payTaxSlab
    || JSON.stringify([state.salary, assignment, state.profile]).includes('***')
    || hundredths(state.salary) <= 0n || hundredths(assignment.totalSalary) !== hundredths(state.salary)) {
    throw new Error('H_HR_PAY_BASELINE_ISOLATION_REQUIRED');
  }
  return {
    grade: syntheticPayGrade('H-20260914-HR09', state.salary),
    assignment: { ...assignment, status: 'INACTIVE' },
    profile: { ...state.profile, status: 'INACTIVE' },
  };
}

export function encryptionBaselineRestored(evidence) {
  return evidence?.requestedPhase === 'Restore' && evidence?.restartVerified === true
    && evidence?.temporaryEnabled === false && evidence?.restored === true
    && String(evidence?.baselineEnabled).toLowerCase() === 'false';
}

export async function restorePayBaseline({ fixture, ok, save }) {
  const runtime = JSON.parse(await fs.readFile(path.join(privateDirectory, 'hr09-encryption-runtime.private.json'), 'utf8'));
  check('仅在主线关闭全局加密且重启健康后恢复薪资基线', encryptionBaselineRestored(runtime));
  const payloads = payBaselinePayloads(fixture);
  const state = fixture.payroll;
  const employee = sqlText(state.employeeId);
  const isolation = jsonRows(`SELECT JSON_OBJECT('gradeOwn',grade.grade_code='H-20260914-HR09-PAY',
    'structureOwn',structure_row.structure_code='H-20260914-HR09-PAY','structureDisabled',structure_row.status=0,
    'assignmentOwn',assignment.employee_id=${employee} AND assignment.grade_id=grade.id AND assignment.structure_id=structure_row.id,
    'profileOwn',profile.employee_id=${employee} AND profile.tax_slab_id=13949051,
    'otherAssignments',(SELECT COUNT(*) FROM hr_employee_comp other_assignment WHERE other_assignment.tenant_id=100000
      AND other_assignment.employee_id<>${employee} AND other_assignment.deleted=0
      AND (other_assignment.grade_id=grade.id OR other_assignment.structure_id=structure_row.id)),
    'otherProfiles',(SELECT COUNT(*) FROM hr_tax_profile other_profile WHERE other_profile.tenant_id=100000
      AND other_profile.employee_id<>${employee} AND other_profile.tax_slab_id=profile.tax_slab_id))
    FROM hr_comp_grade grade JOIN hr_comp_structure structure_row ON structure_row.tenant_id=grade.tenant_id AND structure_row.id=6849051
    JOIN hr_employee_comp assignment ON assignment.tenant_id=grade.tenant_id AND assignment.id=7749051 AND assignment.deleted=0
    JOIN hr_tax_profile profile ON profile.tenant_id=grade.tenant_id AND profile.id=13849051
    WHERE grade.tenant_id=100000 AND grade.id=6749051`);
  check('恢复仅触本组专属薪级分配税档且结构已停用', isolation.length === 1
    && ['gradeOwn', 'structureOwn', 'structureDisabled', 'assignmentOwn', 'profileOwn'].every(key => Number(isolation[0][key]) === 1)
    && Number(isolation[0].otherAssignments) === 0 && Number(isolation[0].otherProfiles) === 0);
  state.baselineRestorationRequired = true;
  await save();
  for (const [table, id, endpoint, payload] of [
    ['hr_employee_comp', ownIds.payAssignment, 'employee-compensations', payloads.assignment],
    ['hr_tax_profile', ownIds.payTaxProfile, 'tax-profiles', payloads.profile],
  ]) {
    const current = jsonRows(`SELECT JSON_OBJECT('version',version) FROM ${table} WHERE tenant_id=100000 AND id=${sqlText(id)}`);
    check('薪资基线API恢复使用当前版本', current.length === 1 && Number.isInteger(current[0].version));
    await ok('admin', `${compensation}/${endpoint}/${id}`, 'PUT', { ...payload, version: current[0].version });
    const query = endpoint === 'grades' ? 'keyword=H-20260914-HR09-PAY' : `employeeId=${state.employeeId}`;
    const response = await ok('admin', `${compensation}/${endpoint}?pageSize=500&${query}`);
    const values = Array.isArray(response) ? response : response?.rows || response?.records || [];
    const actual = values.find(row => String(row.id) === id);
    check('关闭加密后自有配置通过真实API完整可读', Boolean(actual)
      && Object.entries(payload).every(([key, expected]) => key.endsWith('Salary') || key === 'threshold'
        ? actual[key] != null && hundredths(actual[key]) === hundredths(expected)
        : typeof expected === 'object' ? JSON.stringify(actual[key]) === JSON.stringify(expected)
          : String(actual[key] ?? '') === String(expected ?? '')));
  }
  const salary = sqlText(state.salary);
  const stored = jsonRows(`SELECT JSON_OBJECT('gradeReadable',grade.min_salary=${salary} AND grade.mid_salary=${salary} AND grade.max_salary=${salary},
    'assignmentReadable',assignment.total_salary=${salary} AND JSON_TYPE(assignment.component_values)='OBJECT',
    'profileReadable',JSON_TYPE(profile.tax_config)='OBJECT','assignmentInactive',assignment.status='INACTIVE',
    'profileInactive',profile.status='INACTIVE','structureDisabled',structure_row.status=0,'slabInactive',slab.status='INACTIVE')
    FROM hr_comp_grade grade JOIN hr_employee_comp assignment ON assignment.tenant_id=grade.tenant_id AND assignment.id=7749051
    JOIN hr_tax_profile profile ON profile.tenant_id=grade.tenant_id AND profile.id=13849051
    JOIN hr_comp_structure structure_row ON structure_row.tenant_id=grade.tenant_id AND structure_row.id=6849051
    JOIN hr_tax_slab slab ON slab.tenant_id=grade.tenant_id AND slab.slab_id=13949051
    WHERE grade.tenant_id=100000 AND grade.id=6749051`);
  check('原关闭加密基线的自身金额JSON和停用状态均准确恢复', stored.length === 1
    && Object.values(stored[0]).every(value => Number(value) === 1));
  state.baselineRestorationRequired = false;
  state.baselineRestorationEvidence = { checkedAt: new Date().toISOString(), exact: true, apiWrites: 2,
    encryptionDisabled: true, knownSnapshotOnly: true, otherEmployeesUntouched: true,
    payrollHistoryRetained: true, structureDisabled: true, assignmentInactive: true, profileInactive: true, slabInactive: true };
  await save();
}
