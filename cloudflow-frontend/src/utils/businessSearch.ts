export const BUSINESS_SEARCH_TYPES = ['CUSTOMER', 'CONTRACT', 'EMPLOYEE', 'WORKFLOW_INSTANCE', 'TICKET', 'ASSET'] as const;
export type BusinessSearchType = typeof BUSINESS_SEARCH_TYPES[number];
export type BusinessSearchState = 'AVAILABLE' | 'FORBIDDEN' | 'UNAVAILABLE';
export interface BusinessSearchHit { type: BusinessSearchType; id: string; title: string; number: string | null; status: string | null; route: string }
export interface BusinessSearchGroup { type: BusinessSearchType; state: BusinessSearchState; items: BusinessSearchHit[]; hasMore: boolean }
export interface BusinessSearchResponse { keyword: string; limitPerType: number; groups: BusinessSearchGroup[] }

export const BUSINESS_SEARCH_META: Record<BusinessSearchType, { label: string; permissions: string[]; route: string }> = {
  CUSTOMER: { label: '客户', permissions: ['crm:customer:list'], route: '/office/crm/customer/' },
  CONTRACT: { label: '合同', permissions: ['oa:contract:list'], route: '/office/contracts?searchId=' },
  EMPLOYEE: { label: '员工', permissions: ['hr:employees:list', 'hr:employees:view'], route: '/hr/employees?searchId=' },
  WORKFLOW_INSTANCE: { label: '流程', permissions: ['workflow:process:view'], route: '/workflow/search-instance/' },
  TICKET: { label: '工单', permissions: ['crm:ticket:list'], route: '/office/crm/tickets?searchId=' },
  ASSET: { label: '资产', permissions: ['oa:asset:list'], route: '/admin/asset?searchId=' },
};

export function validBusinessSearchKeyword(value: string): boolean {
  const characters = Array.from(value.trim());
  return characters.length >= 2 && characters.length <= 64 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
    && characters.every(character => character.length !== 1 || character.charCodeAt(0) < 0xd800 || character.charCodeAt(0) > 0xdfff);
}

export function businessSearchRoute(type: BusinessSearchType, identifier: string): string {
  const pattern = type === 'WORKFLOW_INSTANCE' ? /^[A-Za-z0-9_-]{1,64}$/ : /^[1-9][0-9]{0,18}$/;
  if (!BUSINESS_SEARCH_TYPES.includes(type) || !pattern.test(identifier)) throw new Error('搜索结果地址无效，请重新查询。');
  return BUSINESS_SEARCH_META[type].route + identifier;
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseBusinessSearchResponse(value: unknown, keyword: string, limit: number): BusinessSearchResponse {
  if (!object(value) || value.keyword !== keyword || value.limitPerType !== limit || !Array.isArray(value.groups)
    || value.groups.length !== BUSINESS_SEARCH_TYPES.length) throw new Error('业务搜索结果不完整，请重试。');
  const seen = new Set<BusinessSearchType>();
  const groups = value.groups.map(raw => {
    if (!object(raw) || !BUSINESS_SEARCH_TYPES.includes(raw.type as BusinessSearchType) || seen.has(raw.type as BusinessSearchType)
      || !['AVAILABLE', 'FORBIDDEN', 'UNAVAILABLE'].includes(String(raw.state)) || !Array.isArray(raw.items)
      || raw.items.length > limit || typeof raw.hasMore !== 'boolean') throw new Error('业务搜索分组无效，请重试。');
    const type = raw.type as BusinessSearchType;
    seen.add(type);
    const identifiers = new Set<string>();
    const items = raw.items.map(item => {
      if (!object(item) || item.type !== type || typeof item.id !== 'string' || identifiers.has(item.id)
        || typeof item.title !== 'string' || !item.title.trim() || item.route !== businessSearchRoute(type, item.id)
        || item.number !== null && typeof item.number !== 'string' || item.status !== null && typeof item.status !== 'string') {
        throw new Error('业务搜索记录无效，请重试。');
      }
      identifiers.add(item.id);
      return { type, id: item.id, title: item.title, number: item.number, status: item.status, route: item.route } as BusinessSearchHit;
    });
    if (raw.state !== 'AVAILABLE' && (items.length || raw.hasMore)) throw new Error('业务搜索权限状态无效，请重试。');
    return { type, state: raw.state as BusinessSearchState, items, hasMore: raw.hasMore };
  });
  return { keyword, limitPerType: limit, groups };
}

export function businessSearchFocus(search: string): number | null {
  const values = new URLSearchParams(search).getAll('searchId');
  if (!values.length) return null;
  if (values.length !== 1 || !/^[1-9][0-9]{0,18}$/.test(values[0]) || !Number.isSafeInteger(Number(values[0]))) {
    throw new Error('搜索详情编号无效，请重新搜索。');
  }
  return Number(values[0]);
}
