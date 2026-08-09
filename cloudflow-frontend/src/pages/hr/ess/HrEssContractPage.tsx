import React, { useCallback, useEffect, useState } from 'react';
import { FileText, History, LoaderCircle, PenLine, RefreshCcw, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { DictLabel } from '@/components/common/DictLabel';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import {
  HrContractSignature,
  HrRecord,
  listMyContracts,
  listMySignatures,
  requestContractSign,
  cancelContractSign,
} from '@/services/api/hr';
import { normalizeRows, formatDateValue, formatDateTimeValue, hasWorkflowStatus } from '../hrShared';

const REQUESTABLE_SIGN_STATUS = new Set(['', 'UNSIGNED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
const BLOCKED_CONTRACT_STATUS = new Set(['EXPIRED', 'TERMINATED']);

export const HrEssContractPage: React.FC = () => {
  const [contracts, setContracts] = useState<HrRecord[]>([]);
  const [signatures, setSignatures] = useState<HrContractSignature[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contractRes, sigRes] = await Promise.all([listMyContracts(), listMySignatures()]);
      setContracts(Array.isArray(contractRes) ? contractRes : normalizeRows<HrRecord>(contractRes));
      setSignatures(normalizeRows<HrContractSignature>(sigRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '合同信息加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRequestSign = async (contractId: number) => {
    try {
      await requestContractSign(contractId);
      toast.success('已发起签署流程');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '发起失败'));
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelContractSign(id);
      toast.success('已取消');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    }
  };

  const canRequestSign = (row: any) => {
    const contractStatus = String(row?.status || '').trim().toUpperCase();
    const signStatus = String(row?.signStatus || '').trim().toUpperCase();
    if (BLOCKED_CONTRACT_STATUS.has(contractStatus)) {
      return false;
    }
    if (row?.endDate) {
      const endDate = new Date(`${row.endDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!Number.isNaN(endDate.getTime()) && endDate < today) {
        return false;
      }
    }
    return REQUESTABLE_SIGN_STATUS.has(signStatus);
  };

  const signableCount = contracts.filter((row) => canRequestSign(row)).length;
  const pendingSignatureCount = signatures.filter((row) => hasWorkflowStatus(row.signStatus, 'PENDING')).length;

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">employee contract</p>
                  <h2>我的合同</h2>
                  <span>查看个人合同、签署状态和签署流转记录。</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
                  </Button>
                </div>
              </header>
        
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <span className="admin-source-stat-icon"><FileText size={18} /></span>
                  <div><p>合同总数</p><strong>{contracts.length}</strong><span>当前员工合同</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <span className="admin-source-stat-icon"><PenLine size={18} /></span>
                  <div><p>可发起签署</p><strong>{signableCount}</strong><span>未签或需重签</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <span className="admin-source-stat-icon"><History size={18} /></span>
                  <div><p>签署记录</p><strong>{signatures.length}</strong><span>流转记录总数</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-violet">
                  <span className="admin-source-stat-icon"><Send size={18} /></span>
                  <div><p>待签署</p><strong>{pendingSignatureCount}</strong><span>待完成签署</span></div>
                </article>
              </section>
            </>
          }
          table={
            <div className="admin-source-content-grid">
              <InnerTableSurface>
                <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-cf-title dark:border-slate-800">我的合同</div>
                <div className="admin-horizontal-scroll">
                  <table className="unity-data-table admin-source-table min-w-[820px]">
                    <thead>
                    <tr>
                      <th>合同编号</th>
                      <th>类型</th>
                      <th>生效期</th>
                      <th>截止期</th>
                      <th>签署状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-cf-faint">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : contracts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-cf-faint">暂无合同</td>
                      </tr>
                    ) : (
                      contracts.map((row: any) => (
                        <tr key={row.id}>
                          <td className="text-sm">{row.contractNo || `#${row.id}`}</td>
                          <td className="text-sm"><DictLabel dictType="hr_contract_type" value={row.contractType} fallback="-" /></td>
                          <td className="text-sm">{formatDateValue(row.startDate)}</td>
                          <td className="text-sm">{formatDateValue(row.endDate)}</td>
                          <td className="text-sm">{row.signStatus ? <DictLabel dictType="hr_contract_sign_status" value={row.signStatus} fallback="-" /> : <DictLabel dictType="hr_employment_contract_status" value={row.status} fallback="-" />}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              {canRequestSign(row) ? (
                                <button type="button" data-tooltip="发起签署" aria-label="发起签署" onClick={() => void handleRequestSign(row.id)}><Send size={15} /></button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                    </tbody>
                  </table>
                </div>
              </InnerTableSurface>
        
              <InnerTableSurface>
                <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-cf-title dark:border-slate-800">签署流转记录</div>
                <div className="admin-horizontal-scroll">
                  <table className="unity-data-table admin-source-table min-w-[900px]">
                    <thead>
                    <tr>
                      <th>合同 ID</th>
                      <th>签署方</th>
                      <th>方式</th>
                      <th>状态</th>
                      <th>签署时间</th>
                      <th>过期时间</th>
                      <th className="text-right">操作</th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-sm text-cf-faint">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : signatures.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-sm text-cf-faint">暂无签署记录</td>
                      </tr>
                    ) : (
                      signatures.map((row) => (
                        <tr key={row.id}>
                          <td className="text-sm">{row.contractId}</td>
                          <td className="text-sm"><DictLabel dictType="hr_contract_signer_type" value={row.signerType} fallback="-" /></td>
                          <td className="text-sm"><DictLabel dictType="hr_contract_sign_method" value={row.signMethod} fallback="-" /></td>
                          <td className="text-sm"><DictLabel dictType="hr_contract_sign_status" value={row.signStatus} fallback="-" /></td>
                          <td className="text-sm">{formatDateTimeValue(row.signTime)}</td>
                          <td className="text-sm">{formatDateTimeValue(row.expireTime)}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              {hasWorkflowStatus(row.signStatus, 'PENDING') ? (
                                <button type="button" className="danger" data-tooltip="取消" aria-label="取消" onClick={() => void handleCancel(row.id)}><XCircle size={15} /></button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                    </tbody>
                  </table>
                </div>
              </InnerTableSurface>
            </div>
          }
        />
      </section>
    </>
  );
};

export default HrEssContractPage;
