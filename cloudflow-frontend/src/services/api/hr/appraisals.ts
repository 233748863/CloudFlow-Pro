import Decimal from 'decimal.js';
import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, requireDate, requireId, requireText, requireVersion } from './hr09Model';
import type { AppraisalCalculated, AppraisalCycle, AppraisalDetail, AppraisalDraft, AppraisalEvaluator, AppraisalGoalTree, AppraisalKra, AppraisalOption, AppraisalOptions, AppraisalPage, AppraisalPerson, AppraisalPreview, AppraisalQuery, AppraisalQuota, AppraisalResult, AppraisalSession, AppraisalStatus } from './appraisalTypes';
import type { AppraisalInvitation } from './appraisalTypes';

const root = '/hr/appraisal-cycle';
export const appraisalId = (value: unknown): string => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Hr09Error('记录编号精度无效，请重新读取。');
  return requireId(String(value));
};
const nullableId = (value: unknown) => value == null ? null : appraisalId(value);
const decimalText = (value: unknown) => value == null ? null : String(value);
const invitation = (row: AppraisalInvitation): AppraisalInvitation => ({ ...row, invitationId: appraisalId(row.invitationId), cycleId: appraisalId(row.cycleId), score: decimalText(row.score), minScore: String(row.minScore), maxScore: String(row.maxScore) });
export function appraisalNumber(value: string, label: string, integers = 6, fraction = 4) {
  const normalized = value.trim();
  if (!new RegExp(`^-?\\d{1,${integers}}(?:\\.\\d{1,${fraction}})?$`).test(normalized)) throw new Hr09Error(`${label}须为十进制数，整数最多${integers}位、小数最多${fraction}位。`, 400);
  return normalized;
}
export function appraisalWeight(value: string) {
  const normalized = appraisalNumber(value, '权重', 1, 4);
  if (new Decimal(normalized).lessThan(0) || new Decimal(normalized).greaterThan(1)) throw new Hr09Error('权重须为0—1。', 400);
  return normalized;
}
const cycle = (row: AppraisalCycle): AppraisalCycle => ({ ...row, cycleId: appraisalId(row.cycleId), scopeDeptIds: row.scopeDeptIds.map(appraisalId), scopePositionIds: row.scopePositionIds.map(appraisalId), scopeJobLevelIds: row.scopeJobLevelIds.map(appraisalId),
  scoreConfig: { minScore: String(row.scoreConfig.minScore), maxScore: String(row.scoreConfig.maxScore), kraWeight: decimalText(row.scoreConfig.kraWeight), goalWeight: decimalText(row.scoreConfig.goalWeight) } });
const person = (row: AppraisalPerson): AppraisalPerson => ({ ...row, employeeId: appraisalId(row.employeeId), deptId: nullableId(row.deptId), positionId: nullableId(row.positionId), jobLevelId: nullableId(row.jobLevelId), userId: nullableId(row.userId) });
const result = (row: AppraisalResult): AppraisalResult => ({ ...row, appraisalResultId: appraisalId(row.appraisalResultId), employeeId: appraisalId(row.employeeId), userId: nullableId(row.userId), calculatedScore: decimalText(row.calculatedScore), finalScore: decimalText(row.finalScore),
  goalScores: row.goalScores.map(score => ({ ...score, assignmentId: appraisalId(score.assignmentId), resultId: appraisalId(score.resultId), score: String(score.score) })),
  sourceScores: Object.fromEntries(Object.entries(row.sourceScores).map(([key, value]) => [key, String(value)])) });
const session = (row: AppraisalSession): AppraisalSession => ({ ...row, scheduledAt: row.scheduledAt.replace(' ', 'T'), sessionId: appraisalId(row.sessionId), facilitatorUserId: appraisalId(row.facilitatorUserId), participantUserIds: row.participantUserIds.map(appraisalId), participantNames: row.participantNames?.map(person => ({ ...person, identifier: appraisalId(person.identifier) })) });
function detail(value: AppraisalDetail): AppraisalDetail {
  return { ...value, cycle: cycle(value.cycle), kras: value.kras.map(row => ({ ...row, kraId: appraisalId(row.kraId), weight: String(row.weight) })),
    goals: value.goals.map(row => ({ ...row, assignmentId: appraisalId(row.assignmentId), objectiveId: appraisalId(row.objectiveId), parentId: nullableId(row.parentId), kraId: nullableId(row.kraId), assigneeId: appraisalId(row.assigneeId), weight: String(row.weight), targetValue: String(row.targetValue) })),
    results: value.results.map(result), sessions: value.sessions.map(session),
    distributionRule: value.distributionRule ? { ...value.distributionRule, ruleId: appraisalId(value.distributionRule.ruleId), distribution: value.distributionRule.distribution.map(row => ({ ...row, percent: String(row.percent) })) } : null };
}
const read = <Result,>(endpoint: string, signal?: AbortSignal, params?: AppraisalQuery) => hr09Request<Result>({ method: 'GET', url: `${root}${endpoint}`, signal, params });
const write = <Result,>(endpoint: string, data: unknown, method = 'POST') => hr09Request<Result>({ method, url: `${root}${endpoint}`, data });
const path = (cycleId: string, endpoint: string) => `/${requireId(cycleId)}${endpoint}`;

