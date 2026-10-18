import assert from 'node:assert/strict';
import { checkKnowledgePublication, checkOpportunityImportAuthorization, checkReportMobileRoutes, reportTables, tenantPackageTables, imTables } from './check-batch-h-contracts.mjs';
import { before, test } from 'node:test';
import { Decimal, MemorySql, SqlError, canonical, expression, parseCreate, parseInsert, parseSelect, scanSql, statements, targetTable, text, word } from './check-batch-h-contracts-sql.mjs';
import { checkAdvanceMobileRoutes, checkDataSourceRoutes, checkDataSourceSeeds, checkDemoBusinessFacts, checkDemoGuard, checkDemoInventory, checkDemoLeave, checkDemoOvertime, checkDemoReferences, checkFilePreviewMobileRoutes, checkFoundationEquality, checkLedger, checkMeetingMobileRoutes, checkMenus, checkOpportunityDefaults, checkOpportunityMobileRoutes, checkPages, checkPolicies, checkPortalRoutes, checkReplay, checkRoles, checkTableCounts, compareSchema, designContracts, expectedRolePairs, foundation, guardedPermissions, loadRepository, projectDemo, projectRows, replayFormal } from './check-batch-h-contracts.mjs';

const tokens = source => scanSql(source, '<内存自测>').tokens;

test('H3商机导入：公共授权链和逐行权限不得省略', () => {
  assert.deepEqual([...checkOpportunityImportAuthorization(repository)], ['crm:opportunity:import']);
  for (const [suffix, original, replacement] of [
    ['ImportRegistry.java', 'if (!hasPermission(definition.permission()))', 'if (false)'],
    ['ImportIdentity.java', 'if (!ImportRegistry.hasPermission(permission))', 'if (false)'],
    ['OpportunityImport.java', 'requireIdentity(context, permission());', ''],
    ['OpportunityImport.java', 'requireIdentity(context, creating ? "crm:opportunity:add" : updatePermission());', ''],
    ['OpportunityImport.java', 'identity.require(requiredPermission)', 'identity.require()'],
    ['ImportEngine.java', 'identity.require(definition.updatePermission());', ''],
  ]) {
    const altered = { ...repository, load(file) {
      const source = repository.load(file);
      if (!file.endsWith('/' + suffix)) return source;
      const changed = source.replaceAll(original, replacement);
      assert.notEqual(changed, source, suffix + ' must alter a real guard');
      return changed;
    } };
    assert.throws(() => checkOpportunityImportAuthorization(altered), /H3商机导入/, suffix);
  }
});
import { checkTenantPackageRoutes, checkTenantPackageSeeds } from './check-batch-h-contracts.mjs';
import { checkImConfigMenus, checkImRecoverySeed } from './check-batch-h-contracts.mjs';
import { checkDemoSettlementSources } from './check-batch-h-contracts.mjs';

test('离职结算：普通演示付款与工资不得伪造来源和占位', () => {
  checkDemoSettlementSources(repository.scans.get('07.cloudflow-demo-seed.sql'));
  const scan = source => ({ statements: statements(scanSql(source, '<结算来源变造>')) });
  for (const mode of ['SELECT', 'VALUES']) {
    const make = values => scan(`INSERT INTO biz_payment_request (source_biz_type, source_biz_id) ${mode} ${mode === 'VALUES' ? '(' : ''}${values[0]}, ${values[1]}${mode === 'VALUES' ? ')' : ''};
      INSERT INTO hr_salary_slip (reserved_settlement_id) ${mode} ${mode === 'VALUES' ? '(' : ''}${values[2]}${mode === 'VALUES' ? ')' : ''};`);
    checkDemoSettlementSources(make(['NULL', 'NULL', 'NULL']));
    for (const index of [0, 1, 2]) for (const invalid of ["'业务登记-0001'", '1', "'NULL'"]) {
      const values = ['NULL', 'NULL', 'NULL']; values[index] = invalid;
      assert.throws(() => checkDemoSettlementSources(make(values)), /不得伪造人事来源或工资占位/);
    }
  }
});

test('G4配置与执行：六菜单逐字段与角色不得越界', () => {
  checkImConfigMenus(repository, memory);
  for (const menuId of ['1780', '1781', '1782', '1783', '1784', '1785']) for (const [field, value] of [['menu_id', Decimal.from(2100)], ['parent_id', Decimal.from(2)], ['path', '/wrong'], ['component', 'pages/Other'], ['perms', 'system:im:other'], ['visible', '2'], ['status', '1'], ['is_cache', Decimal.from(1)], ['query', 'bypass=true']]) {
    const altered = memory.clone();
    altered.rows('sys_menu').find(row => text(row.menu_id) === menuId)[field] = value;
    assert.throws(() => checkImConfigMenus(repository, altered), /G4/);
  }
  for (const menuId of ['1781', '1783', '1784', '1785']) for (const [field, value] of [['role_id', Decimal.from(5)], ['tenant_id', Decimal.from(100001)]]) {
    const altered = memory.clone();
    altered.rows('sys_role_menu').find(row => text(row.menu_id) === menuId)[field] = value;
    assert.throws(() => checkImConfigMenus(repository, altered), /G4管理及本人精确授权/);
  }
});

test('G4恢复：任务时限、锁、服务和冲突保护不可变造', () => {
  for (const [field, value] of [['interval_ms', Decimal.from(1)], ['timeout_seconds', Decimal.from(301)], ['lock_time_seconds', Decimal.from(1)],
    ['concurrent_flag', Decimal.from(1)], ['retry_count', Decimal.from(1)], ['service_name', 'hr'], ['status', 'DISABLED']]) {
    const altered = memory.clone();
    altered.rows('sys_job').find(row => text(row.job_id) === '1784')[field] = value;
    assert.throws(() => checkImRecoverySeed(repository, altered), /G4恢复/);
  }
  const scans = new Map(repository.scans);
  const original = scans.get('06.cloudflow-business-seed.sql');
  scans.set('06.cloudflow-business-seed.sql', { ...original, statements: original.statements.filter(entry => targetTable(entry) !== 'g4_im_recovery_guard') });
  assert.throws(() => checkImRecoverySeed({ ...repository, scans }, memory), /G4恢复编号与名称落库保护/);
});

test('G4配置：取消演示授权排除范围即失败', () => {
  const source = repository.load('cloudflow-backend/DB/07.cloudflow-demo-seed.sql');
  const altered = source.replace('AND m.menu_id NOT BETWEEN 1780 AND 1799', '');
  assert.notEqual(altered, source);
  const expanded = new Map(repository.scans);
  const scan = scanSql(altered, '<G4演示越权>'); scan.statements = statements(scan);
  expanded.set('07.cloudflow-demo-seed.sql', scan);
  assert.throws(() => checkImConfigMenus({ ...repository, scans: expanded }, memory), /07不得扩授G4/);
});

test('G4配置与同步：两种终端移除入口权限均失败', () => {
  for (const [page, permission] of [['ImConfigPage', 'system:im:config:list'], ['ImSyncPage', 'system:im:sync:list']]) for (const section of ['const desktopRoutes = [', 'const mobileRoutes = [']) {
    const altered = { ...repository, load(file) {
      const source = repository.load(file);
      if (file !== 'cloudflow-frontend/src/router.tsx') return source;
      const offset = source.indexOf(section);
      const changed = source.slice(0, offset) + source.slice(offset).replace(`guarded(<${page} />, ['${permission}'])`, `guarded(<${page} />, [])`);
      assert.notEqual(changed, source);
      return changed;
    } };
    assert.throws(() => checkImConfigMenus(altered, memory), /G4(配置|同步)电脑手机须明确权限路由/);
  }
});

test('H5套餐：四种落库冲突和跨租户演示授权逐项核验', () => {
  checkTenantPackageSeeds(repository, memory);
  for (const [field, value] of [['role_id', Decimal.from(5)], ['tenant_id', Decimal.from(100001)]]) {
    const altered = memory.clone();
    altered.rows('sys_role_menu').find(row => text(row.menu_id) === '1971')[field] = value;
    assert.throws(() => checkTenantPackageSeeds(repository, altered), /正式套餐授权/);
  }
});

test('H5套餐：电脑手机均须明确路由和再认证', () => {
  checkTenantPackageRoutes(repository);
  for (const section of ['const desktopRoutes = [', 'const mobileRoutes = [']) {
    const altered = { ...repository, load(file) {
      const source = repository.load(file);
      if (file !== 'cloudflow-frontend/src/router.tsx') return source;
      const offset = source.indexOf(section);
      return source.slice(0, offset) + source.slice(offset).replace("guarded(<TenantPackagePage />, ['system:tenant-package:list'])", 'guarded(<TenantPackagePage />, [])');
    } };
    assert.throws(() => checkTenantPackageRoutes(altered), /明确权限路由/);
  }
});

