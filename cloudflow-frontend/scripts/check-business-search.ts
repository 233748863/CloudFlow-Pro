import assert from 'node:assert/strict';
import {
  BUSINESS_SEARCH_META, BUSINESS_SEARCH_TYPES, businessSearchFocus, businessSearchRoute,
  parseBusinessSearchResponse, validBusinessSearchKeyword,
} from '../src/utils/businessSearch';

let checks = 0;
const check = (label: string, run: () => void) => { run(); checks++; console.log(`PASS ${label}`); };
for (const keyword of ['客户', ' AB ', '😀😀', '字'.repeat(64), '😀'.repeat(64), 'a%_', '!_%', "x' OR '1'='1"]) {
  check(`合法关键词 ${Array.from(keyword.trim()).length}个码点`, () => assert.equal(validBusinessSearchKeyword(keyword), true));
}
for (const keyword of ['', ' ', '字', '😀', '字'.repeat(65), '😀'.repeat(65), '\ud800字', '\udfff字', '甲\n乙', '甲\u0085乙', '甲\u0000乙']) {
  check('拒绝空、超长、控制字符和未配对代理项', () => assert.equal(validBusinessSearchKeyword(keyword), false));
}
check('仅六类来源与现有读取权限', () => {
  assert.equal(BUSINESS_SEARCH_TYPES.length, 6);
  assert.deepEqual(BUSINESS_SEARCH_META.EMPLOYEE.permissions, ['hr:employees:list', 'hr:employees:view']);
  assert.deepEqual(BUSINESS_SEARCH_META.WORKFLOW_INSTANCE.permissions, ['workflow:process:view']);
});
for (const type of BUSINESS_SEARCH_TYPES) {
  check(`${type}固定站内详情路径`, () => assert.equal(businessSearchRoute(type, '123'), `${BUSINESS_SEARCH_META[type].route}123`));
  for (const identifier of ['', '//evil.test', '../1', '1/../../1', '1?next=//evil.test', '1#payload', 'https://evil.test', '1\n']) {
    check(`${type}拒绝不安全编号`, () => assert.throws(() => businessSearchRoute(type, identifier)));
  }
}
check('工作流字符串编号不强制转为数值', () => assert.equal(businessSearchRoute('WORKFLOW_INSTANCE', 'run_uuid-123'), '/workflow/search-instance/run_uuid-123'));
for (const identifier of ['0', '-1', '01', '1.5', '1e2', 'a', '1'.repeat(20)]) {
  check('数值业务编号严格限定', () => assert.throws(() => businessSearchRoute('CUSTOMER', identifier)));
}
check('详情参数只接受唯一安全整数', () => {
  assert.equal(businessSearchFocus(''), null);
  assert.equal(businessSearchFocus('?page=2&searchId=42'), 42);
  assert.equal(businessSearchFocus('?searchId=9007199254740991'), Number.MAX_SAFE_INTEGER);
});
for (const query of ['?searchId=0', '?searchId=01', '?searchId=-1', '?searchId=1&searchId=2', '?searchId=9007199254740992', '?searchId=1e2', '?searchId=1%0A']) {
  check('拒绝重复和丢失精度的详情参数', () => assert.throws(() => businessSearchFocus(query)));
}
const response = () => ({ keyword: '客户', limitPerType: 5, groups: BUSINESS_SEARCH_TYPES.map(type => ({
  type, state: 'AVAILABLE', hasMore: false,
  items: [{ type, id: '123', title: '真实名称', number: null, status: null, route: businessSearchRoute(type, '123') }],
})) });
check('六组真实结果完整解析', () => assert.deepEqual(parseBusinessSearchResponse(response(), '客户', 5), response()));
const invalid = (label: string, mutate: (value: ReturnType<typeof response>) => void) => check(label, () => {
  const value = response(); mutate(value); assert.throws(() => parseBusinessSearchResponse(value, '客户', 5));
});
invalid('拒绝旧关键词响应', value => { value.keyword = '旧词'; });
invalid('拒绝不匹配每组上限', value => { value.limitPerType = 10; });
invalid('拒绝缺少分组', value => { value.groups.pop(); });
invalid('拒绝多余分组', value => { value.groups.push(value.groups[0]); });
invalid('拒绝重复分组', value => { value.groups[1] = value.groups[0]; });
invalid('拒绝重复记录', value => { value.groups[0].items.push(value.groups[0].items[0]); });
invalid('拒绝超出每类上限', value => { value.groups[0].items = Array.from({ length: 6 }, () => value.groups[0].items[0]); });
invalid('拒绝任意服务返回地址', value => { value.groups[0].items[0].route = '//evil.test'; });
invalid('拒绝记录跨类型混入', value => { value.groups[0].items[0].type = 'ASSET'; });
invalid('拒绝空标题', value => { value.groups[0].items[0].title = ' '; });
invalid('无权限状态不得携带记录', value => { value.groups[0].state = 'FORBIDDEN'; });
invalid('模块失败状态不得携带更多标记', value => { value.groups[0].state = 'UNAVAILABLE'; value.groups[0].items = []; value.groups[0].hasMore = true; });
check('无结果、无权限和失败状态保持区别', () => {
  const value = response();
  value.groups[0] = { ...value.groups[0], items: [] };
  value.groups[1] = { ...value.groups[1], items: [], state: 'FORBIDDEN' };
  value.groups[2] = { ...value.groups[2], items: [], state: 'UNAVAILABLE' };
  assert.deepEqual(parseBusinessSearchResponse(value, '客户', 5).groups.slice(0, 3).map(group => group.state), ['AVAILABLE', 'FORBIDDEN', 'UNAVAILABLE']);
});
console.log(`BUSINESS_SEARCH_FRONTEND_RULES: checks=${checks}; failed=0`);
