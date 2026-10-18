import { useEffect, useState } from 'react';
import { searchBusiness } from '@/services/api/businessSearch';
import { getErrorMessage } from '@/utils/errorMessage';
import { validBusinessSearchKeyword, type BusinessSearchGroup } from '@/utils/businessSearch';

interface SearchState { keyword: string; phase: 'waiting' | 'loading' | 'ready' | 'failed'; groups: BusinessSearchGroup[]; error?: string }

export function useBusinessSearch(keyword: string, enabled: boolean, composing: boolean) {
  const normalized = keyword.trim();
  const active = enabled && !composing && validBusinessSearchKeyword(normalized);
  const [state, setState] = useState<SearchState>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) { setState(undefined); return; }
    const controller = new AbortController();
    setState({ keyword: normalized, phase: 'waiting', groups: [] });
    const timer = window.setTimeout(() => {
      setState({ keyword: normalized, phase: 'loading', groups: [] });
      void searchBusiness(normalized, controller.signal).then(result => {
        if (!controller.signal.aborted) setState({ keyword: normalized, phase: 'ready', groups: result.groups });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ keyword: normalized, phase: 'failed', groups: [], error: getErrorMessage(error, '业务搜索失败，请重试。') });
      });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [normalized, active, revision]);
  const current = active && state?.keyword === normalized ? state : undefined;
  return { active, phase: current?.phase, groups: current?.groups ?? [], error: current?.error, retry: () => setRevision(value => value + 1) };
}