test('H5套餐：离线缓存和演示管理员扩授变造均拒绝', () => {
  const offline = { ...repository, load(file) {
    const source = repository.load(file);
    return file.endsWith('/vite.config.ts') ? source.replace('|tenant-package|tenant', '') : source;
  } };
  assert.throws(() => checkTenantPackageRoutes(offline), /禁止离线缓存/);
  const file = '07.cloudflow-demo-seed.sql';
  const source = repository.load('cloudflow-backend/DB/' + file);
  const changed = source.replace(' AND m.menu_id NOT BETWEEN 1970 AND 1976', ' AND m.menu_id NOT BETWEEN 1973 AND 1976');
  assert.notEqual(changed, source);
  const expanded = new Map(repository.scans);
  expanded.set(file, { ...expanded.get(file), statements: statements(scanSql(changed, file)) });
  assert.throws(() => checkTenantPackageSeeds({ ...repository, scans: expanded }, memory), /不得向演示管理员/);
});

test('H5套餐：四个平台入口回退动态菜单或删除权限均拒绝', () => {
  for (const section of ['const desktopRoutes = [', 'const mobileRoutes = [']) {
    for (const [component, permission] of [['TenantPackagePage', 'system:tenant-package:list'], ['TenantList', 'system:tenant:list'], ['DataSourcePage', 'system:data-source:list'], ['OauthClientPage', 'system:oauth2:client:list']]) {
      const original = `guarded(<${component} />, ['${permission}'])`;
      for (const replacement of [`guarded(<DynamicMenuRoute />, ['${permission}'])`, `guarded(<${component} />, [])`]) {
        const altered = { ...repository, load(file) {
          const source = repository.load(file);
          if (file !== 'cloudflow-frontend/src/router.tsx') return source;
          const offset = source.indexOf(section);
          const changed = source.slice(0, offset) + source.slice(offset).replace(original, replacement);
          assert.notEqual(changed, source);
          return changed;
        } };
        assert.throws(() => checkTenantPackageRoutes(altered), /明确权限路由/);
      }
    }
  }
});

test('H5套餐：管理员绕过页面权限或普通页面读取平台租户均拒绝', () => {
  for (const [target, original, replacement, failure] of [
    ['components/common/RouteGuard', 'if (requiredPermissions.length > 0)', 'if (requiredPermissions.length > 0 && !isAdmin)', /不能绕过套餐/],
    ['pages/system/UserList', 'getUserList();', 'getTenantList();', /不可调用平台租户列表/],
    ['pages/system/RoleList', 'getRoleList({', 'getTenantList({', /不可调用平台租户列表/],
  ]) {
    const altered = { ...repository, load(file) {
      const source = repository.load(file);
      if (file !== `cloudflow-frontend/src/${target}.tsx`) return source;
      const changed = source.replace(original, replacement);
      assert.notEqual(changed, source);
      return changed;
    } };
    assert.throws(() => checkTenantPackageRoutes(altered), failure);
  }
});

test('H5套餐：切换候选不得离线缓存或改回平台列表', () => {
  for (const [target, original, replacement, failure] of [
    ['cloudflow-frontend/vite.config.ts', '|tenant\\/switch-options$', '', /切换候选接口必须禁止离线缓存/],
    ['cloudflow-frontend/src/components/TenantSwitcher.tsx', "hasPermission('system:tenant:switch')", 'true', /切换器必须遵守903/],
    ['cloudflow-frontend/src/components/TenantSwitcher.tsx', 'getTenantSwitchOptions', 'getTenantList', /切换器必须遵守903/],
  ]) {
    const altered = { ...repository, load(file) {
      const source = repository.load(file);
      if (file !== target) return source;
      const changed = source.replace(original, replacement);
      assert.notEqual(changed, source);
      return changed;
    } };
    assert.throws(() => checkTenantPackageRoutes(altered), failure);
  }
});
const statement = source => statements(scanSql(source, '<内存自测>'))[0];
const evaluate = source => new MemorySql(new Map()).evaluate(expression(tokens(source)));

test('词法解析隔离注释、字符串与分号，保留真实可执行注释', () => {
  const source = "-- CREATE TABLE fake ();\nSELECT 'a,;--b', 'it''s', 'x\\\'y'; /* CREATE TABLE fake2 (); */ SELECT 2; /*!80000 SELECT 3; */";
  const parsed = statements(scanSql(source));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0][1].value, 'a,;--b');
  assert.equal(parsed[0][3].value, "it's");
  assert.equal(parsed[0][5].value, "x'y");
  assert.equal(parsed[2][1].value, '3');
  assert.throws(() => scanSql("SELECT 'unfinished"), /unterminated/);
  assert.throws(() => statements(scanSql('SELECT (1;')), /unbalanced/);
});

test('十进制金额使用整数分数计算，半入舍入不丢精度', () => {
  assert.equal(Decimal.from('0.1').add('0.2').toString(), '0.3');
  assert.equal(Decimal.from('99999999.99').multiply(100).toString(), '9999999999');
  assert.equal(Decimal.from('10').divide(3).round(2).toString(), '3.33');
  assert.equal(Decimal.from('-0.015').round(2).toString(), '-0.02');
  assert.equal(text(evaluate('ROUND(10 / 3, 2)')), '3.33');
});

test('实际 SQL 三值逻辑、CASE、元组与条件优先级', () => {
  assert.equal(evaluate('NULL = 1'), null);
  assert.equal(evaluate('NULL <=> NULL'), true);
  assert.equal(evaluate('NULL AND FALSE'), false);
  assert.equal(evaluate('NULL OR TRUE'), true);
  assert.equal(evaluate('3 NOT IN (1, NULL)'), null);
  assert.equal(evaluate("(4,'hr') IN ((1,'admin'),(4,'hr'))"), true);
  assert.equal(text(evaluate('CASE WHEN 1 = 0 THEN 9 ELSE 3 + 2 * 4 END')), '11');
  assert.equal(evaluate('2 BETWEEN 1 AND 3 AND 4 NOT BETWEEN 5 AND 6'), true);
  assert.throws(() => evaluate('UNKNOWN_FUNCTION(1)'), /unsupported function/);
});

test('INSERT 按显式列映射，默认与唯一键生效，错误列与列数拒绝', () => {
  const schema = parseCreate(statement('CREATE TABLE demo (id BIGINT NOT NULL AUTO_INCREMENT, amount DECIMAL(10,2) DEFAULT 0, code VARCHAR(20), PRIMARY KEY(id), UNIQUE KEY uk_code(code)) ENGINE=InnoDB AUTO_INCREMENT=100;'));
  const memory = new MemorySql(new Map([['demo', schema]]));
  memory.execute(statement("INSERT INTO demo (code, amount) VALUES ('one', 1.50);"));
  assert.equal(text(memory.rows('demo')[0].id), '100');
  assert.equal(text(memory.rows('demo')[0].amount), '1.5');
  assert.throws(() => memory.execute(statement("INSERT INTO demo (code) VALUES ('one');")), /duplicate key/);
  memory.execute(statement("INSERT IGNORE INTO demo (code, amount) VALUES ('one', 9);"));
  assert.equal(text(memory.rows('demo')[0].amount), '1.5');
  assert.equal(memory.writes.at(-1).duplicate, true);
  assert.throws(() => parseInsert(statement('INSERT INTO demo (missing) VALUES (1)'), schema), /does not exist/);
  assert.throws(() => parseInsert(statement('INSERT INTO demo (id, code) VALUES (1)'), schema), /columns but/);
  assert.throws(() => parseInsert(statement('INSERT INTO demo (id, id) VALUES (1,2)'), schema), /duplicate INSERT column/);
});

test('生成列按真实表达式建立唯一约束，显式写入及未支持更新明确拒绝', () => {
  const schema = parseCreate(statement('CREATE TABLE demo (id BIGINT NOT NULL, current_flag INT NOT NULL, member_id BIGINT NOT NULL, current_member_id BIGINT GENERATED ALWAYS AS (CASE WHEN current_flag=1 THEN member_id ELSE NULL END) STORED, PRIMARY KEY(id), UNIQUE KEY uk_member(current_member_id));'));
  const memory = new MemorySql(new Map([['demo', schema]]));
  memory.execute(statement('INSERT INTO demo (id,current_flag,member_id) VALUES (1,1,10),(2,0,10),(3,0,10);'));
  assert.deepEqual(memory.rows('demo').map(row => row.current_member_id === null ? null : text(row.current_member_id)), ['10', null, null]);
  assert.throws(() => memory.execute(statement('INSERT INTO demo (id,current_flag,member_id) VALUES (4,1,10);')), /duplicate key/);
  assert.throws(() => memory.execute(statement('INSERT INTO demo (id,current_flag,member_id,current_member_id) VALUES (4,1,11,99);')), /generated columns/);
  assert.throws(() => memory.execute(statement('UPDATE demo SET current_flag=0 WHERE id=1;')), /generated columns/);
  assert.throws(() => parseCreate(statement('CREATE TABLE demo (id BIGINT GENERATED ALWAYS AS (1) STORED DEFAULT 1);')), /incompatible/);
  const changed = { ...schema, columns: new Map(schema.columns) };
  changed.columns.set('current_member_id', { ...schema.columns.get('current_member_id'), generated: expression(tokens('member_id')) });
  assert.throws(() => compareSchema(changed, { ...schema, full: true }), /current_member_id.generated/);
});

