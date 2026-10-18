import { getAuthSessionVersion, getCurrentUserSnapshot } from '@/utils/authStorage';

export interface RequestTraceContext {
  sessionVersion: number;
  identityKey: string;
}

let recentRequestTrace: { traceId: string; context: RequestTraceContext } | undefined;

export function getRequestTraceContext(): RequestTraceContext {
  const user = getCurrentUserSnapshot();
  return {
    sessionVersion: getAuthSessionVersion(),
    identityKey: JSON.stringify([user?.userId ?? user?.id ?? null, user?.tenantId ?? null]),
  };
}

function sameTraceContext(left: RequestTraceContext, right: RequestTraceContext): boolean {
  return left.sessionVersion === right.sessionVersion && left.identityKey === right.identityKey;
}

export function rememberRequestTrace(traceId: unknown, context: RequestTraceContext | undefined): void {
  const valid = validTraceId(traceId);
  if (valid && context && sameTraceContext(context, getRequestTraceContext())) {
    recentRequestTrace = { traceId: valid, context: { ...context } };
  }
}

export function getRecentRequestTraceId(): string | undefined {
  if (recentRequestTrace && !sameTraceContext(recentRequestTrace.context, getRequestTraceContext())) {
    recentRequestTrace = undefined;
  }
  return recentRequestTrace?.traceId;
}

export function validTraceId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : undefined;
}

export function createTraceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
}

export function errorTraceId(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'traceId' in error ? validTraceId(error.traceId) : undefined;
}

export function attachTraceId<Failure extends Error>(error: Failure, traceId: unknown): Failure & { traceId?: string } {
  return Object.assign(error, { traceId: validTraceId(traceId) });
}
