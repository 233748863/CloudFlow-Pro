import type { AxiosRequestConfig, AxiosResponseTransformer } from 'axios';
import request from '@/services/api/request';
import { Hr09Error, requireId } from './hr09Model';
import type { Hr09NamedOption, Hr09Page, Hr09PeriodOption } from './hr09Types';

export async function hr09Request<Result>(config: AxiosRequestConfig): Promise<Result> {
  let failure: { message: string; status?: number; code?: string } | undefined;
  const defaults = request.defaults.transformResponse;
  const transforms = Array.isArray(defaults) ? defaults : defaults ? [defaults] : [];
  const protectResponse: AxiosResponseTransformer = (body, _headers, status) => {
    if (body && typeof body === 'object' && !(body instanceof Blob)) {
      const code = body.code;
      if ((status && status >= 400) || typeof code === 'number' && code !== 200 || typeof code === 'string') {
        failure = {
          status: status && status >= 400 ? status : typeof code === 'number' ? code : undefined,
          code: typeof code === 'string' && /^[A-Z0-9_.-]{1,64}$/.test(code) ? code : undefined,
          message: typeof body.message === 'string' ? body.message : typeof body.msg === 'string' ? body.msg : 'HR 业务操作未完成。',
        };
      }
      if (code === 503) return { ...body, msg: 'HR 服务暂时不可用，请稍后重试。' };
    }
    return body;
  };
  try {
    return await request.request<Result, Result>({ ...config, silent: true, transformResponse: [...transforms, protectResponse] });
  } catch (error: unknown) {
    if (error instanceof Hr09Error) throw error;
    const cancelled = config.signal?.aborted;
    if (cancelled) throw new Hr09Error('本次读取已取消。', undefined, 'CANCELLED');
    throw new Hr09Error(failure?.message || '服务未完成请求，请检查网络后重试；记录状态以重新读取为准。', failure?.status, failure?.code);
  }
}

export function hr09Page<Result>(value: Hr09Page<Result>): Hr09Page<Result> {
  if (!value || !Array.isArray(value.rows) || !Number.isSafeInteger(value.total) || value.total < 0) {
    throw new Hr09Error('服务端未返回完整分页结果，已停止展示，请刷新后重试。');
  }
  return value;
}

function referenceId(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return requireId(String(value));
  return requireId(typeof value === 'string' ? value : '');
}

async function readReferences(path: string, signal?: AbortSignal) {
  const result = await hr09Request<Record<string, unknown>[]>({ method: 'GET', url: path, signal });
  if (!Array.isArray(result)) throw new Hr09Error('选项返回格式不完整，请刷新后重试。');
  return result;
}

async function periods(path: string, signal?: AbortSignal): Promise<Hr09PeriodOption[]> {
  const rows = await readReferences(path, signal);
  return rows.map(row => ({ periodId: referenceId(row.periodId), periodName: String(row.periodName || ''), startDate: String(row.startDate || ''), endDate: String(row.endDate || ''), status: String(row.status || '') }));
}

export const hr09References = {
  payrollPeriods: (signal?: AbortSignal) => periods('/hr/compensation/payroll/config/periods', signal),
  leavePeriods: (signal?: AbortSignal) => periods('/hr/attendance/leave/periods', signal),
  salaryComponents: async (signal?: AbortSignal): Promise<Hr09NamedOption[]> => {
    const rows = await readReferences('/hr/compensation/components', signal);
    return rows.filter(row => row.componentType === 'VARIABLE' && String(row.taxable) === '1' && String(row.status) === '1')
      .map(row => ({ value: referenceId(row.id), label: String(row.componentName || row.componentCode || '') }));
  },
  leaveTypes: async (signal?: AbortSignal): Promise<Hr09NamedOption[]> => {
    const rows = await readReferences('/hr/attendance/leave-types', signal);
    return rows.filter(row => row.unit === 'HOUR' && String(row.compensatoryFlag) === '1' && String(row.needQuota) === '1' && String(row.status) === '1')
      .map(row => ({ value: referenceId(row.id), label: String(row.leaveName || row.leaveCode || '') }));
  },
  paidSlips: async (employeeId: string, periodId: string, signal?: AbortSignal): Promise<Hr09NamedOption[]> => {
    requireId(employeeId);
    requireId(periodId);
    const rows = await readReferences(`/hr/compensation/payroll/slips/paid-options?employeeId=${employeeId}&periodId=${periodId}`, signal);
    const seen = new Set<string>();
    return rows.map(row => {
      const slipId = referenceId(row.salarySlipId);
      if (seen.has(slipId) || typeof row.periodMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.periodMonth)) {
        throw new Hr09Error('原周期已发工资单选项不完整，请刷新后重试。');
      }
      seen.add(slipId);
      return { value: slipId, label: `${row.periodMonth} · 已发工资单 ${slipId}` };
    });
  },
};