test('SELECT 关联、UNION ALL、重复引用列、NOT EXISTS 与聚合按真实结果计算', () => {
  const schema = parseCreate(statement('CREATE TABLE demo (id INT NOT NULL, amount DECIMAL(10,2), PRIMARY KEY(id));'));
  const memory = new MemorySql(new Map([['demo', schema]]));
  memory.execute(statement('INSERT INTO demo VALUES (1,1.50),(2,2.25);'));
  const selected = memory.select(parseSelect(tokens('SELECT source.id, source.id, sums.amount FROM demo source JOIN (SELECT 1 AS id, 4.00 AS amount UNION ALL SELECT 2, 8.00) sums ON source.id = sums.id WHERE source.id IN (1,2) ORDER BY source.id DESC')));
  assert.deepEqual(Object.values(selected[0]).map(text), ['2', '2', '8']);
  const missing = memory.select(parseSelect(tokens('SELECT seeds.id FROM (SELECT 2 AS id UNION ALL SELECT 3) seeds WHERE NOT EXISTS (SELECT 1 FROM demo existing WHERE existing.id = seeds.id)')));
  assert.deepEqual(missing.map(row => text(row.id)), ['3']);
  assert.equal(text(memory.select(parseSelect(tokens('SELECT SUM(amount) AS total FROM demo')))[0].total), '3.75');
  assert.throws(() => memory.select(parseSelect(tokens('SELECT missing FROM demo'))), /unresolved reference/);
});

test('真实 CHECK 拒绝错误载荷；注释或表名中的 CHECK 不构成断言', () => {
  const schema = parseCreate(statement('CREATE TEMPORARY TABLE check_guard (passed TINYINT NOT NULL CHECK (passed = 1));'));
  const memory = new MemorySql(new Map([['check_guard', schema]]));
  memory.execute(statement('INSERT INTO check_guard SELECT 1;'));
  assert.throws(() => memory.execute(statement('INSERT INTO check_guard SELECT 0;')), /CHECK .* rejected row/);
  assert.throws(() => memory.execute(statement('INSERT INTO check_guard SELECT NULL;')), /NOT NULL .* rejected row/);
  const noCheck = parseCreate(statement('CREATE TEMPORARY TABLE check_guard (passed TINYINT NOT NULL /* CHECK (passed = 1) */);'));
  assert.equal(noCheck.checks.size, 0);
});

test('结构比较能识别精度、索引顺序、唯一性与约束丢失', () => {
  const source = 'CREATE TABLE sample (id BIGINT NOT NULL, tenant_id BIGINT NOT NULL, amount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT \'金额\', PRIMARY KEY(id), UNIQUE KEY uk_source(tenant_id,id), CONSTRAINT ck_amount CHECK (amount >= 0)) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4;';
  const expected = { ...parseCreate(statement(source)), full: true };
  expected.columns.get('id').comment = '主键';
  expected.columns.get('tenant_id').comment = '租户';
  const original = () => {
    const result = parseCreate(statement(source));
    result.columns.get('id').comment = '主键';
    result.columns.get('tenant_id').comment = '租户';
    return result;
  };
  compareSchema(original(), expected);
  const wrongPrecision = original(); wrongPrecision.columns.get('amount').width = canonical(tokens('8,2'));
  assert.throws(() => compareSchema(wrongPrecision, expected), /width/);
  const wrongIndex = original(); wrongIndex.indexes.get('uk_source').columns.reverse();
  assert.throws(() => compareSchema(wrongIndex, expected), /uk_source/);
  const nonUnique = original(); nonUnique.indexes.get('uk_source').unique = false;
  assert.throws(() => compareSchema(nonUnique, expected), /uk_source/);
  const missingCheck = original(); missingCheck.checks.clear();
  assert.throws(() => compareSchema(missingCheck, expected), /CHECK/);
});

test('权限只从实际调用/页面守卫提取，注释字符串不能伪装权限检查', () => {
  const permissions = guardedPermissions(`// @SaCheckPermission("hr:overtime:price")\nconst fake = "@SaCheckPermission('hr:overtime:price')";\n@SaCheckPermission({"hr:overtime:mine", "hr:overtime:apply"})\nStpUtil.hasPermission("oa:consumable-ledger:cost");`);
  assert.deepEqual([...permissions], ['hr:overtime:mine', 'hr:overtime:apply', 'oa:consumable-ledger:cost']);
});

test('foundations 忽略空白注释，真实值变化与伪标记必须报错', () => {
  const source = "-- batch-h-foundations:start\nINSERT INTO a VALUES (1,'DRAFT');\n-- batch-h-foundations:end";
  const scan = content => ({ ...scanSql(content, '<内存foundations>'), statements: statements(scanSql(content)) });
  assert.doesNotThrow(() => checkFoundationEquality(scan(source), scan(source.replace('VALUES', '/* note */ VALUES'))));
  assert.throws(() => checkFoundationEquality(scan(source), scan(source.replace('DRAFT', 'PUBLISHED'))), /有效语句不同/);
  assert.throws(() => foundation(scan("SELECT '-- batch-h-foundations:start'; SELECT '-- batch-h-foundations:end';")), /标记数量/);
});

let repository;
let memory;
let beforeH;
let demo;
before(() => {
  repository = loadRepository();
  ({ memory, beforeH } = replayFormal(repository));
  demo = projectDemo(repository, memory);
});

test('真实仓库：374表、143个H菜单、842对H角色授权全部满足独立预期', () => {
  checkTableCounts(repository);
  assert.equal(repository.schemas.size, 374);
  for (const [name, expected] of designContracts(repository)) compareSchema(repository.schemas.get(name), expected);
  checkMenus(memory);
  checkRoles(memory, beforeH);
  assert.equal(expectedRolePairs().size, 842);
  assert.throws(() => checkTableCounts({ ...repository, counts: [50,45,102,90,35] }), /建表数/);
});

test('邮件种子保护 mutation：删除保护或允许覆盖现有邮件事实必须失败', () => {
  checkDemoGuard(repository, memory);
  const file = '07.cloudflow-demo-seed.sql';
  const original = repository.scans.get(file);
  const omitted = new Map(repository.scans);
  omitted.set(file, { ...original, statements: original.statements.filter(entry => targetTable(entry) !== 'crm_email_demo_seed_guard') });
  assert.throws(() => checkDemoGuard({ ...repository, scans: omitted }, memory), /邮件业务事实保护/);
  const weakened = new Map(repository.scans);
  weakened.set(file, { ...original, statements: original.statements.map(entry => targetTable(entry) === 'crm_email_demo_seed_guard' && entry[0].value.toUpperCase() === 'INSERT'
    ? statement('INSERT INTO crm_email_demo_seed_guard SELECT 1;') : entry) });
  assert.throws(() => checkDemoGuard({ ...repository, scans: weakened }, memory), /邮件保护检查未拒绝/);
});

test('门户种子保护 mutation：删除保护或只保护账号不保护知识发布必须失败', () => {
  checkDemoGuard(repository, memory);
  const file = '07.cloudflow-demo-seed.sql';
  const original = repository.scans.get(file);
  const omitted = new Map(repository.scans);
  omitted.set(file, { ...original, statements: original.statements.filter(entry => targetTable(entry) !== 'portal_demo_seed_guard') });
  assert.throws(() => checkDemoGuard({ ...repository, scans: omitted }, memory), /门户业务事实保护/);
  const weakened = new Map(repository.scans);
  weakened.set(file, { ...original, statements: original.statements.map(entry => targetTable(entry) === 'portal_demo_seed_guard' && entry[0].value.toUpperCase() === 'INSERT'
    ? statement('INSERT INTO portal_demo_seed_guard SELECT NOT EXISTS(SELECT 1 FROM sys_portal_user WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50);') : entry) });
  assert.throws(() => checkDemoGuard({ ...repository, scans: weakened }, memory), /门户保护检查未拒绝/);
});

test('借款种子保护 mutation：删除保护或只保护借款不保护还款必须失败', () => {
  checkDemoGuard(repository, memory);
  const file = '07.cloudflow-demo-seed.sql';
  const original = repository.scans.get(file);
  const omitted = new Map(repository.scans);
  omitted.set(file, { ...original, statements: original.statements.filter(entry => targetTable(entry) !== 'hr_advance_demo_seed_guard') });
  assert.throws(() => checkDemoGuard({ ...repository, scans: omitted }, memory), /借款及还款事实保护/);
  const weakened = new Map(repository.scans);
  weakened.set(file, { ...original, statements: original.statements.map(entry => targetTable(entry) === 'hr_advance_demo_seed_guard' && entry[0].value.toUpperCase() === 'INSERT'
    ? statement('INSERT INTO hr_advance_demo_seed_guard SELECT NOT EXISTS(SELECT 1 FROM hr_employee_advance WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50);') : entry) });
  assert.throws(() => checkDemoGuard({ ...repository, scans: weakened }, memory), /借款保护未拒绝/);
});

