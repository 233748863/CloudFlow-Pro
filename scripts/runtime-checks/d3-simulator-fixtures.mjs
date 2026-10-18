import assert from 'node:assert/strict';

export async function restoreSimulatorFixtures(runtime, fixture, save) {
  assert.match(fixture.marker, /^D3S-[a-f0-9]{12}$/);
  const errors = [];
  for (const entry of fixture.created.slice().reverse()) {
    if (fixture.restored.includes(entry.id)) continue;
    try {
      assert.ok(['admin', 'foreign'].includes(entry.actor));
      assert.ok(['components', 'structures', 'grades', 'employee-compensations'].includes(entry.resource));
      assert.match(entry.id, /^[1-9][0-9]*$/);
      const rows = await runtime.ok(entry.actor, '/hr/compensation/' + entry.resource);
      const row = rows.find(value => String(value.id) === entry.id); assert.ok(row, 'Owned fixture row missing');
      if (entry.resource === 'employee-compensations') assert.equal(String(row.employeeId), fixture.employeeId);
      else assert.ok(String(row.componentCode || row.structureCode || row.gradeCode).startsWith(fixture.marker));
      if (entry.resource === 'grades') await runtime.ok(entry.actor, '/hr/compensation/grades/' + entry.id, 'DELETE');
      else {
        const table = { components: 'hr_comp_component', structures: 'hr_comp_structure', 'employee-compensations': 'hr_employee_comp' }[entry.resource];
        const tenant = entry.actor === 'foreign' ? '100001' : '100000';
        const version = Number(runtime.database('SELECT version FROM ' + table + ' WHERE id=' + entry.id + ' AND tenant_id=' + tenant));
        assert.ok(Number.isSafeInteger(version) && version >= 0);
        let payload;
        if (entry.resource === 'employee-compensations') payload = Object.fromEntries(['employeeId','structureId','gradeId','componentValues','totalSalary','effectiveDate'].map(key => [key, row[key] ?? null]));
        else if (entry.resource === 'components') payload = JSON.parse(runtime.database("SELECT JSON_OBJECT('componentCode',component_code,'componentName',component_name,'componentType',component_type,'category',category,'taxable',taxable,'sortOrder',sort_order) FROM hr_comp_component WHERE id=" + entry.id + ' AND tenant_id=' + tenant));
        else payload = JSON.parse(runtime.database("SELECT JSON_OBJECT('structureCode',structure_code,'structureName',structure_name,'description',description,'componentConfig',component_config) FROM hr_comp_structure WHERE id=" + entry.id + ' AND tenant_id=' + tenant));
        await runtime.ok(entry.actor, '/hr/compensation/' + entry.resource + '/' + entry.id, 'PUT', {
          ...payload, version, status: entry.resource === 'employee-compensations' ? 'INACTIVE' : 0,
        });
      }
      const after = (await runtime.ok(entry.actor, '/hr/compensation/' + entry.resource)).find(value => String(value.id) === entry.id);
      runtime.check('owned_fixture_restored_' + entry.id, entry.resource === 'grades' ? !after : after?.status === (entry.resource === 'employee-compensations' ? 'INACTIVE' : 0));
      fixture.restored.push(entry.id); save();
    } catch (error) { errors.push(String(error.message).split('\n')[0].slice(0, 180)); }
  }
  fixture.restorationErrors = errors; save();
  assert.equal(errors.length, 0, 'Owned fixture restoration incomplete; see recorded safe checks');
}
