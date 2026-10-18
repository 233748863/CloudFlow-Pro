import type { Hr09Page } from './hr09Types';

export type AppraisalStatus = 'DRAFT' | 'ONGOING' | 'SCORING' | 'CALIBRATING' | 'COMPLETED';
export type AppraisalMethod = 'GOAL_BASED' | 'KRA_WEIGHTED' | 'MIXED';
export interface AppraisalQuery { pageNum?: number; pageSize?: number; keyword?: string; status?: string }
export type AppraisalPage<Row> = Hr09Page<Row>;
export interface AppraisalOption { identifier: string; name: string }
export interface AppraisalOptions { departments: AppraisalOption[]; positions: AppraisalOption[]; jobLevels: AppraisalOption[] }
export interface AppraisalPerson { employeeId: string; employeeName: string; employeeNo: string; deptId: string | null; positionId: string | null; jobLevelId: string | null; userId: string | null; updateTime: string }
export interface AppraisalConfig { minScore: string; maxScore: string; kraWeight: string | null; goalWeight: string | null }
export interface AppraisalDraft {
  cycleId?: string; version?: number; cycleName: string; cycleType: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
  startDate: string; endDate: string; scopeDeptIds: string[]; scopePositionIds: string[]; scopeJobLevelIds: string[];
  evaluationMethod: AppraisalMethod; finalScoreMode: 'WEIGHTED_AVG' | 'FORMULA'; finalScoreFormula: string;
  scoreConfig: AppraisalConfig; remark: string;
}
export interface AppraisalCycle extends AppraisalDraft { cycleId: string; version: number; status: AppraisalStatus; completedTime: string | null; visibleParticipants: number }
export interface AppraisalKra { kraId: string; kraName: string; weight: string; sortNo: number; description: string | null }
export interface AppraisalGoal {
  assignmentId: string; objectiveId: string; objectiveName: string; parentId: string | null; kraId: string | null;
  assigneeType: 'EMPLOYEE' | 'DEPT'; assigneeId: string; assigneeName: string; weight: string; targetValue: string;
  objectiveVersion: number; assignmentVersion: number;
}
export interface AppraisalGoalNode { key: string; parentKey: string | null; assigneeType: 'EMPLOYEE' | 'DEPT'; assigneeId: string; weight: string; targetValue: string }
export interface AppraisalGoalTree { version: number; objectiveId?: string; objectiveName: string; kraId: string | null; nodes: AppraisalGoalNode[] }
export interface AppraisalGoalScore { assignmentId: string; resultId: string; resultVersion: number; score: string; summary: string }
export interface AppraisalResult {
  appraisalResultId: string; employeeId: string; userId: string | null; employeeName: string; employeeNo: string;
  calculatedScore: string | null; finalScore: string | null; grade: string | null; calibrationReason: string | null;
  status: string; version: number; goalScores: AppraisalGoalScore[]; sourceScores: Record<string, string>;
}
export interface AppraisalQuota { grade: string; percent: string; minCount: number | null; maxCount: number | null }
export interface AppraisalRule { ruleId: string; version: number; ruleName: string; enforceMode: 'WARN' | 'BLOCK'; distribution: AppraisalQuota[] }
export interface AppraisalDistribution { valid: boolean; enforceMode: string; population: number; grades: { grade: string; quota: number; minimum: number; maximum: number; actual: number }[]; violations: string[] }
export interface AppraisalSession { sessionId?: string; sessionName: string; scheduledAt: string; location: string; facilitatorUserId: string; participantUserIds: string[]; agenda: string; minutes: string; status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'; participantNames?: AppraisalOption[] }
export interface AppraisalDetail { cycle: AppraisalCycle; kras: AppraisalKra[]; goals: AppraisalGoal[]; results: AppraisalResult[]; distributionRule: AppraisalRule | null; distribution: AppraisalDistribution | null; sessions: AppraisalSession[] }
export interface AppraisalPreview { employees: AppraisalPerson[]; digest: string }
export interface AppraisalCalculated { version: number; results: { employeeId: string; employeeName: string; calculatedScore: string | null; error: string | null }[] }
export interface AppraisalEvaluator { id: string; evaluatorId: string; evaluatorUserId: string | null; evaluatorName: string; evaluatorSource: string; status: string; weight: string; score: string | null; commentText: string | null }
export interface AppraisalInvitation {
  invitationId: string; version: number; cycleId: string; cycleName: string; cycleStatus: AppraisalStatus;
  objectiveName: string; evaluateeName: string; evaluatorSource: string; status: 'PENDING' | 'SUBMITTED' | 'CANCELLED';
  score: string | null; commentText: string | null; submitTime: string | null; minScore: string; maxScore: string;
}