test('借款结构 mutation：金额精度、来源唯一键和余额约束不可放宽', () => {
  for (const table of ['hr_employee_advance', 'hr_advance_repayment']) {
    for (const [collection, pattern] of [['indexes', /索引/], ['checks', /CHECK/]]) {
      const schemas = new Map(repository.schemas);
      const original = schemas.get(table);
      schemas.set(table, { ...original, [collection]: new Map() });
      assert.throws(() => checkTableCounts({ ...repository, schemas }), pattern, `${table}.${collection}`);
    }
    const schemas = new Map(repository.schemas);
    const original = schemas.get(table);
    const amountField = table === 'hr_employee_advance' ? 'advance_amount' : 'repay_amount';
    const columns = new Map(original.columns);
    const column = columns.get(amountField);
    columns.set(amountField, { ...column, width: canonical(tokens('10,2')) });
    schemas.set(table, { ...original, columns });
    assert.throws(() => checkTableCounts({ ...repository, schemas }), new RegExp(amountField), `${table}.${amountField}`);
  }
});

test('真实菜单 mutation：错页面、占用空号与额外权限必须失败', () => {
  const altered = memory.clone();
  altered.rows('sys_menu').find(row => text(row.menu_id) === '1817').component = 'pages/admin/ConsumableReportPage';
  assert.throws(() => checkMenus(altered), /1817/);
  const reserved = memory.clone();
  reserved.rows('sys_menu').push({ ...reserved.rows('sys_menu').find(row => text(row.menu_id) === '1818'), menu_id: Decimal.from(1819) });
  assert.throws(() => checkMenus(reserved), /菜单行数/);
});

test('H1菜单 mutation：代理页框架与按钮可见性必须精确匹配', () => {
  const frame = memory.clone();
  frame.rows('sys_menu').find(row => text(row.menu_id) === '1850').is_frame = Decimal.from(1);
  assert.throws(() => checkMenus(frame), /1850/);
  const visible = memory.clone();
  visible.rows('sys_menu').find(row => text(row.menu_id) === '1851').visible = Decimal.from(0);
  assert.throws(() => checkMenus(visible), /1851/);
});

test('H1权限 mutation：实际后端新增未批准代理管理权限必须失败', () => {
  checkPages(repository, memory);
  const controller = 'cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/controller/WorkflowAgentController.java';
  const altered = { ...repository, load(file) {
    const source = repository.load(file);
    return file === controller ? source.replace('workflow:agent:mine', 'workflow:agent:manage') : source;
  } };
  assert.throws(() => checkPages(altered, memory), /workflow:agent:manage/);
});

test('H5预览权限 mutation：移除实际预览门禁必须失败', () => {
  checkPages(repository, memory);
  const altered = { ...repository, load(file) {
    const source = repository.load(file);
    return file.startsWith('cloudflow-backend/') ? source.replaceAll('"system:file:preview"', '"system:file:list"') : source;
  } };
  assert.throws(() => checkPages(altered, memory), /system:file:preview/);
});

test('真实授权 mutation：维持842总数但互换角色权限仍被差集抓获', () => {
  const altered = memory.clone();
  const grant = altered.rows('sys_role_menu').find(row => text(row.role_id) === '4' && text(row.menu_id) === '1834');
  grant.role_id = Decimal.from(5);
  assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
  const generic = memory.clone();
  const startMenu = generic.rows('sys_menu').find(row => row.perms === 'workflow:process:start');
  generic.rows('sys_role_menu').push({ role_id: Decimal.from(6), menu_id: startMenu.menu_id, tenant_id: Decimal.from(100000) });
  assert.throws(() => checkRoles(generic, beforeH), /通用发起角色/);
});

test('H2补偿政策 mutation：替换法务授权为财务或员工授权仍被拒绝', () => {
  for (const roleId of [3, 5]) {
    const altered = memory.clone();
    altered.rows('sys_role_menu').find(row => text(row.role_id) === '6' && text(row.menu_id) === '1868').role_id = Decimal.from(roleId);
    assert.throws(() => checkRoles(altered, beforeH), /补偿政策仅ADMIN、HR及LEGAL授权/);
  }
});

test('H2结算 mutation：财务不得修改核定或提交、人事不得收款、员工不得管理结算', () => {
  for (const [menuId, previousRole, replacedRole] of [[1861,4,3], [1862,4,3], [1860,3,5], [1863,3,5], [1864,4,3], [1865,4,5], [1866,3,4], [1866,3,5], [1867,3,4], [1867,3,5]]) {
    const altered = memory.clone();
    altered.rows('sys_role_menu').find(row => text(row.role_id) === String(previousRole) && text(row.menu_id) === String(menuId)).role_id = Decimal.from(replacedRole);
    assert.throws(() => checkRoles(altered, beforeH), /结算.*精确授权/);
  }
});

test('H2借款 mutation：员工或HR获得财务权限、遗漏草稿且重复授予提交均失败', () => {
  for (const roleId of [4, 5]) {
    for (const menuId of [1874, 1875]) {
      const altered = memory.clone();
      altered.rows('sys_role_menu').find(row => text(row.role_id) === '3' && text(row.menu_id) === String(menuId)).role_id = Decimal.from(roleId);
      assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
    }
  }
  const submission = memory.clone();
  submission.rows('sys_role_menu').find(row => text(row.role_id) === '5' && text(row.menu_id) === '1872').menu_id = Decimal.from(1873);
  assert.throws(() => checkRoles(submission, beforeH), /精确角色授权/);
});

test('H2借款 mutation：管理入口重复占用提交编号或改为非本人入口均失败', () => {
  const moved = memory.clone();
  moved.rows('sys_menu').find(row => text(row.menu_id) === '1871').menu_id = Decimal.from(1873);
  assert.throws(() => checkMenus(moved), /菜单编号/);
  const page = memory.clone();
  page.rows('sys_menu').find(row => text(row.menu_id) === '1876').component = 'pages/hr/HrAdvancePage';
  assert.throws(() => checkMenus(page), /1876/);
  const permission = memory.clone();
  permission.rows('sys_menu').find(row => text(row.menu_id) === '1872').perms = 'hr:advance:apply-all';
  assert.throws(() => checkMenus(permission), /1872/);
});

test('H2技能 mutation：保持总数但扩大员工写权限必须失败', () => {
  for (const menuId of [1878, 1879]) {
    const altered = memory.clone();
    altered.rows('sys_role_menu').find(row => text(row.role_id) === '4' && text(row.menu_id) === String(menuId)).role_id = Decimal.from(5);
    assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
  }
});

test('H2技能 mutation：挪用预留编号或更换本人入口必须失败', () => {
  const moved = memory.clone();
  moved.rows('sys_menu').find(row => text(row.menu_id) === '1877').menu_id = Decimal.from(1882);
  assert.throws(() => checkMenus(moved), /菜单编号/);
  const page = memory.clone();
  page.rows('sys_menu').find(row => text(row.menu_id) === '1893').component = 'pages/hr/HrSkillPage';
  assert.throws(() => checkMenus(page), /1893/);
  const visible = memory.clone();
  visible.rows('sys_menu').find(row => text(row.menu_id) === '1880').visible = Decimal.from(0);
  assert.throws(() => checkMenus(visible), /1880/);
});

test('H2技能 mutation：批准的新改表遗漏约束必须失败', () => {
  for (const [table, collection, expected] of [
    ['hr_skill', 'indexes', /索引/],
    ['hr_position_skill', 'checks', /CHECK/],
    ['hr_employee_skill', 'indexes', /索引/],
    ['hr_employee_skill', 'checks', /CHECK/],
    ['hr_training_course', 'checks', /CHECK/],
  ]) {
    const schemas = new Map(repository.schemas);
    const original = schemas.get(table);
    schemas.set(table, { ...original, [collection]: new Map() });
    assert.throws(() => checkTableCounts({ ...repository, schemas }), expected, table);
  }
});

test('H2绩效 mutation：员工取得管理评分推进或校准写权限必须失败', () => {
  for (const menuId of [1883, 1884, 1885, 1886]) {
    const altered = memory.clone();
    altered.rows('sys_role_menu').find(row => text(row.role_id) === '4' && text(row.menu_id) === String(menuId)).role_id = Decimal.from(5);
    assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
  }
});

test('H2绩效 mutation：改编号或将本人页面指向管理页必须失败', () => {
  const moved = memory.clone();
  moved.rows('sys_menu').find(row => text(row.menu_id) === '1882').menu_id = Decimal.from(1895);
  assert.throws(() => checkMenus(moved), /菜单编号/);
  const page = memory.clone();
  page.rows('sys_menu').find(row => text(row.menu_id) === '1894').component = 'pages/hr/HrAppraisalCyclePage';
  assert.throws(() => checkMenus(page), /1894/);
});

test('H2本人受邀评分 mutation：授权替换为管理评分或权限错配必须失败', () => {
  const grants = memory.clone();
  grants.rows('sys_role_menu').find(row => text(row.role_id) === '5' && text(row.menu_id) === '1895').menu_id = Decimal.from(1885);
  assert.throws(() => checkRoles(grants, beforeH), /精确角色授权/);
  const menus = memory.clone();
  menus.rows('sys_menu').find(row => text(row.menu_id) === '1895').perms = 'hr:appraisal:score';
  assert.throws(() => checkMenus(menus), /hr:appraisal:score 权限码唯一/);
  menus.rows('sys_menu').find(row => text(row.menu_id) === '1895').perms = 'hr:appraisal:respond-all';
  assert.throws(() => checkMenus(menus), /menu_id=1895/);
});

