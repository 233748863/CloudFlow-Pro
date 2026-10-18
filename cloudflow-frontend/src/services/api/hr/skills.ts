import Decimal from 'decimal.js';
import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, requireDate, requireId, requireText, requireVersion, shanghaiDate } from './hr09Model';
import type { SkillAssessment, SkillCourse, SkillDefinition, SkillDefinitionInput, SkillEmployee, SkillEmployeeGap, SkillPage, SkillPosition, SkillProfile, SkillQuery, SkillRequirement, SkillSelfInput } from './skillTypes';

const root = '/hr/skill';
const id = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Hr09Error('记录编号超出安全精度，请重新读取。');
  return requireId(String(value));
};
const nullableId = (value: unknown) => value == null ? null : id(value);

export function skillLevel(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Hr09Error('请选择 1—5 级。', 400);
  return value;
}

export function skillExpiry(value: string | null) {
  if (!value) return null;
  const result = requireDate(value);
  if (result < shanghaiDate()) throw new Hr09Error('有效期不能早于今天。', 400);
  return result;
}

export function skillSelfInput(input: SkillSelfInput): SkillSelfInput {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.requestKey)) throw new Hr09Error('提交标识无效，请重新打开表单。', 400);
  return { skillId: requireId(input.skillId), level: skillLevel(input.level), expireDate: skillExpiry(input.expireDate), remark: requireText(input.remark, '依据说明', 500), requestKey: input.requestKey };
}

export function skillRequirements(rows: SkillRequirement[]) {
  if (rows.length > 100 || new Set(rows.map(row => row.skillId)).size !== rows.length) throw new Hr09Error('岗位技能不能重复，最多 100 项。', 400);
  const normalized = rows.map(row => {
    const weight = row.weight.trim();
    if (!/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/.test(weight)) throw new Hr09Error('权重须为 0—1，最多四位小数。', 400);
    return { skillId: requireId(row.skillId), requiredLevel: skillLevel(row.requiredLevel), weight, mandatory: row.mandatory };
  });
  for (const mandatory of [true, false]) {
    const group = normalized.filter(row => row.mandatory === mandatory);
    if (group.length && !group.reduce((sum, row) => sum.plus(row.weight), new Decimal(0)).equals(1)) throw new Hr09Error(`${mandatory ? '必备' : '加分'}技能的权重须合计为 1。`, 400);
  }
  return normalized;
}

function definition(row: SkillDefinition): SkillDefinition {
  if (!row.levelDefinition || typeof row.levelDefinition !== 'object' || Array.isArray(row.levelDefinition)
      || Object.entries(row.levelDefinition).some(([key, value]) => !/^[1-5]$/.test(key) || typeof value !== 'string')) throw new Hr09Error('技能等级定义不完整，请重新读取。');
  return { ...row, skillId: id(row.skillId) };
}
const position = (row: SkillPosition): SkillPosition => ({ ...row, positionId: id(row.positionId), requirements: row.requirements.map(item => ({ ...item, skillId: id(item.skillId) })) });
const course = (row: SkillCourse): SkillCourse => ({ ...row, courseId: id(row.courseId), skillId: nullableId(row.skillId) });
const employee = (row: SkillEmployee): SkillEmployee => ({ ...row, employeeId: id(row.employeeId), positionId: nullableId(row.positionId) });
const assessment = (row: SkillAssessment): SkillAssessment => ({ ...row, assessmentId: id(row.assessmentId), employeeId: id(row.employeeId), skillId: id(row.skillId) });
const gap = (row: SkillEmployeeGap): SkillEmployeeGap => ({ ...row, employeeId: id(row.employeeId), positionId: nullableId(row.positionId), skills: row.skills.map(item => ({ ...item, skillId: id(item.skillId), recommendations: item.recommendations.map(recommendation => ({ ...recommendation, courseId: id(recommendation.courseId), sessionId: id(recommendation.sessionId) })) })) });
const page = <Row,>(value: SkillPage<Row>, map: (row: Row) => Row): SkillPage<Row> => ({ ...hr09Page(value), rows: value.rows.map(map) });
const get = <Result,>(path: string, params: SkillQuery, signal?: AbortSignal) => hr09Request<Result>({ method: 'GET', url: `${root}${path}`, params, signal });
const post = <Result,>(path: string, data: unknown) => hr09Request<Result>({ method: 'POST', url: `${root}${path}`, data });