export const hrAppraisalApi = {
  invitations: async (query: AppraisalQuery, signal?: AbortSignal): Promise<AppraisalPage<AppraisalInvitation>> => {
    const data = hr09Page(await read<AppraisalPage<AppraisalInvitation>>('/invitations/mine', signal, { ...query, status: query.status || undefined }));
    return { ...data, rows: data.rows.map(invitation) };
  },
  invitation: async (invitationId: string, signal?: AbortSignal) => invitation(await read<AppraisalInvitation>(`/invitations/mine/${requireId(invitationId)}`, signal)),
  respond: (record: AppraisalInvitation, score: string, commentText: string) => write<void>(`/invitations/mine/${requireId(record.invitationId)}/response`, {
    ...requireVersion(record.version), score: appraisalNumber(score, '本人受邀评分', 6, 2), commentText: requireText(commentText, '评价依据', 2000),
  }),
  list: async (query: AppraisalQuery, mine: boolean, signal?: AbortSignal): Promise<AppraisalPage<AppraisalCycle>> => {
    const value = hr09Page(await read<AppraisalPage<AppraisalCycle>>(mine ? '/mine' : '/list', signal, { ...query, status: query.status || undefined }));
    return { ...value, rows: value.rows.map(cycle) };
  },
  detail: async (cycleId: string, mine: boolean, signal?: AbortSignal) => detail(await read<AppraisalDetail>(`${mine ? '/mine' : ''}/${requireId(cycleId)}`, signal)),
  options: async (signal?: AbortSignal): Promise<AppraisalOptions> => {
    const data = await read<AppraisalOptions>('/options', signal);
    const normalize = (rows: AppraisalOption[]) => rows.map(row => ({ ...row, identifier: appraisalId(row.identifier) }));
    return { departments: normalize(data.departments), positions: normalize(data.positions), jobLevels: normalize(data.jobLevels) };
  },
  people: async (query: AppraisalQuery, signal?: AbortSignal): Promise<AppraisalPage<AppraisalPerson>> => {
    const data = hr09Page(await read<AppraisalPage<AppraisalPerson>>('/people', signal, query));
    return { ...data, rows: data.rows.map(person) };
  },
  preview: async (cycleId: string, signal?: AbortSignal): Promise<AppraisalPreview> => {
    const value = await read<AppraisalPreview>(path(cycleId, '/preview'), signal);
    return { ...value, employees: value.employees.map(person) };
  },
  save: async (draft: AppraisalDraft) => {
    const minScore = appraisalNumber(draft.scoreConfig.minScore, '评分下界');
    const maxScore = appraisalNumber(draft.scoreConfig.maxScore, '评分上界');
    if (new Decimal(minScore).lessThan(0) || new Decimal(maxScore).lessThanOrEqualTo(minScore)) throw new Hr09Error('评分下界须非负，上界须大于下界。', 400);
    const startDate = requireDate(draft.startDate);
    const endDate = requireDate(draft.endDate);
    if (endDate < startDate) throw new Hr09Error('结束日期不能早于开始日期。', 400);
    const mixed = draft.evaluationMethod === 'MIXED';
    const kraWeight = mixed ? appraisalWeight(draft.scoreConfig.kraWeight || '') : null;
    const goalWeight = mixed ? appraisalWeight(draft.scoreConfig.goalWeight || '') : null;
    if (mixed && !new Decimal(kraWeight as string).plus(goalWeight as string).equals(1)) throw new Hr09Error('混合模式两类权重须合计为1。', 400);
    const data: AppraisalDraft = { cycleName: requireText(draft.cycleName, '周期名称', 100), cycleType: draft.cycleType, startDate, endDate,
      scopeDeptIds: draft.scopeDeptIds.map(requireId), scopePositionIds: draft.scopePositionIds.map(requireId), scopeJobLevelIds: draft.scopeJobLevelIds.map(requireId),
      evaluationMethod: draft.evaluationMethod, finalScoreMode: draft.finalScoreMode, finalScoreFormula: draft.finalScoreMode === 'FORMULA' ? requireText(draft.finalScoreFormula, '得分公式', 500) : '',
      scoreConfig: { minScore, maxScore, kraWeight, goalWeight }, remark: draft.remark,
      ...(draft.cycleId ? { cycleId: requireId(draft.cycleId), ...requireVersion(draft.version as number) } : {}) };
    return appraisalId(await write<unknown>('', data, draft.cycleId ? 'PUT' : 'POST'));
  },
  remove: (record: AppraisalCycle) => hr09Request<void>({ method: 'DELETE', url: `${root}${path(record.cycleId, '')}`, params: requireVersion(record.version) }),
  kras: (record: AppraisalCycle, rows: Pick<AppraisalKra, 'kraName' | 'weight' | 'description'>[]) => {
    const kras = rows.map(row => ({ kraName: requireText(row.kraName, '成果领域名称', 100), weight: appraisalWeight(row.weight), description: row.description || '' }));
    if (kras.length && !kras.reduce((sum, row) => sum.plus(row.weight), new Decimal(0)).equals(1)) throw new Hr09Error('成果领域权重须合计为1。', 400);
    return write<void>(path(record.cycleId, '/kras'), { ...requireVersion(record.version), kras }, 'PUT');
  },
  goals: (cycleId: string, input: AppraisalGoalTree) => write<string>(path(cycleId, '/goals'), { ...requireVersion(input.version), objectiveId: input.objectiveId ? requireId(input.objectiveId) : undefined,
    objectiveName: requireText(input.objectiveName, '目标名称', 200), kraId: input.kraId ? requireId(input.kraId) : null,
    nodes: input.nodes.map(row => ({ key: row.key, parentKey: row.parentKey, assigneeType: row.assigneeType, assigneeId: requireId(row.assigneeId), weight: appraisalWeight(row.weight), targetValue: appraisalNumber(row.targetValue, '目标值', 14, 4) })) }, 'PUT'),
  removeGoal: (record: AppraisalCycle, objectiveId: string) => hr09Request<void>({ method: 'DELETE', url: `${root}${path(record.cycleId, `/goals/${requireId(objectiveId)}`)}`, params: requireVersion(record.version) }),
  distribution: (record: AppraisalCycle, ruleName: string, enforceMode: 'WARN' | 'BLOCK', distribution: AppraisalQuota[]) => write<void>(path(record.cycleId, '/distribution'), { ...requireVersion(record.version), ruleName: requireText(ruleName, '规则名称', 120), enforceMode, distribution }, 'PUT'),
  score: (record: AppraisalCycle, assignmentId: string, score: string, summary: string) => write<void>(path(record.cycleId, '/goal-score'), { ...requireVersion(record.version), assignmentId: requireId(assignmentId), score: appraisalNumber(score, '目标评分', 6, 2), summary: requireText(summary, '评分依据', 2000) }),
  transition: (record: AppraisalCycle, targetStatus: AppraisalStatus, previewDigest?: string, acknowledgeWarnings = false) => write<string>(path(record.cycleId, '/transition'), { ...requireVersion(record.version), targetStatus, previewDigest, acknowledgeWarnings }),
  calculate: async (record: AppraisalCycle): Promise<AppraisalCalculated> => {
    const data = await write<AppraisalCalculated>(path(record.cycleId, '/calculate'), requireVersion(record.version));
    return { ...data, results: data.results.map(row => ({ ...row, employeeId: appraisalId(row.employeeId), calculatedScore: decimalText(row.calculatedScore) })) };
  },
  calibrate: (record: AppraisalCycle, row: AppraisalResult, finalScore: string, grade: string, reason: string) => write<void>(path(record.cycleId, '/calibration'), { ...requireVersion(record.version), appraisalResultId: requireId(row.appraisalResultId), resultVersion: row.version,
    finalScore: appraisalNumber(finalScore, '最终得分'), grade: requireText(grade, '等级', 30), reason: requireText(reason, '校准原因', 1000) }),
  session: (record: AppraisalCycle, input: AppraisalSession) => write<string>(path(record.cycleId, '/calibration-session'), { ...requireVersion(record.version), sessionId: input.sessionId, sessionName: input.sessionName, scheduledAt: input.scheduledAt.replace('T', ' '), location: input.location, agenda: input.agenda, minutes: input.minutes, status: input.status, facilitatorUserId: requireId(input.facilitatorUserId), participantUserIds: input.participantUserIds.map(requireId) }),
  evaluators: async (objectiveId: string, employeeId: string, signal?: AbortSignal): Promise<AppraisalEvaluator[]> => {
    const rows = await hr09Request<AppraisalEvaluator[]>({ method: 'GET', url: '/hr/performance/360/evaluators', params: { objectiveId, evaluateeId: employeeId }, signal });
    return rows.map(row => ({ ...row, id: appraisalId(row.id), evaluatorId: appraisalId(row.evaluatorId), evaluatorUserId: nullableId(row.evaluatorUserId), weight: String(row.weight), score: decimalText(row.score) }));
  },
  invite: (objectiveId: string, employeeId: string, evaluatorId: string, evaluatorSource: string) => hr09Request<string[]>({ method: 'POST', url: '/hr/performance/360/invite', data: { objectiveId: requireId(objectiveId), evaluateeId: requireId(employeeId), evaluators: [{ evaluatorId: requireId(evaluatorId), evaluatorSource, weight: '20' }] } }),
  cancelInvitation: (invitationId: string) => hr09Request<void>({ method: 'POST', url: `/hr/performance/360/evaluator/${requireId(invitationId)}/cancel` }),
};