test('H2绩效 mutation：新表索引和约束及旧表周期关联逐项防漏', () => {
  assert.equal(repository.schemas.get('hr_appraisal_result').checks.size, 0);
  for (const [table, collections] of [
    ['hr_appraisal_cycle', ['indexes', 'checks']],
    ['hr_appraisal_kra', ['indexes', 'checks']],
    ['hr_appraisal_result', ['indexes']],
  ]) {
    for (const collection of collections) {
      const original = repository.schemas.get(table);
      assert.ok(original[collection].size > 0, `${table}.${collection}`);
      for (const name of original[collection].keys()) {
        const schemas = new Map(repository.schemas);
        const altered = new Map(original[collection]);
        altered.delete(name);
        schemas.set(table, { ...original, [collection]: altered });
        assert.throws(() => checkTableCounts({ ...repository, schemas }), /索引|CHECK/, `${table}.${name}`);
      }
    }
  }
  for (const table of ['hr_performance_objective', 'hr_performance_assignment', 'hr_perf_distribution_rule', 'hr_talent_calibration_session']) {
    const schemas = new Map(repository.schemas);
    const original = schemas.get(table);
    const columns = new Map(original.columns);
    columns.delete('cycle_id');
    schemas.set(table, { ...original, columns });
    assert.throws(() => checkTableCounts({ ...repository, schemas }), /cycle_id/, table);
  }
});

test('终态恢复授权 mutation：维持总数但授给员工或销售代表必须失败', () => {
  for (const roleId of [5, 9]) {
    const altered = memory.clone();
    altered.rows('sys_role_menu').find(row => text(row.role_id) === '8' && text(row.menu_id) === '1904').role_id = Decimal.from(roleId);
    assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
  }
});

test('H4授权 mutation：保持总数但把会议室管理交给员工必须失败', () => {
  const altered = memory.clone();
  altered.rows('sys_role_menu').find(row => text(row.role_id) === '7' && text(row.menu_id) === '1951').role_id = Decimal.from(5);
  assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
});

test('门户授权 mutation：总数相同但改授员工也必须失败', () => {
  const altered = memory.clone();
  altered.rows('sys_role_menu').find(row => text(row.role_id) === '10' && text(row.menu_id) === '1913').role_id = Decimal.from(5);
  assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
});

test('工单方案 mutation：改父菜单、权限或改授员工均必须失败', () => {
  for (const [field, value] of [['parent_id', Decimal.from(1912)], ['perms', 'crm:portal:solution:edit']]) {
    const altered = memory.clone();
    altered.rows('sys_menu').find(row => text(row.menu_id) === '1914')[field] = value;
    assert.throws(() => checkMenus(altered), /1914/);
  }
  const altered = memory.clone();
  altered.rows('sys_role_menu').find(row => text(row.role_id) === '11' && text(row.menu_id) === '1914').role_id = Decimal.from(5);
  assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
});

test('知识库 mutation：发布字段、版本隔离、清单及下载凭据保护被改必须失败', () => {
  checkKnowledgePublication(repository);
  const backend = 'cloudflow-backend/';
  const oa = backend + 'cloudflow-service-oa/src/main/';
  const auth = backend + 'cloudflow-auth/src/main/java/com/cloudflow/auth/';
  for (const [file, original, replacement] of [
    [oa + 'java/com/cloudflow/oa/domain/KnowledgeDocument.java', 'private String externalAttachmentFileIds;', 'private String acceptedAttachmentFileIds;'],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeServiceImpl.java', 'variables.put("documentTitle", document.getTitle())', 'variables.put("title", document.getTitle())'],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeServiceImpl.java', 'variables.put("categoryName", document.getCategory())', 'variables.put("category", document.getCategory())'],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeServiceImpl.java', 'variables.put("publishScope", switch (document.getScopeType())', 'variables.put("scopeName", switch (document.getScopeType())'],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeServiceImpl.java', '.eq(KnowledgeDocument::getVersion, document.getVersion())', '.eq(KnowledgeDocument::getVersion, 0)'],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeServiceImpl.java', '.set(KnowledgeDocument::getDeleted, 1)', '.set(KnowledgeDocument::getDeleted, 0)'],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeServiceImpl.java', '.set(KnowledgeDocument::getExternalAttachmentFileIds, null)', '.set(KnowledgeDocument::getExternalAttachmentFileIds, "[1]")'],
    [backend + 'cloudflow-common/cloudflow-common-audit/src/main/java/com/cloudflow/common/audit/handle/JaversCompareHandle.java', 'handle.handle(audit, changes, oldVal, newVal, sourceClass)', 'handle.handle(audit, changes)'],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeExternalService.java', 'attachments.selected(', 'attachments.candidates('],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeExternalService.java', 'write(document, null, false, null)', 'write(document, null, false, "[1]")'],
    [oa + 'java/com/cloudflow/oa/service/impl/KnowledgeExternalService.java', '@knowledgeExternalService.auditState(#documentId)', '#documentId'],
    [oa + 'resources/mapper/PortalKnowledgeMapper.xml', 'document.external_visible_flag = 1', '1 = 1'],
    [oa + 'resources/mapper/PortalKnowledgeMapper.xml', 'published_version.document_id = document.document_id', '1 = 1'],
    [oa + 'resources/mapper/PortalKnowledgeMapper.xml', 'portal_user.session_version = #{identity.sessionVersion}', '1 = 1'],
    [oa + 'java/com/cloudflow/oa/service/impl/PortalKnowledgeService.java', 'filter(file -> selected.contains(file.getFileId()))', 'filter(file -> true)'],
    [auth + 'portal/PortalKnowledgeFileService.java', 'ticket.publicationVersion(), allowed.publicationVersion()', 'ticket.publicationVersion(), ticket.publicationVersion()'],
    [auth + 'portal/PortalKnowledgeFileService.java', 'ContentDisposition.attachment()', 'ContentDisposition.inline()'],
    [auth + 'portal/PortalFileTickets.java', 'LIFETIME_SECONDS = 60', 'LIFETIME_SECONDS = 3600'],
    [auth + 'portal/PortalFileTickets.java', 'digest(token), ticket.sessionDigest()', 'digest(token), digest(token)'],
    [auth + 'portal/PortalFileTickets.java', 'redis.execute(CONSUME', 'redis.execute(REUSABLE'],
    [auth + 'controller/PortalFileController.java', 'type = "portal"', 'type = "login"'],
    ['cloudflow-frontend/src/components/knowledge/KnowledgeExternalDialog.tsx', 'attachmentFileIds: selectedFiles', 'attachmentFileIds: []'],
    ['cloudflow-frontend/src/router.tsx', "guarded(<DynamicMenuRoute />, ['oa:knowledge:list'])", 'guarded(<DynamicMenuRoute />)'],
  ]) {
    const baseline = repository.load(file);
    assert.ok(baseline.includes(original), `实际源码必须包含被篡改的保护：${file} ${original}`);
    const altered = { ...repository, load(target) { return target === file ? baseline.replace(original, replacement) : repository.load(target); } };
    assert.throws(() => checkKnowledgePublication(altered), /知识库/, `${file} ${original}`);
  }
});

test('门户入口 mutation：电脑和手机权限、独立Cookie和禁止缓存必须保持', () => {
  checkPortalRoutes(repository);
  const routerFile = 'cloudflow-frontend/src/router.tsx';
  const router = repository.load(routerFile);
  for (const [startMarker, endMarker] of [['const desktopRoutes = [', 'const mobileRoutes = ['], ['const mobileRoutes = [', 'export const router']]) {
    const start = router.indexOf(startMarker);
    const end = router.indexOf(endMarker);
    assert.ok(start >= 0 && end > start);
    const section = router.slice(start, end);
    const changed = section.replace("guarded(<DynamicMenuRoute />, ['system:portal:user:list'])", 'guarded(<DynamicMenuRoute />)');
    assert.notEqual(changed, section, '门户权限篡改必须发生在指定设备路由');
    const altered = { ...repository, load(file) { return file === routerFile ? router.slice(0, start) + changed + router.slice(end) : repository.load(file); } };
    assert.throws(() => checkPortalRoutes(altered), /门户/);
  }
  for (const [target, before, after] of [
    ['cloudflow-frontend/src/services/portal.ts', "credentials: 'omit'", "credentials: 'same-origin'"],
    ['cloudflow-frontend/vite.config.ts', /(urlPattern:[^\r\n]*portal[^\r\n]*,\s*handler:\s*)'NetworkOnly'/, "$1'NetworkFirst'"],
  ]) {
    const baseline = repository.load(target);
    const changed = baseline.replace(before, after);
    assert.notEqual(changed, baseline, '门户边界篡改必须实际生效');
    const altered = { ...repository, load(file) { return file === target ? changed : repository.load(file); } };
    assert.throws(() => checkPortalRoutes(altered), /门户/);
  }
});

