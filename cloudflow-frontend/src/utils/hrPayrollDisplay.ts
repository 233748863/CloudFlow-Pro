const salaryStatuses: Record<string, string> = {
  DRAFT: '草稿', PENDING: '待审批', SUBMITTED: '已提交', PAID: '已发放',
  CONFIRMED: '已确认', CANCELLED: '已取消', REJECTED: '已拒绝',
  APPLIED: '审批通过', APPROVED: '审批通过',
};

export const salaryStatusText = (value: unknown): string => salaryStatuses[String(value)] || String(value ?? '—');

const payrollFailureMessages: Readonly<Record<string, string>> = {
  PAYROLL_ALREADY_CALCULATED: '该周期已有工资单，请核对原批次；原草稿可取消后重算，已发放工资请通过补正处理。',
  PAYROLL_CALCULATION_FAILED: '计算失败，请联系管理员按批次编号核查后重试。',
  SALARY_SLIP_FINAL: '工资单已确定，不能重新计算；已发放工资请通过补正处理。',
};

export const payrollFailureMessage = (value: unknown): string => {
  const message = String(value ?? '').trim();
  if (!message) return '—';
  if (Object.hasOwn(payrollFailureMessages, message)) return payrollFailureMessages[message];
  return /^[A-Z][A-Z0-9_]+$/.test(message)
    ? '计算未完成，请联系管理员按批次编号核查原因。' : message;
};

const compensationChangeNames: Readonly<Record<string, string>> = {
  BONUS: '奖金', OVERTIME: '加班费', REFERRAL_BONUS: '内推奖金', LEAVE_ENCASHMENT: '假期折现',
};

export const salaryComponentName = (component: Record<string, unknown>): string => {
  const savedName = component.salaryComponentName;
  if (typeof savedName === 'string' && savedName.trim()) return savedName;
  const name = String(component.name || component.itemName || component.type || component.itemCode || '—');
  return component.sourceType === 'COMPENSATION_CHANGE' && Object.hasOwn(compensationChangeNames, name)
    ? compensationChangeNames[name] : name;
};
