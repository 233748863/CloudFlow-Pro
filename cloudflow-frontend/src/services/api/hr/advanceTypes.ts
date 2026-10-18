import type { Hr09Page } from './hr09Types';

export type AdvanceMode = 'SALARY_DEDUCT' | 'LUMP_SUM';
export type AdvanceStatus = 'APPLYING' | 'APPROVED' | 'PAID' | 'REPAYING' | 'CLEARED' | 'WRITTEN_OFF';
export type AdvanceApproval = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export interface AdvanceQuery { pageNum?: number; pageSize?: number; employeeId?: string; keyword?: string; status?: string; approvalStatus?: string }
export interface AdvanceSummary {
  advanceId: string; advanceNo: string; employeeId: string; employeeName: string; amount: string; purpose: string;
  applyDate: string; repayMode: AdvanceMode; repayStartMonth: string | null; repayMonths: number | null;
  monthlyDeductAmount: string | null; repaidAmount: string; outstandingAmount: string; reservedAmount: string;
  writtenOffAmount: string; status: AdvanceStatus; approvalStatus: AdvanceApproval; paidTime: string | null; version: number;
}
export interface AdvanceRepayment {
  repaymentId: string; amount: string; repayMonth: string | null; repayType: 'SALARY' | 'MANUAL' | 'SETTLEMENT';
  status: 'RESERVED' | 'POSTED' | 'RELEASED' | 'REVERSED'; reversalOfId: string | null;
  repayDate: string | null; postedTime: string | null; proofFileId: string | null; remark: string | null; sourceEventKey: string | null;
}
export interface AdvanceDetail {
  advance: AdvanceSummary; repayments: Hr09Page<AdvanceRepayment>; canEdit: boolean; canRepay: boolean; canWriteoff: boolean;
}
export interface AdvanceApprovalDetail {
  taskId: string; advanceId: string; advanceNo: string; employeeName: string; amount: string; purpose: string;
  applyDate: string; repayMode: AdvanceMode; repayStartMonth: string | null; repayMonths: number | null;
  monthlyDeductAmount: string | null; approvalStatus: AdvanceApproval;
}
export interface AdvanceDraft {
  amount: string; purpose: string; repayMode: AdvanceMode; repayStartMonth: string | null;
  repayMonths: number | null; monthlyDeductAmount: string | null; version?: number;
}
export interface AdvanceProof { fileId: string; fileName: string; fileSize: number }
export interface AdvanceRepaymentInput { amount: string; version: number; sourceEventKey: string; proofFileId: string; repayDate: string; remark: string }
export interface AdvanceWriteoffInput { amount: string; version: number; sourceEventKey: string; reason: string; confirmed: boolean }
