import React, { useState } from 'react';
import { Button, Pagination } from '@/components/common';
import type { TargetMember } from '@/services/api/crm/operations';
import { labelOf, OpsTable } from './OperationsKit';

export const memberTypes = { LEAD: '线索', CUSTOMER: '客户', CONTACT: '联系人' };
export const memberKey = (member: TargetMember) => `${member.memberType}:${member.memberRefId}`;
export function AudienceTable({ members, selected, toggle, remove }: { members: TargetMember[]; selected?: Set<string>; toggle?: (member: TargetMember) => void; remove?: (member: TargetMember) => void }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const current = Math.min(page, Math.max(1, Math.ceil(members.length / pageSize)));
  return <><OpsTable headers={['成员', '类型', '邮箱（脱敏）', '电话（脱敏）', '营销状态', ...(toggle || remove ? ['操作'] : [])]} empty={!members.length}>{members.slice((current - 1) * pageSize, current * pageSize).map(member => <tr key={memberKey(member)}><td>{member.memberName || '未命名'}</td><td>{labelOf(memberTypes, member.memberType)}</td><td>{member.email || '—'}</td><td>{member.phone || '—'}</td><td>{member.optedOutFlag ? '已退订' : '可参与'}</td>{(toggle || remove) && <td>{toggle && <input type="checkbox" aria-label={`选择${member.memberName || '成员'}`} checked={selected?.has(memberKey(member)) || false} onChange={() => toggle(member)} />}{remove && <Button variant="ghost" size="sm" onClick={() => remove(member)}>移除</Button>}</td>}</tr>)}</OpsTable><Pagination page={current} pageSize={pageSize} total={members.length} onPageChange={setPage} showPageSizeSelector={false} onPageSizeChange={() => undefined} /></>;
}
