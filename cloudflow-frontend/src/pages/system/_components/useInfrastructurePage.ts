import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '@/utils/errorMessage';

export function useInfrastructurePage<Row, Query extends { pageNum: number; pageSize: number }>(
  fetchPage: (query: Query) => Promise<{ rows: Row[]; total: number }>,
  initialQuery: Query,
) {
  const [query, setQuery] = useState(initialQuery);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchPage(query).then((result) => {
      if (!active) return;
      setRows(result.rows || []);
      setTotal(result.total || 0);
      if (query.pageNum > 1 && result.rows.length === 0 && result.total > 0) {
        setQuery((current) => ({ ...current, pageNum: Math.max(1, Math.ceil(result.total / current.pageSize)) }));
      }
    }).catch((reason: unknown) => {
      if (!active) return;
      setRows([]);
      setTotal(0);
      setError(getErrorMessage(reason, '加载失败，请重试'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fetchPage, query, revision]);

  return { query, setQuery, rows, total, loading, error, refresh };
}
