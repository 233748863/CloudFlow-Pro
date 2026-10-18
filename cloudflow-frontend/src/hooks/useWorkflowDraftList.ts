import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getWorkflowDrafts, draftExpireTimestamp, toWorkflowDraftError, type DraftListQuery, type DraftSummaryVO } from '@/services/api/workflow/draft';
import { getCurrentUserSnapshot } from '@/utils/authStorage';
import { workflowDraftIdentity } from './useWorkflowDraft';

export function useWorkflowDraftList(query: DraftListQuery, enabled = true) {
  const { user, hasPermission } = useAuth();
  const identity = workflowDraftIdentity(user);
  const allowed = Boolean(user) && enabled && hasPermission('workflow:draft:list');
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [result, setResult] = useState<{ key: string; records: DraftSummaryVO[]; total: number; loading: boolean; error: string | null }>({ key: '', records: [], total: 0, loading: true, error: null });
  const key = JSON.stringify([identity, allowed, query.pageNum, query.pageSize, query.keyword || '', query.definitionId || '', revision]);
  const currentKey = useRef(key);
  currentKey.current = key;

  useLayoutEffect(() => {
    const abort = new AbortController();
    let active = true;
    const current = () => active && currentKey.current === key && workflowDraftIdentity(getCurrentUserSnapshot()) === identity;
    setResult({ key, records: [], total: 0, loading: allowed, error: null });
    if (allowed) {
      void getWorkflowDrafts(query, abort.signal).then((page) => {
        if (!current()) return;
        if (!page || !Array.isArray(page.rows) || !Number.isFinite(page.total)) throw new Error('Invalid draft page');
        setNow(Date.now());
        setResult({ key, records: page.rows, total: page.total, loading: false, error: null });
      }).catch((error: unknown) => {
        if (current()) setResult({ key, records: [], total: 0, loading: false, error: toWorkflowDraftError(error).message });
      });
    }
    return () => { active = false; abort.abort(); };
  }, [key]);

  useEffect(() => {
    if (!allowed || !result.records.length) return;
    const remaining = result.records.map((draft) => draftExpireTimestamp(draft.expireTime) - Date.now()).filter((duration) => duration > 0);
    if (!remaining.length) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(60_000, ...remaining));
    return () => window.clearTimeout(timer);
  }, [allowed, result.records, now]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const current = result.key === key;
  return { records: current ? result.records : [], total: current ? result.total : 0, loading: current ? result.loading : allowed, error: current ? result.error : null, allowed, identity, now, reload };
}
