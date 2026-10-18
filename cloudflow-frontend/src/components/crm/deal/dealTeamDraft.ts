import Decimal from 'decimal.js';
import type { DealRole, DealTeam, DealTeamInput } from '@/services/api/crm/dealTeams';

export interface DealTeamDraftMember { salesUserId: number; salesUserName: string; deptId?: number; roleType: DealRole; percentage: string }
export const dealRoleLabels: Record<DealRole, string> = { OWNER: '主责', CO_SELLER: '协同销售', PRE_SALES: '售前', SUPPORT: '支持', MANAGER: '管理者' };
export const teamDraft = (team: DealTeam): DealTeamDraftMember[] => team.members.map(member => ({ salesUserId: member.salesUserId,
  salesUserName: member.salesUserName, deptId: member.deptId, roleType: member.roleType, percentage: new Decimal(member.allocatedPercentage).mul(100).toFixed(2) }));

export function teamPreview(amount: DealTeam['amount'], members: DealTeamDraftMember[]) {
  try {
    if (members.length < 1 || members.length > 200) throw new Error('团队须包含1至200名成员');
    if (new Set(members.map(member => member.salesUserId)).size !== members.length) throw new Error('团队成员不能重复');
    if (members.some(member => !Number.isSafeInteger(member.salesUserId) || member.salesUserId <= 0)) throw new Error('请选择有效团队成员');
    const percentages = members.map(member => {
      if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(member.percentage)) throw new Error('分成百分比须为0至100，最多两位小数');
      const value = new Decimal(member.percentage);
      if (value.lt(0) || value.gt(100)) throw new Error('分成百分比须为0至100');
      return value;
    });
    const total = Decimal.sum(...percentages);
    if (!total.eq(100)) throw new Error(`当前比例合计为${total.toFixed(2)}%，须精确等于100.00%`);
    if (members.filter(member => member.roleType === 'OWNER').length !== 1) throw new Error('团队须有且仅有一名主责');
    if (members.some(member => !Object.hasOwn(dealRoleLabels, member.roleType))) throw new Error('团队角色无效');
    const money = new Decimal(amount);
    if (!money.isFinite() || money.lt(0) || money.gt('999999999999.99') || money.decimalPlaces() > 2) throw new Error('业务金额无效');
    const amounts = percentages.map(percentage => money.mul(percentage).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
    const remainder = money.minus(Decimal.sum(...amounts));
    const ownerIndex = members.findIndex(member => member.roleType === 'OWNER');
    amounts[ownerIndex] = amounts[ownerIndex].plus(remainder);
    if (amounts[ownerIndex].lt(0)) throw new Error('按分舍入后的主责金额为负，请调整分成比例');
    return { error: '', amounts: amounts.map(value => value.toFixed(2)), total: total.toFixed(2), remainder: remainder.toFixed(2) };
  } catch (failure) {
    return { error: failure instanceof Error ? failure.message : '分成比例无效', amounts: [] as string[], total: '', remainder: '' };
  }
}

export function teamPayload(team: DealTeam, members: DealTeamDraftMember[], remark: string): DealTeamInput {
  const preview = teamPreview(team.amount, members);
  if (preview.error) throw new Error(preview.error);
  if (remark.length > 500) throw new Error('调整说明最多500字符');
  return { teamVersion: team.teamVersion, businessVersion: team.businessVersion, remark: remark.trim(),
    members: members.map(member => ({ salesUserId: member.salesUserId, roleType: member.roleType,
      allocatedPercentage: new Decimal(member.percentage).div(100).toFixed(4) })) };
}
