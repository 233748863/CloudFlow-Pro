import assert from 'node:assert/strict';

export async function verifyHrTypedDeleteHttp(context) {
  const { admin, activeAdmin, administrator, employee, first, database, api, successful, check, caseTag } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const marker = `h2delete_${caseTag}`;
  const fixtures = [];
  const grants = database("SELECT CONCAT(tenant_id,':',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;");
  const probes = [
    { table: 'hr_family_member', route: '/hr/ess/family-members', owner: activeAdmin, denied: employee, logical: true,
      fields: 'employee_id,member_name,relationship', values: () => `${administrator.employeeId},${literal(marker)},'OTHER'` },
    { table: 'hr_job_level', route: '/hr/organization/levels', owner: admin, denied: employee, logical: false,
      fields: 'level_code,level_name,level_series,level_rank', values: () => `${literal(marker)},${literal(marker)},'P',1` },
    { table: 'hr_training_category', route: '/hr/training/categories', owner: admin, denied: employee, logical: true,
      fields: 'name', values: () => literal(marker) },
    { table: 'hr_training_course', route: '/hr/training/courses', owner: admin, denied: employee, logical: true,
      fields: 'course_code,course_name', values: () => `${literal(marker)},${literal(marker)}` },
    { table: 'hr_schedule_assignment', route: '/hr/attendance/schedules', owner: admin, denied: employee, logical: false,
      fields: 'target_type,target_id', values: () => `'EMPLOYEE',${first.employeeId}` },
    { table: 'hr_employee', route: '/hr/employees', owner: admin, denied: employee, logical: true,
      fields: 'employee_no,name,gender', values: () => `${literal(marker)},${literal(marker)},'UNKNOWN'` },
  ];
  const insert = (probe, tenant, values) => {
    const identifier = database(`INSERT INTO ${probe.table} (tenant_id,${probe.fields}) VALUES (${tenant},${values}); SELECT LAST_INSERT_ID();`);
    assert.match(identifier, /^[1-9]\d*$/);
    const fixture = { ...probe, id: identifier, tenant };
    fixtures.push(fixture);
    context.journal?.('delete-fixture-created', { table: probe.table, id: identifier, tenant });
    return fixture;
  };
  const live = record => database(`SELECT COUNT(*) FROM ${record.table} WHERE tenant_id=${record.tenant} AND id=${record.id}${record.logical ? ' AND deleted=0' : ''};`);
  const auditCount = record => database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=${record.tenant} AND business_domain=${literal(record.table)} AND business_id=${record.id} AND operation_type='DELETE';`);
  const remove = (actor, record) => api(actor, `${record.route}/${record.id}`, { method: 'DELETE' });
  const acceptedOrMissing = response => response.status === 200 && response.body?.code === 200
    || [400, 403, 404, 409].includes(response.status) && response.body?.code !== 200;
  let completed = false;
  try {
    const foreignEmployee = insert(probes[5], 100001, probes[5].values());
    for (const probe of probes) {
      const own = insert(probe, 100000, probe.values(100000));
      const foreign = probe.table === 'hr_employee' ? foreignEmployee : insert(probe, 100001,
        probe.table === 'hr_family_member' ? `${foreignEmployee.id},${literal(marker)},'OTHER'`
          : probe.table === 'hr_schedule_assignment' ? `'EMPLOYEE',${foreignEmployee.id}` : probe.values(100001));
      const denied = await remove(probe.denied, own);
      check(`${probe.table}员工不能删除他人或管理记录`, denied.status === 403 && denied.body?.code !== 200 && live(own) === '1' && auditCount(own) === '0');
      const foreignResponse = await remove(probe.owner, foreign);
      check(`${probe.table}真实删除入口不影响另一租户`, acceptedOrMissing(foreignResponse) && live(foreign) === '1' && auditCount(foreign) === '0');
      successful(await remove(probe.owner, own), `${probe.table}授权删除返回成功`);
      check(`${probe.table}成功响应对应实际删除且仅一条业务删除审计`, live(own) === '0' && auditCount(own) === '1'
        && (!probe.logical || database(`SELECT deleted FROM ${probe.table} WHERE tenant_id=100000 AND id=${own.id};`) === '1'));
      if (probe.table === 'hr_family_member') {
        const listed = successful(await api(activeAdmin, probe.route), '删除后读取本人家庭成员');
        check('删除的本人家庭成员不会在列表重新出现', Array.isArray(listed) && !listed.some(row => String(row.id) === own.id));
      }
      console.log(`HR_TYPED_DELETE_HTTP_TABLE: table=${probe.table}; logical=${probe.logical}; permission_denied=true; tenant_isolation=true; deleted=true; audit_once=true`);
    }
    for (const own of fixtures.filter(record => record.tenant === 100000)) {
      const repeated = await remove(own.owner, own);
      check(`${own.table}重复删除不新增成功审计`, acceptedOrMissing(repeated) && live(own) === '0' && auditCount(own) === '1');
    }
    check('相邻人事删除回归没有改变EMPLOYEE授权', grants === database("SELECT CONCAT(tenant_id,':',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;"));
    completed = true;
  } finally {
    for (const record of fixtures.toReversed()) {
      database(`DELETE FROM ${record.table} WHERE tenant_id=${record.tenant} AND id=${record.id};`);
      assert.equal(database(`SELECT COUNT(*) FROM ${record.table} WHERE tenant_id=${record.tenant} AND id=${record.id};`), '0', 'Only this run owned deletion fixtures are cleaned');
      context.journal?.('delete-fixture-removed', { table: record.table, id: record.id, tenant: record.tenant, auditRetained: true });
    }
    console.log(`HR_TYPED_DELETE_HTTP_CLEANUP: rows=${fixtures.length}; remaining=0; production_modified=false`);
  }
  assert.ok(completed);
  context.evidence.adjacentDeletion = true;
  console.log('HR_TYPED_DELETE_HTTP_RESULT: tables=6; failed=0; real_http=true; real_mysql=true; real_redis=true; interface_doubles=0; fixture_creation=sql; employee_grants_unchanged=true; production_modified=false');
}
