import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileSignature } from 'lucide-react';
import { BaseDialog, Button, Input } from '@/components/common';
import PortalContractContent from '@/components/contract/PortalContractContent';
import { portal, PortalError } from '@/services/portal';
import type { PortalContract, PortalContractPage as ContractPage } from '@/services/portalContractTypes';
import { portalContractMoney, portalContractStatus } from '@/utils/portalContractDisplay';
import './portal.css';

function ContractSummary({ contract }: { contract: PortalContract }) {
  return <dl className="contract-public-grid contract-public-content">
    <div><dt className="text-xs text-cf-muted">合同编号</dt><dd>{contract.contractNo}</dd></div>
    <div><dt className="text-xs text-cf-muted">合同金额</dt><dd>{portalContractMoney(contract.amount, contract.currency)}</dd></div>
    <div><dt className="text-xs text-cf-muted">合同相对方</dt><dd>{contract.counterpartyName || '未填写'}</dd></div>
    <div><dt className="text-xs text-cf-muted">履行状态</dt><dd>{portalContractStatus(contract.status)}</dd></div>
    <div><dt className="text-xs text-cf-muted">开始日期</dt><dd>{contract.startDate || '未填写'}</dd></div>
    <div><dt className="text-xs text-cf-muted">结束日期</dt><dd>{contract.endDate || '未填写'}</dd></div>
  </dl>;
}

export default function PortalContractPage() {
  const { tenantCode = '' } = useParams();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [listRevision, setListRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [page, setPage] = useState<ContractPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contractId, setContractId] = useState<string>();
  const [detail, setDetail] = useState<PortalContract>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const listRequest = useRef<AbortController | undefined>(undefined);
  const detailRequest = useRef<AbortController | undefined>(undefined);
  const fail = useCallback((failure: unknown) => {
    if (failure instanceof PortalError && failure.code === 401) {
      setPage(undefined); setDetail(undefined);
      void navigate(`/portal/${encodeURIComponent(tenantCode)}/login`, { replace: true, state: { message: '门户登录状态已失效，请重新登录。' } });
    }
    return failure instanceof Error ? failure.message : '合同暂不可用，请重新加载';
  }, [navigate, tenantCode]);

  useEffect(() => {
    const refresh = () => {
      const active = document.visibilityState === 'visible';
      setVisible(active);
      listRequest.current?.abort(); detailRequest.current?.abort();
      setPage(undefined); setDetail(undefined);
      if (active) { setListRevision(value => value + 1); setDetailRevision(value => value + 1); }
    };
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, []);

  useEffect(() => {
    setPage(undefined); setError('');
    if (!visible) { setLoading(false); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(tenantCode)) { setError('企业代码无效，请使用邀请中的门户地址'); setLoading(false); return; }
    const controller = new AbortController(); listRequest.current = controller;
    setLoading(true);
    void portal.contractList(tenantCode, query, pageNum, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(failure => { if (!controller.signal.aborted) setError(fail(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tenantCode, query, pageNum, listRevision, visible, fail]);

  useEffect(() => {
    setDetail(undefined); setDetailError('');
    if (!contractId || !visible) { setDetailLoading(false); return; }
    const controller = new AbortController(); detailRequest.current = controller;
    setDetailLoading(true);
    void portal.contractDetail(tenantCode, contractId, controller.signal)
      .then(result => { if (!controller.signal.aborted) setDetail(result); })
      .catch(failure => {
        if (!controller.signal.aborted) {
          setDetailError(fail(failure));
          setListRevision(value => value + 1);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [tenantCode, contractId, detailRevision, visible, fail]);

  const close = () => { detailRequest.current?.abort(); setContractId(undefined); setDetail(undefined); setDetailError(''); };
  return <main className="portal-page portal-controls"><section className="portal-card portal-knowledge-card" aria-labelledby="portal-contract-title">
    <header className="portal-header"><FileSignature size={28} aria-hidden="true" /><div><p className="text-xs text-cf-muted">CloudFlow Pro · 客户服务</p><h1 id="portal-contract-title" className="mt-1 text-xl font-semibold">本公司合同</h1></div></header>
    <div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => void navigate(`/portal/${encodeURIComponent(tenantCode)}`)}>返回门户</Button><Button variant="outline" disabled={loading} onClick={() => setListRevision(value => value + 1)}>重新加载</Button></div>
    <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setQuery(keyword.trim()); setPageNum(1); setListRevision(value => value + 1); }}>
      <label className="portal-field min-w-0 flex-1"><span>合同名称或编号</span><Input value={keyword} maxLength={100} onChange={event => setKeyword(event.target.value)} /></label><Button type="submit" disabled={loading}>搜索</Button>
    </form>
    <p className="mt-4 text-sm leading-6 text-cf-muted">仅展示本公司审批通过且双方签署的合同；履约条款、关键节点和付款计划仅显示已勾选公开的项目。</p>
    {loading && <p role="status" className="mt-4">正在读取合同…</p>}{error && <p role="alert" className="portal-notice">{error}</p>}
    {page && <><p className="mt-5 text-sm">共 {page.total} 份 · 第 {page.pageNum} 页</p><div className="mt-3 space-y-3">{page.rows.map(row => <article key={row.contractId} aria-label={`合同 ${row.contractNo}`} className="contract-public-item">
      <h2 className="mb-3 break-words font-medium">{row.contractName}</h2><ContractSummary contract={row} />
      <Button className="mt-4" variant="outline" aria-label={`查看合同 ${row.contractNo}`} onClick={() => { setDetail(undefined); setContractId(row.contractId); }}>查看合同</Button>
    </article>)}</div>
      {!page.rows.length && <p role="status" className="portal-notice">暂无符合条件的已开放合同。</p>}
      <nav aria-label="合同分页" className="mt-5 flex gap-3"><Button variant="outline" disabled={loading || page.pageNum <= 1} onClick={() => setPageNum(value => value - 1)}>上一页</Button><Button variant="outline" disabled={loading || page.pageNum * page.pageSize >= page.total} onClick={() => setPageNum(value => value + 1)}>下一页</Button></nav>
    </>}
  </section><BaseDialog open={Boolean(contractId)} title={detail?.contractName || '合同详情'} onClose={close} panelClassName="portal-controls" width="wide"
    footer={<><Button variant="outline" onClick={close}>关闭</Button><Button disabled={detailLoading} onClick={() => setDetailRevision(value => value + 1)}>核对最新状态</Button></>}>
    {detailLoading && <p role="status">正在核对合同开放状态…</p>}{detailError && <p role="alert" className="portal-notice">{detailError}</p>}
    {detail && <article className="space-y-6"><ContractSummary contract={detail} /><PortalContractContent contract={detail} /></article>}
  </BaseDialog></main>;
}
