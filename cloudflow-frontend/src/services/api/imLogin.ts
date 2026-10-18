export type ImLoginPurpose = 'SCAN_LOGIN' | 'EMBEDDED_LOGIN';

export interface ImLoginAvailability {
  enabled: boolean;
  reasonCode?: string;
  message: string;
}

const endpoint = '/api/auth/im/WECOM';

export const imLoginSecure = () => window.location.protocol === 'https:';

const request = async <Result>(path: string, options: RequestInit): Promise<Result> => {
  if (!imLoginSecure()) throw new Error('企业微信登录需通过本系统HTTPS页面使用');
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json', ...options.headers },
  });
  const body = await response.json();
  if (!response.ok || body?.code !== 200 || body?.data == null) {
    throw new Error('企业微信登录未完成，请返回登录页重新发起；也可使用原账号登录');
  }
  return body.data as Result;
};

export const imLoginAvailability = (tenantCode: string, signal: AbortSignal) =>
  request<ImLoginAvailability>(`/availability?${new URLSearchParams({ tenantCode })}`, { signal });

export const imLoginAuthorize = (tenantCode: string, purpose: ImLoginPurpose, legalReleaseCode: string, signal: AbortSignal) =>
  request<{ authorizationUrl: string }>(`/auth-url?${new URLSearchParams({ tenantCode, purpose, legalReleaseCode })}`, { signal });

export const imLoginVerify = (code: string, signal: AbortSignal) =>
  request<{ redirectUrl: string }>('/totp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), signal });

export const imProviderDestination = (value: string, purpose: ImLoginPurpose) => {
  const destination = new URL(value);
  const host = purpose === 'SCAN_LOGIN' ? 'open.work.weixin.qq.com' : 'open.weixin.qq.com';
  if (destination.protocol !== 'https:' || destination.hostname !== host || destination.port || destination.username || destination.password) {
    throw new Error('企业微信授权地址无效，请联系管理员');
  }
  return destination.href;
};

export const imLocalDestination = (value: string) => {
  const destination = new URL(value);
  if (destination.protocol !== 'https:' || destination.origin !== window.location.origin || destination.username || destination.password
    || destination.search || destination.hash || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(destination.pathname)
    || ['/login', '/register'].includes(destination.pathname)) {
    throw new Error('登录返回地址无效，请返回登录页');
  }
  return destination.href;
};