test('H3授权与段位 mutation：员工获写权限、移动编号及显示按钮必须失败', () => {
  const grants = memory.clone();
  grants.rows('sys_role_menu').find(row => text(row.role_id) === '9' && text(row.menu_id) === '1902').role_id = Decimal.from(5);
  assert.throws(() => checkRoles(grants, beforeH), /精确角色授权/);
  const moved = memory.clone();
  moved.rows('sys_menu').find(row => text(row.menu_id) === '1903').menu_id = Decimal.from(1949);
  assert.throws(() => checkMenus(moved), /菜单编号/);
  const visible = memory.clone();
  visible.rows('sys_menu').find(row => text(row.menu_id) === '1902').visible = Decimal.from(0);
  assert.throws(() => checkMenus(visible), /1902/);
  const teamGrant = memory.clone();
  teamGrant.rows('sys_role_menu').find(row => text(row.role_id) === '8' && text(row.menu_id) === '1906').role_id = Decimal.from(5);
  assert.throws(() => checkRoles(teamGrant, beforeH), /精确角色授权/);
  const teamPage = memory.clone();
  teamPage.rows('sys_menu').find(row => text(row.menu_id) === '1905').component = 'pages/crm/CrmStageAnalysisPage';
  assert.throws(() => checkMenus(teamPage), /1905/);
  const emailGrant = memory.clone();
  emailGrant.rows('sys_role_menu').find(row => text(row.role_id) === '11' && text(row.menu_id) === '1910').role_id = Decimal.from(5);
  assert.throws(() => checkRoles(emailGrant, beforeH), /精确角色授权/);
  const emailMenu = memory.clone();
  emailMenu.rows('sys_menu').find(row => text(row.menu_id) === '1911').visible = Decimal.from(0);
  assert.throws(() => checkMenus(emailMenu), /1911/);
});

test('H3结构 mutation：产品精度、历史唯一来源与赢率约束不可放宽', () => {
  for (const [table, mutate, expected] of [
    ['crm_opportunity_item', schema => { schema.columns.get('quantity').width = canonical(tokens('14,2')); }, /quantity.width/],
    ['crm_opportunity_stage_history', schema => { schema.indexes.clear(); }, /索引/],
    ['crm_opportunity', schema => { schema.checks.clear(); }, /CHECK/],
    ['crm_deal_team', schema => { schema.indexes.clear(); }, /索引/],
    ['crm_deal_event', schema => { schema.checks.clear(); }, /CHECK/],
    ['crm_deal_allocation', schema => { schema.columns.get('allocated_amount').width = canonical(tokens('12,2')); }, /allocated_amount.width/],
    ['crm_email_record', schema => { schema.indexes.clear(); }, /索引/],
    ['crm_email_record', schema => { schema.columns.get('message_record_id').nullable = false; }, /message_record_id.nullable/],
  ]) {
    const schemas = new Map(repository.schemas);
    const original = schemas.get(table);
    const changed = { ...original, columns: new Map([...original.columns].map(([name, column]) => [name, { ...column }])), indexes: new Map(original.indexes), checks: new Map(original.checks) };
    mutate(changed); schemas.set(table, changed);
    assert.throws(() => checkTableCounts({ ...repository, schemas }), expected);
  }
});

test('H3种子 mutation：删除商机保护、改默认比例或漏移动守卫均拒绝', () => {
  checkOpportunityDefaults(repository, memory);
  const file = '07.cloudflow-demo-seed.sql';
  const original = repository.scans.get(file);
  const scans = new Map(repository.scans);
  scans.set(file, { ...original, statements: original.statements.filter(entry => targetTable(entry) !== 'crm_opportunity_demo_seed_guard') });
  assert.throws(() => checkDemoGuard({ ...repository, scans }, memory), /商机业务事实保护/);
  const altered = memory.clone();
  altered.rows('crm_sales_stage').find(row => row.stage_code === 'LEAD').default_win_rate = Decimal.from('0.99');
  assert.throws(() => checkOpportunityDefaults(repository, altered), /六阶段默认值/);
  const routes = { ...repository, load(file) { return repository.load(file).replace("element: guarded(<DynamicMenuRoute />, ['crm:sales-stage:list']),", 'element: <DynamicMenuRoute />,'); } };
  assert.throws(() => checkOpportunityMobileRoutes(routes), /移动商机入口/);
});

test('H4菜单 mutation：保留总数但移出批准段位或改按钮可见性必须失败', () => {
  const moved = memory.clone();
  moved.rows('sys_menu').find(row => text(row.menu_id) === '1958').menu_id = Decimal.from(1970);
  assert.throws(() => checkMenus(moved), /菜单编号/);
  const visible = memory.clone();
  visible.rows('sys_menu').find(row => text(row.menu_id) === '1951').visible = Decimal.from(0);
  assert.throws(() => checkMenus(visible), /1951/);
});

test('H4页面 mutation：动态路由省略权限或后端增加未知会议权限必须失败', () => {
  const unguarded = { ...repository, load(file) {
    const source = repository.load(file);
    return file.endsWith('/DynamicMenuRoute.tsx') ? source.replace('requiredPermissions={parsePermissions(menu.perms)}', 'requiredPermissions={[]}') : source;
  } };
  assert.throws(() => checkPages(unguarded, memory), /动态页面必须/);
  const unapproved = { ...repository, load(file) {
    const source = repository.load(file);
    return file.endsWith('/MeetingController.java') ? source.replace('oa:meeting:board', 'oa:meeting:unapproved') : source;
  } };
  assert.throws(() => checkPages(unapproved, memory), /oa:meeting:unapproved/);
});

test('H4手机路由 mutation：四个入口任一遗漏或丢失权限必须失败', () => {
  checkMeetingMobileRoutes(repository);
  for (const permission of ['mine', 'board', 'usage', 'list']) {
    const altered = { ...repository, load(file) {
      const source = repository.load(file);
      return file.endsWith('/router.tsx') ? source.replace(`guarded(<DynamicMenuRoute />, ['oa:meeting:${permission}'])`, 'guarded(<DynamicMenuRoute />, [])') : source;
    } };
    assert.throws(() => checkMeetingMobileRoutes(altered), /移动会议入口缺少明确权限守卫/);
  }
  const omitted = { ...repository, load(file) {
    const source = repository.load(file);
    return file.endsWith('/router.tsx') ? source.replace("path: '/office/my-meetings'", "path: '/office/omitted-meetings'") : source;
  } };
  assert.throws(() => checkMeetingMobileRoutes(omitted), /移动会议入口缺少明确权限守卫/);
});

test('H4手机路由 mutation：通用守卫忽略传入权限必须失败', () => {
  const altered = { ...repository, load(file) {
    const source = repository.load(file);
    return file.endsWith('/router.tsx') ? source.replace('requiredPermissions={requiredPermissions}', 'requiredPermissions={[]}') : source;
  } };
  assert.throws(() => checkMeetingMobileRoutes(altered), /guarded 必须传递实际权限/);
});

test('H2借款手机路由：本人和财务入口使用各自权限', () => {
  checkAdvanceMobileRoutes(repository);
});

test('H2借款手机路由 mutation：缺少入口或权限必须失败', () => {
  for (const [route, permission] of [['/hr/advances', 'hr:advance:list'], ['/hr/ess/advances', 'hr:advance:own']]) {
    for (const [before, after] of [
      [`path: '${route}'`, `path: '${route}-omitted'`],
      [`guarded(<DynamicMenuRoute />, ['${permission}'])`, 'guarded(<DynamicMenuRoute />, [])'],
    ]) {
      const altered = { ...repository, load(file) {
        const source = repository.load(file);
        if (!file.endsWith('/router.tsx')) return source;
        const changed = source.replace(before, after);
        assert.notEqual(changed, source);
        return changed;
      } };
      assert.throws(() => checkAdvanceMobileRoutes(altered), /移动借款入口缺少明确权限守卫/);
    }
  }
});

test('H5预览手机路由：八个源业务入口保留原菜单权限', () => {
  checkFilePreviewMobileRoutes(repository);
});

test('H5数据源：逐列结构、平台菜单、电脑手机入口及演示保护通过', () => {
  checkDataSourceRoutes(repository);
  checkDataSourceSeeds(repository, memory);
  checkDemoGuard(repository, memory);
});

test('H5数据源 mutation：字段、索引或CHECK变动必须失败', () => {
  for (const [table, field] of [['sys_data_source_config', 'username'], ['sys_data_source_registration', 'applied_version']]) {
    const original = repository.schemas.get(table);
    const columns = new Map(original.columns);
    columns.delete(field);
    const schemas = new Map(repository.schemas);
    schemas.set(table, { ...original, columns });
    assert.throws(() => checkTableCounts({ ...repository, schemas }), /列集合|缺少列/);
    schemas.set(table, { ...original, indexes: new Map() });
    assert.throws(() => checkTableCounts({ ...repository, schemas }), /索引/);
  }
  const table = 'sys_data_source_config';
  const schemas = new Map(repository.schemas);
  schemas.set(table, { ...schemas.get(table), checks: new Map() });
  assert.throws(() => checkTableCounts({ ...repository, schemas }), /CHECK/);
});

