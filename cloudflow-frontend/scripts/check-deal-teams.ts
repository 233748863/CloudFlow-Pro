import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import type { DealRole, DealTeam } from '../src/services/api/crm/dealTeams';
import { dealRoleLabels, teamDraft, teamPayload, teamPreview, type DealTeamDraftMember } from '../src/components/crm/deal/dealTeamDraft';

let checks = 0;
const check = (name: string, operation: () => void) => {
  try { operation(); checks += 1; }
  catch (cause) { throw new Error(name, { cause }); }
};
const member = (salesUserId: number, percentage: string, roleType: DealRole = 'CO_SELLER'): DealTeamDraftMember =>
  ({ salesUserId, salesUserName: `成员${salesUserId}`, roleType, percentage });
const team: DealTeam = { bizType: 'OPPORTUNITY', bizId: 123, businessVersion: 9, teamVersion: 3, currentTeamVersion: 3,
  ownerId: 1, amount: '100.01', currency: 'CNY', historical: false, versions: [3, 2, 1], members: [
    { salesUserId: 1, salesUserName: '主责', deptId: 100, roleType: 'OWNER', allocatedPercentage: '0.6000', allocatedAmount: '60.01' },
    { salesUserId: 2, salesUserName: '协作', deptId: 101, roleType: 'CO_SELLER', allocatedPercentage: '0.4000', allocatedAmount: '40.00' },
  ] };

check('服务器0至1比例映射为两位百分数，不修改原对象', () => {
  const original = structuredClone(team);
  const draft = teamDraft(team);
  assert.deepEqual(draft.map(row => row.percentage), ['60.00', '40.00']);
  draft[0].percentage = '50.00';
  assert.deepEqual(team, original);
});
check('请求只传业务版本、团队版本、成员和说明，不传薪酬字段', () => {
  const draft = teamDraft(team).map(row => ({ ...row, commissionRate: '1.0000', commissionAmount: '9999.99', tenantId: 100001 }));
  assert.deepEqual(teamPayload(team, draft, ' 核对后调整 '), { teamVersion: 3, businessVersion: 9, remark: '核对后调整', members: [
    { salesUserId: 1, roleType: 'OWNER', allocatedPercentage: '0.6000' },
    { salesUserId: 2, roleType: 'CO_SELLER', allocatedPercentage: '0.4000' },
  ] });
});
check('0.01个百分点保留为四位小数比例', () => assert.equal(teamPayload(team, [member(1, '0.01', 'OWNER'), member(2, '99.99')], '').members[0].allocatedPercentage, '0.0001'));
check('调整说明最多500字符', () => {
  assert.equal(teamPayload(team, teamDraft(team), '明'.repeat(500)).remark?.length, 500);
  assert.throws(() => teamPayload(team, teamDraft(team), '明'.repeat(501)), /500/);
});
for (const [amount, draft, expected, remainder] of [
  ['100.01', [member(1, '60', 'OWNER'), member(2, '40')], ['60.01', '40.00'], '0.00'],
  ['0.01', [member(1, '50', 'OWNER'), member(2, '50')], ['0.00', '0.01'], '-0.01'],
  ['0.01', [member(1, '34', 'OWNER'), member(2, '33'), member(3, '33')], ['0.01', '0.00', '0.00'], '0.01'],
  ['0.01', [member(1, '33'), member(2, '34', 'OWNER'), member(3, '33')], ['0.00', '0.01', '0.00'], '0.01'],
  ['0.00', [member(1, '0', 'OWNER'), member(2, '100')], ['0.00', '0.00'], '0.00'],
  ['999999999999.99', [member(1, '100', 'OWNER')], ['999999999999.99'], '0.00'],
] as const) {
  check(`金额${amount}逐分分配及主责尾差${remainder}`, () => {
    const result = teamPreview(amount, [...draft]);
    assert.equal(result.error, ''); assert.deepEqual(result.amounts, expected);
    assert.equal(result.remainder, remainder); assert.equal(result.total, '100.00');
  });
}
for (const percentage of ['', ' ', '1e2', '100.001', '100.01', '-1', '+100', '.5', 'NaN', 'Infinity', '100%', '1,00', '１００']) {
  check(`非法百分数${JSON.stringify(percentage)}拒绝且无金额预览`, () => {
    const result = teamPreview('100.00', [member(1, percentage, 'OWNER')]);
    assert.ok(result.error); assert.deepEqual(result.amounts, []);
    assert.throws(() => teamPayload(team, [member(1, percentage, 'OWNER')], ''));
  });
}
for (const amount of ['-0.01', '1000000000000.00', '0.001', 'NaN', 'Infinity', '']) {
  check(`非法金额${JSON.stringify(amount)}拒绝`, () => assert.ok(teamPreview(amount, [member(1, '100', 'OWNER')]).error));
}
for (const [name, draft] of [
  ['不足100%', [member(1, '99.99', 'OWNER')]],
  ['超过100%', [member(1, '60', 'OWNER'), member(2, '40.01')]],
  ['没有成员', []], ['没有主责', [member(1, '100')]],
  ['两个主责', [member(1, '60', 'OWNER'), member(2, '40', 'OWNER')]],
  ['重复用户', [member(1, '60', 'OWNER'), member(1, '40')]],
  ['主责尾差为负', [member(1, '0', 'OWNER'), member(2, '50'), member(3, '50')]],
] as const) check(`${name}拒绝`, () => assert.ok(teamPreview('0.01', [...draft]).error));
for (const salesUserId of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
  check(`非法用户ID${salesUserId}拒绝`, () => assert.ok(teamPreview('1', [member(salesUserId, '100', 'OWNER')]).error));
}
for (const role of ['constructor', 'toString', '__proto__', 'UNKNOWN']) {
  check(`未批准角色${role}拒绝`, () => assert.match(teamPreview('1', [member(1, '60', 'OWNER'), member(2, '40', role as DealRole)]).error, /团队角色无效/));
}
for (const role of Object.keys(dealRoleLabels).filter(value => value !== 'OWNER')) {
  check(`批准角色${role}可作为协作成员`, () => assert.equal(teamPreview('1', [member(1, '60', 'OWNER'), member(2, '40', role as DealRole)]).error, ''));
}
check('最大200人成组保存，201人拒绝', () => {
  const draft = Array.from({ length: 200 }, (unused, index) => member(index + 1, '0.50', index === 0 ? 'OWNER' : 'CO_SELLER'));
  const result = teamPreview('200.00', draft);
  assert.equal(result.error, ''); assert.equal(result.amounts.length, 200);
  assert.ok(result.amounts.every(amount => amount === '1.00'));
  assert.match(teamPreview('200.00', [...draft, member(201, '0.00')]).error, /200/);
});
for (let percentagePoints = 0; percentagePoints <= 10000; percentagePoints += 25) {
  check(`比例${percentagePoints}/10000精确保存且分配金额守恒`, () => {
    const draft = [member(1, new Decimal(percentagePoints).div(100).toFixed(2), 'OWNER'), member(2, new Decimal(10000 - percentagePoints).div(100).toFixed(2))];
    const result = teamPreview('123456789.01', draft);
    assert.equal(result.error, '');
    assert.ok(Decimal.sum(...result.amounts).eq('123456789.01'));
    assert.ok(result.amounts.every(amount => new Decimal(amount).gte(0)));
    assert.ok(Decimal.sum(...teamPayload(team, draft, '').members.map(row => row.allocatedPercentage)).eq(1));
  });
}
console.log(`H3_DEAL_TEAM_FRONTEND_CHECKS: assertions=${checks}; failed=0; decimal=true; payload_allowlist=true; http=false; browser=false`);
