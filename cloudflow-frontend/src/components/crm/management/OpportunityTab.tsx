import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRightLeft, Eye, FolderKanban, Handshake, Send, Target, TriangleAlert } from 'lucide-react';
import { crmApi } from '@/services/api/crm';
import { OpportunityDetailDialog } from '../opportunity/OpportunityDetailDialog';
import { money } from '../operations/OperationsKit';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { useCrmManagement } from './store';
import { OpportunityBoard } from './kanban/OpportunityBoard';
import { TableScrollArea } from '@/components/common';

export const OpportunityTab: React.FC = () => {
  const { opportunities, board, hasPermission, openOpportunityEditor, openCustomerWorkspace, setStageChange, setConfirm, goToProject, load } = useCrmManagement();
  const [detailId, setDetailId] = useState<number | null>(null);
  const [search, setSearch] = useSearchParams();
  const linkedId = search.get('opportunityId');
  useEffect(() => {
    if (linkedId && /^[1-9][0-9]*$/.test(linkedId) && Number.isSafeInteger(Number(linkedId))) setDetailId(Number(linkedId));
  }, [linkedId]);
  const closeDetail = () => {
    setDetailId(null);
    if (search.has('opportunityId')) setSearch(current => {
      const next = new URLSearchParams(current);
      next.delete('opportunityId');
      return next;
    }, { replace: true });
  };
  const stageName = (code?: string) => board.find(column => column.stage === code)?.stageLabel || code || '—';
  const begin = async (id: number, action: 'stage' | 'winOpportunity' | 'loseOpportunity') => {
    try {
      const detail = await crmApi.getOpportunityDetail(id);
      if (detail.status !== 'OPEN') throw new Error('商机已结案，请刷新列表');
      if (action === 'stage') setStageChange({ opportunity: detail }); else setConfirm({ action, item: detail });
    } catch (error) { toast.error(getErrorMessage(error, '读取商机失败')); }
  };
  return (
    <div className="admin-crm-opportunity-grid crm-opportunity-panel">
      <p className="text-sm text-cf-muted">拖拽卡片或使用“调整阶段”推进商机；回退填写实际原因并审批，赢单与丢单分别确认。</p>
      <OpportunityBoard onOpen={setDetailId} />

      <p id="opportunity-list-scroll-hint" className="text-sm text-cf-muted sm:hidden">左右滑动查看商机信息及操作；键盘聚焦表格后可用左右方向键。</p>
      <InnerTableSurface className="admin-crm-table-panel" disableScrollWrapper>
        <TableScrollArea role="region" aria-label="商机列表横向滚动区域" aria-describedby="opportunity-list-scroll-hint" maxHeight="none">
        <table className="unity-data-table admin-source-table admin-crm-table crm-opportunity-list-table min-w-[900px]" aria-label="商机列表">
            <thead>
              <tr>
                <th scope="col">商机</th>
                <th scope="col">客户</th>
                <th scope="col">阶段</th>
                <th scope="col">金额 / 赢率</th>
                <th scope="col">最近跟进</th>
                <th scope="col">负责人</th>
                <th scope="col" className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((item) => (
                <tr key={item.opportunityId}>
                  <td><strong>{item.opportunityName}</strong></td>
                  <td>{item.customerName || '-'}</td>
                  <td>{stageName(item.stage)}<small>{item.stageChangedTime ? `停留 ${item.stageDurationDays ?? 0} 个完整天` : '进入时间未记录'}</small></td>
                  <td><strong>{money(item.expectedAmount)} 元</strong><small>赢率 {item.winRate ?? 0}% · 加权 {money(item.weightedAmount)} 元</small></td>
                  <td>{formatDateTimeDisplay(item.latestFollowUpTime)}</td>
                  <td>{item.ownerName || '-'}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="查看详情" aria-label="查看详情" onClick={() => setDetailId(item.opportunityId!)}><Eye size={15} /></button>
                      {hasPermission('crm:customer:list') && <button type="button" data-tooltip="客户360" aria-label="客户360" onClick={() => openCustomerWorkspace(item.customerId)}><Handshake size={15} /></button>}
                      {item.status === 'OPEN' && hasPermission('crm:opportunity:edit') && <button type="button" data-tooltip="编辑商机" aria-label="编辑商机" onClick={() => void openOpportunityEditor(item.opportunityId!)}><Target size={15} /></button>}
                      {item.status === 'OPEN' && (hasPermission('crm:opportunity:edit') || hasPermission('crm:approval:opportunity-downgrade')) && <button type="button" data-tooltip="调整阶段" aria-label="调整阶段" onClick={() => void begin(item.opportunityId!, 'stage')}><ArrowRightLeft size={15} /></button>}
                      {item.status === 'OPEN' && hasPermission('crm:opportunity:win') && <button type="button" data-tooltip="赢单" aria-label="赢单" onClick={() => void begin(item.opportunityId!, 'winOpportunity')}><Send size={15} /></button>}
                      {item.status === 'OPEN' && hasPermission('crm:approval:opportunity-downgrade') && <button type="button" data-tooltip="丢单审批" aria-label="丢单审批" onClick={() => void begin(item.opportunityId!, 'loseOpportunity')}><TriangleAlert size={15} /></button>}
                      {hasPermission('crm:project:draft') && <button
                        type="button"
                        data-tooltip="转项目" aria-label="转项目"
                        onClick={async () => {
                            try {
                              const projectId = await crmApi.createProjectDraft(item.opportunityId!);
                              toast.success(`已生成项目草稿 #${projectId}`);
                              await load();
                              goToProject(projectId);
                            } catch (error) {
                              toast.error(getErrorMessage(error, '生成项目草稿失败'));
                            }
                          }}
                      >
                        <FolderKanban size={15} />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
        </TableScrollArea>
      </InnerTableSurface>

      {detailId && <OpportunityDetailDialog key={detailId} id={detailId} onClose={closeDetail} />}
    </div>
  );
};