test('G4企业通信：六表的字段、唯一键、索引与回调密钥约束逐项拒绝变造', () => {
  for (const table of imTables) {
    const original = repository.schemas.get(table);
    for (const column of original.columns.keys()) {
      const columns = new Map(original.columns);
      columns.delete(column);
      const schemas = new Map(repository.schemas);
      schemas.set(table, { ...original, columns });
      assert.throws(() => checkTableCounts({ ...repository, schemas }), /列集合|缺少列/);
    }
    for (const index of original.indexes.keys()) {
      const indexes = new Map(original.indexes);
      indexes.delete(index);
      const schemas = new Map(repository.schemas);
      schemas.set(table, { ...original, indexes });
      assert.throws(() => checkTableCounts({ ...repository, schemas }), /索引/);
    }
  }
  const schemas = new Map(repository.schemas);
  schemas.set('sys_im_config', { ...schemas.get('sys_im_config'), checks: new Map() });
  assert.throws(() => checkTableCounts({ ...repository, schemas }), /CHECK/);
});

test('G4企业通信：禁止演示生成凭据，六表中任何一表已有事实均阻止重导', () => {
  checkDemoGuard(repository, memory);
  const original = repository.scans.get('07.cloudflow-demo-seed.sql');
  for (const table of imTables) {
    const scans = new Map(repository.scans);
    scans.set('07.cloudflow-demo-seed.sql', { ...original, statements: original.statements.map(entry =>
      targetTable(entry) === 'im_demo_seed_guard' && word(entry[0]) === 'INSERT'
        ? statement('INSERT INTO im_demo_seed_guard SELECT ' + imTables.filter(candidate => candidate !== table)
          .map(candidate => `NOT EXISTS(SELECT 1 FROM ${candidate})`).join(' AND ') + ';') : entry) });
    assert.throws(() => checkDemoGuard({ ...repository, scans }, memory), /企业通信保护未拒绝/);
    scans.set('07.cloudflow-demo-seed.sql', { ...original, statements: [...original.statements, statement(`DELETE FROM ${table};`)] });
    assert.throws(() => checkTableCounts({ ...repository, scans }), /不得生成或删除企业通信/);
  }
});

test('H5数据源 mutation：移号、按钮可见、员工或其他租户管理员授权均失败', () => {
  for (const [field, value] of [['menu_id', Decimal.from(1972)], ['visible', '0']]) {
    const altered = memory.clone();
    altered.rows('sys_menu').find(row => text(row.menu_id) === '1974')[field] = value;
    assert.throws(() => checkMenus(altered), /菜单编号|1974/);
  }
  for (const [field, value] of [['role_id', Decimal.from(5)], ['tenant_id', Decimal.from(100001)]]) {
    const altered = memory.clone();
    altered.rows('sys_role_menu').find(row => text(row.menu_id) === '1974')[field] = value;
    assert.throws(() => checkRoles(altered, beforeH), /精确角色授权/);
  }
});

test('H5数据源 mutation：任一终端缺入口或权限均失败', () => {
  for (const section of ['const desktopRoutes = [', 'const mobileRoutes = [']) {
    for (const [before, after] of [["path: '/system/data-sources'", "path: '/system/data-sources-omitted'"],
      ["guarded(<DataSourcePage />, ['system:data-source:list'])", 'guarded(<DataSourcePage />, [])']]) {
      const altered = { ...repository, load(file) {
        const source = repository.load(file);
        if (!file.endsWith('/router.tsx')) return source;
        const beginning = source.indexOf(section);
        const changed = source.slice(0, beginning) + source.slice(beginning).replace(before, after);
        assert.notEqual(changed, source);
        return changed;
      } };
      assert.throws(() => checkDataSourceRoutes(altered), /数据源入口缺少明确权限守卫/);
    }
  }
});

test('H5数据源 mutation：高风险接口允许离线缓存必须失败', () => {
  const altered = { ...repository, load(file) {
    const source = repository.load(file);
    return file.endsWith('/vite.config.ts') ? source.replace(/(urlPattern:[^\r\n]*platform[^\r\n]*data-source[^\r\n]*,\s*handler:\s*)'NetworkOnly'/, "$1'NetworkFirst'") : source;
  } };
  assert.throws(() => checkDataSourceRoutes(altered), /禁止Service Worker离线缓存/);
});

test('H5数据源 mutation：移除权限门禁或页面权限检查必须失败', () => {
  for (const location of ['backend', 'frontend']) {
    const altered = { ...repository, load(file) {
      const source = repository.load(file);
      if (location === 'backend' && file.startsWith('cloudflow-backend/')) return source.replaceAll('"system:data-source:test"', '"system:data-source:unapproved"');
      if (location === 'frontend' && file.endsWith('/DataSourcePage.tsx')) return source.replace("hasPermission('system:data-source:list')", "hasPermission('system:file:list')");
      return source;
    } };
    assert.throws(() => checkPages(altered, memory), /system:data-source:/);
  }
});

test('H5数据源 mutation：移除保护、忽略实例记录或扩授演示管理员均失败', () => {
  const file = '07.cloudflow-demo-seed.sql';
  const original = repository.scans.get(file);
  const omitted = new Map(repository.scans);
  omitted.set(file, { ...original, statements: original.statements.filter(entry => targetTable(entry) !== 'data_source_demo_seed_guard') });
  assert.throws(() => checkDemoGuard({ ...repository, scans: omitted }, memory), /数据源配置与实例事实保护/);
  const weakened = new Map(repository.scans);
  weakened.set(file, { ...original, statements: original.statements.map(entry => targetTable(entry) === 'data_source_demo_seed_guard' && entry[0].value.toUpperCase() === 'INSERT'
    ? statement('INSERT INTO data_source_demo_seed_guard SELECT NOT EXISTS(SELECT 1 FROM sys_data_source_config);') : entry) });
  assert.throws(() => checkDemoGuard({ ...repository, scans: weakened }, memory), /数据源保护未拒绝/);
  const expanded = new Map(repository.scans);
  const source = repository.load('cloudflow-backend/DB/' + file);
  const changed = source.replace(' AND m.menu_id NOT BETWEEN 1970 AND 1976', '');
  assert.notEqual(changed, source);
  expanded.set(file, { ...original, statements: statements(scanSql(changed, file)) });
  assert.throws(() => checkDataSourceSeeds({ ...repository, scans: expanded }, memory), /不得向演示管理员/);
});

test('H5预览手机路由 mutation：缺少入口、漏权限或预览权限替代业务权限必须失败', () => {
  for (const [route, permission] of [
    ['/system/files', 'system:file:list'],
    ['/office/contracts', 'oa:contract:list'],
    ['/admin/license', 'oa:license:list'],
    ['/office/knowledge', 'oa:knowledge:list'],
    ['/expense/claim', 'oa:expense:list'],
    ['/office/invoice', 'oa:invoice:list'],
    ['/hr/recruitment', 'hr:recruitment:list'],
    ['/admin/supplier', 'oa:supplier:list'],
  ]) {
    for (const [before, after] of [
      [`path: '${route}'`, `path: '${route}-omitted'`],
      [`guarded(<DynamicMenuRoute />, ['${permission}'])`, 'guarded(<DynamicMenuRoute />, [])'],
      [`guarded(<DynamicMenuRoute />, ['${permission}'])`, "guarded(<DynamicMenuRoute />, ['system:file:preview'])"],
    ]) {
      const altered = { ...repository, load(file) {
        const source = repository.load(file);
        if (!file.endsWith('/router.tsx')) return source;
        const beginning = source.indexOf('const mobileRoutes = [');
        assert.ok(beginning >= 0);
        const changed = source.slice(0, beginning) + source.slice(beginning).replace(before, after);
        assert.notEqual(changed, source);
        return changed;
      } };
      assert.throws(() => checkFilePreviewMobileRoutes(altered), /移动预览源业务入口缺少原菜单权限守卫/);
    }
  }
});

test('真实政策 mutation：停用类型被启用、默认审批人被代填必须失败', () => {
  checkPolicies(memory);
  const enabled = memory.clone(); enabled.rows('hr_overtime_type')[0].status = Decimal.from(1);
  assert.throws(() => checkPolicies(enabled), /停用/);
  const approval = memory.clone(); approval.rows('sys_config').find(row => row.config_key === 'sys.hr.overtime.approvalUsers').config_value = '{"responsibleUserId":"1","hrUserId":"4"}';
  assert.throws(() => checkPolicies(approval), /approvalUsers/);
});

test('真实库存 mutation：错误主单、成本链及采购异载荷保护', () => {
  checkLedger(memory);
  const amount = memory.clone(); amount.rows('oa_consumable_ledger')[0].balance_amount_after = Decimal.from('0.01');
  assert.throws(() => checkLedger(amount), /结存链/);
  const purchase = memory.clone();
  const receipt = purchase.rows('biz_purchase_receipt').find(row => text(row.id) === '90031');
  const request = purchase.rows('biz_purchase_request').find(row => text(row.id) === text(receipt.purchase_id));
  request.status = 'APPROVED';
  assert.throws(() => checkLedger(purchase), /全部收货状态/);
  checkReplay(repository, memory);
});

