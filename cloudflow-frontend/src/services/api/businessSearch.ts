import request from './request';
import { parseBusinessSearchResponse, validBusinessSearchKeyword } from '@/utils/businessSearch';

export async function searchBusiness(keyword: string, signal: AbortSignal, limitPerType = 5) {
  keyword = keyword.trim();
  if (!validBusinessSearchKeyword(keyword) || !Number.isInteger(limitPerType) || limitPerType < 1 || limitPerType > 10) {
    throw new Error('请输入2至64个字符，每类最多查询10条。');
  }
  const result = await request.get<unknown>('/auth/system/search/business', { params: { keyword, limitPerType }, signal });
  return parseBusinessSearchResponse(result, keyword, limitPerType);
}
