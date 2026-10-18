import request from './request';

export interface PlatformAccessState {
  configured: boolean;
  verified: boolean;
  totpRequired: boolean;
  verifiedUntil: number | null;
  message: string;
}

export const readPlatformAccess = (signal?: AbortSignal) =>
  request.get<PlatformAccessState>('/auth/system/platform/access', { signal, silent: true });

export const verifyPlatformAccess = (password: string, totpCode?: string) =>
  request.post<PlatformAccessState>('/auth/system/platform/access/reauthenticate', { password, totpCode }, { silent: true });

export function platformHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('response' in error && error.response && typeof error.response === 'object'
    && 'status' in error.response && typeof error.response.status === 'number') return error.response.status;
  return undefined;
}