export const hrSkillApi = {
  definitions: async (query: SkillQuery, signal?: AbortSignal) => page(await get<SkillPage<SkillDefinition>>('/list', query, signal), definition),
  positions: async (query: SkillQuery, signal?: AbortSignal) => page(await get<SkillPage<SkillPosition>>('/positions', query, signal), position),
  courses: async (query: SkillQuery, signal?: AbortSignal) => page(await get<SkillPage<SkillCourse>>('/courses', query, signal), course),
  employees: async (query: SkillQuery, signal?: AbortSignal) => page(await get<SkillPage<SkillEmployee>>('/employees', query, signal), employee),
  assessments: async (query: SkillQuery, signal?: AbortSignal) => page(await get<SkillPage<SkillAssessment>>('/assessments', query, signal), assessment),
  mine: async (query: SkillQuery, signal?: AbortSignal): Promise<SkillProfile> => {
    const result = await get<SkillProfile>('/mine', query, signal);
    return { ...result, employeeId: id(result.employeeId), positionId: nullableId(result.positionId), assessments: page(result.assessments, assessment) };
  },
  gaps: async (query: SkillQuery, signal?: AbortSignal) => page(await get<SkillPage<SkillEmployeeGap>>('/gap', query, signal), gap),
  recommendations: async (signal?: AbortSignal) => gap(await get<SkillEmployeeGap>('/mine/recommendations', {}, signal)),
  saveDefinition: async (input: SkillDefinitionInput) => {
    const levels = { ...input.levelDefinition };
    if (!['DRAFT', 'ACTIVE', 'DISABLED'].includes(input.status)) throw new Hr09Error('技能状态无效。', 400);
    for (const [key, value] of Object.entries(levels)) {
      if (!/^[1-5]$/.test(key) || typeof value !== 'string' || value.length > 1000) throw new Hr09Error('等级描述仅允许 1—5 级，每级最多 1000 字。', 400);
      levels[key] = value.trim();
    }
    if (input.status === 'ACTIVE' && [1, 2, 3, 4, 5].some(level => !levels[String(level)])) throw new Hr09Error('启用前须填写全部五级定义。', 400);
    if (input.skillCategory.length > 100 || input.description.length > 1000) throw new Hr09Error('分类最多 100 字，说明最多 1000 字。', 400);
    const data = { ...input, skillCode: requireText(input.skillCode, '技能编码', 64), skillName: requireText(input.skillName, '技能名称', 100), levelDefinition: levels,
      ...(input.skillId ? { skillId: requireId(input.skillId), ...requireVersion(input.version as number) } : {}) };
    return id(await hr09Request<unknown>({ method: input.skillId ? 'PUT' : 'POST', url: root, data }));
  },
  savePosition: async (input: SkillPosition) => position(await hr09Request<SkillPosition>({ method: 'PUT', url: `${root}/position/${requireId(input.positionId)}`, data: { ...requireVersion(input.version), requirements: skillRequirements(input.requirements) } })),
  saveCourse: async (input: SkillCourse) => {
    if ((input.skillId == null) !== (input.targetLevel == null)) throw new Hr09Error('技能与目标等级须同时设置或同时清空。', 400);
    return course(await hr09Request<SkillCourse>({ method: 'PUT', url: `${root}/course/${requireId(input.courseId)}`, data: { ...requireVersion(input.version), skillId: input.skillId ? requireId(input.skillId) : null, targetLevel: input.targetLevel == null ? null : skillLevel(input.targetLevel) } }));
  },
  submit: async (input: SkillSelfInput, employeeId?: string) => id(await post<unknown>(employeeId ? '/assessment' : '/self-assessment', { ...skillSelfInput(input), ...(employeeId ? { employeeId: requireId(employeeId), evidenceType: 'MANAGER_REVIEW' } : {}) })),
  review: async (record: SkillAssessment, approved: boolean, level: number, expireDate: string | null, remark: string) => id(await post<unknown>(`/assessment/${requireId(record.assessmentId)}/review`, { ...requireVersion(record.version), approved, level: approved ? skillLevel(level) : null, expireDate: approved ? skillExpiry(expireDate) : null, remark: requireText(remark, '审核说明', 500) })),
};