test('真实 07：2500 行展开与真实加班类型引用全部核查', () => {
  assert.equal(demo.rows.get('hr_attendance_checkin').length, 2500);
  checkDemoReferences(demo);
  checkDemoOvertime(demo);
  checkDemoLeave(demo);
  checkDemoBusinessFacts(demo);
  checkDemoInventory(demo);
  checkPolicies(demo.memory, { requireLeaveType: false });
});

function replaceProjection(table, field, replacement) {
  const entry = demo.parsedEntries.find(candidate => candidate.target === table);
  assert.ok(entry, `missing actual demo INSERT for ${table}`);
  const parsed = parseInsert(entry.tokens, repository.schemas.get(table));
  const index = parsed.columns.indexOf(field);
  assert.ok(index >= 0, `missing actual projection column ${table}.${field}`);
  const columns = parsed.query.columns.map((column, offset) => offset === index ? { ...column, expression: expression(tokens(replacement)) } : column);
  const changed = { ...parsed, query: { ...parsed.query, columns } };
  const projectionMemory = demo.memory.clone();
  for (const source of demo.scan.statements) {
    if (!['demo_seed_tenants', 'demo_seed_rows'].includes(targetTable(source))) continue;
    if (source[0].value.toUpperCase() === 'DROP') continue;
    projectionMemory.execute(source);
  }
  const projected = projectionMemory.select(changed.query).map(result => {
    const values = Object.values(result);
    const row = Object.fromEntries(parsed.columns.map((column, offset) => [column, values[offset]]));
    Object.defineProperty(row, '$origin', { value: entry.tokens[0] });
    return row;
  });
  return { ...demo, rows: new Map([...demo.rows, [table, projected]]) };
}

test('恢复旧生成逻辑 mutation：加班类型 ID 悬空必须失败', () => {
  const altered = replaceProjection('hr_attendance_checkin', 'overtime_type_id', '99999999');
  assert.throws(() => checkDemoReferences(altered), /2500 行异常/);
});

test('恢复旧生成逻辑 mutation：非零加班分钟/小时必须失败', () => {
  assert.throws(() => checkDemoOvertime(replaceProjection('hr_attendance_record', 'overtime_minutes', '60')), /2500 行异常/);
  assert.throws(() => checkDemoOvertime(replaceProjection('hr_attendance_monthly', 'overtime_hours', '2.5')), /2500 行异常/);
});

test('恢复旧生成逻辑 mutation：知识正文与附件不得自动对门户公开', () => {
  assert.equal(demo.rows.get('oa_knowledge_document').length, 2500);
  for (const [field, replacement] of [['external_visible_flag', '1'], ['external_version_id', '1'], ['external_attachment_file_ids', "'[1]'"]]) {
    assert.throws(() => checkDemoBusinessFacts(replaceProjection('oa_knowledge_document', field, replacement)), /2500 行异常/, field);
  }
});

test('恢复旧生成逻辑 mutation：无审批来源的 COMPENSATORY 入账必须失败', () => {
  assert.throws(() => checkDemoLeave(replaceProjection('hr_leave_ledger', 'transaction_type', "'COMPENSATORY'")), /2500 行异常/);
  assert.throws(() => checkDemoLeave(replaceProjection('hr_leave_ledger', 'source_biz_type', "'HR_OVERTIME'")), /2500 行异常/);
});

test('实际 SELECT 构造审批草稿、审批实例或非零库存必须失败', () => {
  const privateDraft = { ...demo, protectedWrites: ['<内存>:1 INSERT wf_form_draft 生成 1 行'] };
  assert.throws(() => checkDemoBusinessFacts(privateDraft), /不得写入/);
  assert.throws(() => checkDemoBusinessFacts(replaceProjection('wf_process_instance', 'process_def_key', "'overtime_request'")), /不能预造 H 审批实例/);
  assert.throws(() => checkDemoInventory(replaceProjection('oa_consumable', 'stock_amount', '1.00')), /零库存/);
});

test('未知受检 SQL 函数不能作为空值跳过验证', () => {
  const entry = statement('INSERT INTO hr_attendance_record (id, tenant_id, overtime_minutes) SELECT 1,100000,UNSUPPORTED_PROVIDER(1);');
  assert.equal(targetTable(entry), 'hr_attendance_record');
  assert.throws(() => projectRows(entry, memory), SqlError);
});

test('H5报表 mutation：保持总数时移号、扩授员工数据权限或替换本人写均失败', () => {
  const moved = memory.clone();
  moved.rows('sys_menu').find(row => text(row.menu_id) === '1979').menu_id = Decimal.from(2001);
  assert.throws(() => checkMenus(moved), /菜单编号/);
  const expanded = memory.clone();
  expanded.rows('sys_role_menu').find(row => text(row.role_id) === '5' && text(row.menu_id) === '1997').menu_id = Decimal.from(1998);
  assert.throws(() => checkRoles(expanded, beforeH), /精确角色授权/);
  const reassigned = memory.clone();
  reassigned.rows('sys_role_menu').find(row => text(row.role_id) === '5' && text(row.menu_id) === '1980').menu_id = Decimal.from(1974);
  assert.throws(() => checkRoles(reassigned, beforeH), /精确角色授权/);
});

test('H5报表 mutation：四张表的逐列结构、定义保护不能被削弱', () => {
  for (const table of reportTables) {
    const schemas = new Map(repository.schemas);
    const original = schemas.get(table);
    const columns = new Map(original.columns); columns.delete('tenant_id');
    schemas.set(table, { ...original, columns });
    assert.throws(() => checkTableCounts({ ...repository, schemas }), /tenant_id|列集合/, table);
  }
  const file = '07.cloudflow-demo-seed.sql';
  const original = repository.scans.get(file);
  const omitted = new Map(repository.scans);
  omitted.set(file, { ...original, statements: original.statements.filter(entry => targetTable(entry) !== 'report_demo_seed_guard') });
  assert.throws(() => checkDemoGuard({ ...repository, scans: omitted }, memory), /报表注册和私人定义/);
  const weakened = new Map(repository.scans);
  weakened.set(file, { ...original, statements: original.statements.map(entry => targetTable(entry) === 'report_demo_seed_guard' && entry[0].value.toUpperCase() === 'INSERT'
    ? statement('INSERT INTO report_demo_seed_guard SELECT NOT EXISTS(SELECT 1 FROM sys_report_dataset);') : entry) });
  assert.throws(() => checkDemoGuard({ ...repository, scans: weakened }, memory), /报表保护未拒绝/);
});

test('H5报表 mutation：两个移动入口必须保留自身读取权限', () => {
  checkReportMobileRoutes(repository);
  for (const permission of ['system:report:chart:list', 'system:report:dashboard:list']) {
    const altered = { ...repository, load(file) { const source = repository.load(file); return file.endsWith('/router.tsx') ? source.replaceAll(`['${permission}']`, "['system:report:dataset:list']") : source; } };
    assert.throws(() => checkReportMobileRoutes(altered), /移动报表入口/);
  }
});

test('H5套餐：三表及租户四列不能缺失', () => {
  for (const [table, field] of [...tenantPackageTables.map(table => [table, 'tenant_id']),
    ...['package_id', 'package_version', 'package_override', 'effective_menu_ids'].map(field => ['sys_tenant', field])]) {
    const schemas = new Map(repository.schemas);
    const original = schemas.get(table);
    const columns = new Map(original.columns);
    columns.delete(field);
    schemas.set(table, { ...original, columns });
    assert.throws(() => checkTableCounts({ ...repository, schemas }), /列集合|缺少列|column|package_|effective_menu_ids/, `${table}.${field}`);
  }
});

test('H5套餐：删除或弱化演示生成保护必须失败', () => {
  const file = '07.cloudflow-demo-seed.sql';
  const original = repository.scans.get(file);
  const omitted = new Map(repository.scans);
  omitted.set(file, { ...original, statements: original.statements.filter(entry => targetTable(entry) !== 'tenant_package_demo_seed_guard') });
  assert.throws(() => checkDemoGuard({ ...repository, scans: omitted }, memory), /套餐保护顺序/);
  const weakened = new Map(repository.scans);
  weakened.set(file, { ...original, statements: original.statements.map(entry => targetTable(entry) === 'tenant_package_demo_seed_guard' && entry[0].value.toUpperCase() === 'INSERT'
    ? statement('INSERT INTO tenant_package_demo_seed_guard SELECT NOT EXISTS(SELECT 1 FROM sys_tenant_package);') : entry) });
  assert.throws(() => checkDemoGuard({ ...repository, scans: weakened }, memory), /套餐保护未拒绝/);
});

test('H5套餐：演示租户不能伪造已应用套餐及授权结果', () => {
  for (const [field, replacement] of [['package_id', '100'], ['package_version', '1'], ['package_override', "'{}'"], ['effective_menu_ids', "'[1986]'"]]) {
    assert.throws(() => checkDemoBusinessFacts(replaceProjection('sys_tenant', field, replacement)), /不能伪造/, field);
  }
});
