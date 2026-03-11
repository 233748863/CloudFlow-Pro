import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { toast } from 'sonner';
import { Eye, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import {
  deleteLoginLogs,
  getLoginLogDetail,
  getLoginLogPage,
  type LoginLogQuery,
  type SysLog,
} from '@/services/api/log';

const LoginDetailModal: React.FC<{ log: SysLog | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">??????</h3>
            <p className="mt-1 text-sm text-slate-500">??????????????</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">????</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{log.createBy || '-'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">????</div>
            <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${log.logType === '9' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {log.logType === '9' ? '??' : '??'}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">??? IP</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{log.remoteAddr || '-'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">??</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{log.time ?? 0} ms</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
            <div className="text-xs text-slate-500">??? / ??</div>
            <div className="mt-2 break-all text-sm text-slate-900">{log.userAgent || '-'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
            <div className="text-xs text-slate-500">????</div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">{log.params || '-'}</pre>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
            <div className="text-xs text-slate-500">????</div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">{log.exception || '-'}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LoginLogPage: React.FC = () => {
  const [query, setQuery] = useState<LoginLogQuery>({ pageNum: 1, pageSize: 10 });
  const [records, setRecords] = useState<SysLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysLog | null>(null);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const params: LoginLogQuery = { ...query };
      if (!params.logType) {
        delete params.logType;
      }
      const res = await getLoginLogPage(params);
      setRecords(res.records || []);
      setTotal(res.total || 0);
      setSelectedIds([]);
    } catch (error) {
      console.error(error);
      toast.error('????????');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const handleReset = () => {
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  const handleView = async (id: number) => {
    try {
      const log = await getLoginLogDetail(id);
      setDetailLog(log);
    } catch (error) {
      console.error(error);
      toast.error('??????????');
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!ids.length) {
      toast.error('???????????');
      return;
    }
    if (!window.confirm(`??????? ${ids.length} ???????`)) {
      return;
    }
    try {
      await deleteLoginLogs(ids);
      toast.success('????');
      await fetchPage();
    } catch (error) {
      console.error(error);
      toast.error('????????');
    }
  };

  const summary = useMemo(() => {
    const successCount = records.filter((item) => item.logType !== '9').length;
    const failCount = records.filter((item) => item.logType === '9').length;
    return {
      successCount,
      failCount,
      pageTotal: records.length,
    };
  }, [records]);

  const toggleSelect = (logId: number) => {
    setSelectedIds((prev) => prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(records.map((item) => item.logId));
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">????</h1>
          <p className="mt-1 text-sm text-slate-500">???????? / ??????????????</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void fetchPage()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            ??
          </button>
          <button
            onClick={() => void handleDelete(selectedIds)}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!selectedIds.length}
          >
            <Trash2 size={16} />
            ????
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">???????</div>
          <div className="mt-2 text-3xl font-bold text-emerald-600">{summary.successCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">???????</div>
          <div className="mt-2 text-3xl font-bold text-red-600">{summary.failCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">??????</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{summary.pageTotal}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">???</label>
            <input
              value={query.createBy || ''}
              onChange={(event) => setQuery((prev) => ({ ...prev, createBy: event.target.value, pageNum: 1 }))}
              placeholder="??????"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-pink-400"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">??? IP</label>
            <input
              value={query.remoteAddr || ''}
              onChange={(event) => setQuery((prev) => ({ ...prev, remoteAddr: event.target.value, pageNum: 1 }))}
              placeholder="??? IP"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-pink-400"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">????</label>
            <Select value={query.logType || 'all'} onValueChange={(value) => setQuery((prev) => ({ ...prev, logType: value === 'all' ? undefined : value, pageNum: 1 }))}>
              <SelectTrigger className="w-full rounded-xl border-slate-200">
                <SelectValue placeholder="????" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">????</SelectItem>
                <SelectItem value="0">??</SelectItem>
                <SelectItem value="9">??</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">????</label>
            <DatePicker
              type="date"
              value={query.startTime || ''}
              onChange={(event) => setQuery((prev) => ({ ...prev, startTime: event.target.value, pageNum: 1 }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">????</label>
            <DatePicker
              type="date"
              value={query.endTime || ''}
              onChange={(event) => setQuery((prev) => ({ ...prev, endTime: event.target.value, pageNum: 1 }))}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => void fetchPage()}
            className="inline-flex items-center gap-2 rounded-xl bg-pink-500 px-4 py-2 text-sm text-white hover:bg-pink-600"
          >
            <Search size={16} />
            ??
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw size={16} />
            ??
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={records.length > 0 && selectedIds.length === records.length} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3">???</th>
                <th className="px-4 py-3">??</th>
                <th className="px-4 py-3">??? IP</th>
                <th className="px-4 py-3">??</th>
                <th className="px-4 py-3">???</th>
                <th className="px-4 py-3">????</th>
                <th className="px-4 py-3 text-right">??</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">???...</td>
                </tr>
              ) : !records.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">??????</td>
                </tr>
              ) : records.map((item) => (
                <tr key={item.logId} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.includes(item.logId)} onChange={() => toggleSelect(item.logId)} />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{item.createBy || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.logType === '9' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {item.logType === '9' ? '??' : '??'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.remoteAddr || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.time ?? 0} ms</td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-slate-500" title={item.userAgent || ''}>{item.userAgent || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.createTime || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => void handleView(item.logId)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-pink-500" title="????">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => void handleDelete([item.logId])} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" title="??">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 text-sm text-slate-500">
          <span>? {total} ???</span>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={(query.pageNum || 1) <= 1}
              onClick={() => setQuery((prev) => ({ ...prev, pageNum: Math.max((prev.pageNum || 1) - 1, 1) }))}
            >
              ???
            </button>
            <span>? {query.pageNum || 1} ?</span>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={(query.pageNum || 1) * (query.pageSize || 10) >= total}
              onClick={() => setQuery((prev) => ({ ...prev, pageNum: (prev.pageNum || 1) + 1 }))}
            >
              ???
            </button>
          </div>
        </div>
      </div>

      <LoginDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
    </div>
  );
};

export default LoginLogPage;
