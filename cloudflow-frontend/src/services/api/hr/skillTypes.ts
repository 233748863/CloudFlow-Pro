import type { Hr09Page } from './hr09Types';

export type SkillPage<Row> = Hr09Page<Row>;
export interface SkillQuery {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  employeeId?: string;
  positionId?: string;
  skillId?: string;
  requestKey?: string;
}

export interface SkillDefinition {
  skillId: string;
  skillCode: string;
  skillName: string;
  skillCategory: string;
  description: string;
  levelDefinition: Record<string, string>;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
  version: number;
}

export type SkillDefinitionInput = Omit<SkillDefinition, 'skillId' | 'version'> & { skillId?: string; version?: number };
export interface SkillRequirement {
  skillId: string;
  skillName: string;
  requiredLevel: number;
  weight: string;
  mandatory: boolean;
}

export interface SkillPosition {
  positionId: string;
  positionName: string;
  version: number;
  requirements: SkillRequirement[];
}

export interface SkillCourse {
  courseId: string;
  courseName: string;
  status: string;
  version: number;
  skillId: string | null;
  skillName: string | null;
  targetLevel: number | null;
}

export interface SkillEmployee {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  positionId: string | null;
}

export interface SkillAssessment {
  assessmentId: string;
  employeeId: string;
  employeeName: string;
  skillId: string;
  skillName: string;
  level: number;
  evidenceType: 'SELF' | 'TRAINING' | 'EXAM' | 'CERTIFICATE' | 'MANAGER_REVIEW';
  evidenceBizId: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'RECORDED';
  current: boolean;
  effectiveLevel: number;
  expireDate: string | null;
  remark: string;
  createTime: string;
  assessTime: string | null;
  version: number;
  requestKey: string;
}

export interface SkillSelfInput {
  skillId: string;
  level: number;
  expireDate: string | null;
  remark: string;
  requestKey: string;
}

export interface SkillProfile {
  employeeId: string;
  employeeName: string;
  positionId: string | null;
  assessments: SkillPage<SkillAssessment>;
}

export interface SkillRecommendation {
  courseId: string;
  courseName: string;
  targetLevel: number;
  sessionId: string;
  sessionNo: string;
}

export interface SkillGap {
  skillId: string;
  skillName: string;
  requiredLevel: number;
  currentLevel: number;
  gap: number;
  mandatory: boolean;
  weight: string;
  recommendations: SkillRecommendation[];
}

export interface SkillEmployeeGap {
  employeeId: string;
  employeeName: string;
  positionId: string | null;
  positionName: string | null;
  skills: SkillGap[];
}
