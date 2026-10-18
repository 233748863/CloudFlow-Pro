import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyA1CodegenContracts } from './verify-a1-codegen-contracts.mjs';

export async function verifyA1CodegenFoundation(ctx) {
  const { admin, api, successful, check, database, get, post, put, reject, rows, sql, evidence } = ctx;
  const base = '/auth/system/codegen';
  const messageTables = ['sys_message_channel', 'sys_message_template', 'sys_message_record',
    'sys_message_subscribe', 'sys_sms_code'];
  const tableNames = ['oa_supplier', ...messageTables];
  const auditNames = ['deleted', 'version', 'create_by', 'create_time', 'update_by', 'update_time'];
  const metadata = tableName => rows(`SELECT JSON_OBJECT('name',column_name,'type',column_type,
    'dataType',data_type,'comment',column_comment,'key',column_key,'extra',extra,'nullable',is_nullable)
    FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=${sql(tableName)}
    ORDER BY ordinal_position;`);
  const metadataSnapshot = () => createHash('sha256').update(database(`SELECT * FROM sys_codegen_table
    WHERE tenant_id=100000 ORDER BY table_id; SELECT column_metadata.* FROM sys_codegen_column column_metadata
    INNER JOIN sys_codegen_table table_metadata ON table_metadata.table_id=column_metadata.table_id
    WHERE table_metadata.tenant_id=100000 ORDER BY column_metadata.column_id;`)).digest('hex');
  const options = await get(base + '/options');
  check('AC-1/2 当前真实生成器提供五种已实现模板',
    [...options.templateCategories].sort().join(',') === 'CRUD,HR_TYPED,INNER,SUB,TREE');
  check('AC-3 生成器模块只提供五种合法权限前缀',
    [...options.modules].sort().join(',') === 'crm,hr,oa,system,workflow');
  const found = await get(base + '/db/list?' + new URLSearchParams({
    tableName: 'oa_supplier', pageNum: '1', pageSize: '100',
  }));
  check('AC-1 当前真实数据库供应商表可以按名称查到',
    found.rows.some(table => table.tableName === 'oa_supplier'));
  const before = metadataSnapshot();
  reject(await api(admin, base + '/import', { method: 'POST', body: {
    moduleName: 'oa', tableNames: ['oa_supplier', 'oa_a1_missing_' + ctx.caseTag],
  } }), 'AC-1 包含不存在表的真实批量导入被拒绝');
  check('AC-1 批量导入失败时全部元数据保持', metadataSnapshot() === before);
  await post(base + '/import', { moduleName: 'oa', tableNames: ['oa_supplier'] });
  await post(base + '/import', { moduleName: 'system', tableNames: messageTables });
  const imported = await get(base + '/list?pageNum=1&pageSize=100');
  const actual = imported.rows.filter(table => tableNames.includes(table.tableName));
  check('AC-1/10 供应商和消息中心五张真实表分别唯一导入', actual.length === 6
    && new Set(actual.map(table => table.tableName)).size === 6);
  const remaining = await get(base + '/db/list?tableName=oa_supplier&pageNum=1&pageSize=100');
  check('AC-1 已导入供应商从待导入列表排除',
    !remaining.rows.some(table => table.tableName === 'oa_supplier'));
  const duplicateBefore = metadataSnapshot();
  reject(await api(admin, base + '/import', { method: 'POST', body: {
    moduleName: 'oa', tableNames: ['oa_supplier'],
  } }), 'AC-1 重复导入现有表被拒绝');
  check('AC-1 重复导入后元数据保持', metadataSnapshot() === duplicateBefore);
  const configured = [];
  for (const tableName of tableNames) {
    const selected = actual.find(table => table.tableName === tableName);
    const detail = await get(base + '/' + selected.tableId);
    const source = metadata(tableName);
    check('AC-1/10 ' + tableName + '的真实字段完整导入', detail.columns.length === source.length);
    for (const column of detail.columns) {
      const original = source.find(value => value.name === column.columnName);
      check('AC-1 ' + tableName + '.' + column.columnName + '类型注释主键与实际数据库一致',
        !!original && original.type === column.columnType && original.comment === column.columnComment
        && column.pkFlag === (original.key === 'PRI' ? 1 : 0)
        && column.incrementFlag === (original.extra.includes('auto_increment') ? 1 : 0));
      if (auditNames.includes(column.columnName) || column.columnName === 'tenant_id') {
        check('AC-4 ' + tableName + '.' + column.columnName + '保持审计和租户字段的生成配置',
          column.insertFlag === 0 && column.editFlag === 0 && column.listFlag === 0 && column.queryFlag === 0);
      }
    }
    const saved = structuredClone(detail);
    saved.table.packageName = 'com.cloudflow.a1acceptance.' + saved.table.moduleName;
    saved.table.functionName = 'A1_' + ctx.caseTag + '_' + tableName;
    if (tableName === 'oa_supplier') saved.table.className = 'SysSupplier';
    await put(base, saved);
    const reloaded = await get(base + '/' + selected.tableId);
    check('AC-1 配置实际保存重载 ' + tableName,
      reloaded.table.packageName === saved.table.packageName
      && reloaded.table.className === saved.table.className
      && reloaded.table.functionName === saved.table.functionName);
    const files = await get(base + '/' + selected.tableId + '/preview');
    const repeated = await get(base + '/' + selected.tableId + '/preview');
    check('AC-2 同一配置重复预览产物一致 ' + tableName,
      JSON.stringify(files) === JSON.stringify(repeated));
    const entityPath = 'src/main/java/' + reloaded.table.packageName.replaceAll('.', '/')
      + '/domain/' + reloaded.table.className + '.java';
    const entity = files[entityPath];
    assert.equal(typeof entity, 'string');
    check('AC-1/4 实体绑定实际表及主键 ' + tableName,
      entity.includes('@TableName("' + tableName + '")') && entity.includes('@TableId'));
    for (const auditName of auditNames) {
      const javaField = auditName.replace(/_([a-z])/g, (whole, letter) => letter.toUpperCase());
      const exists = source.some(column => column.name === auditName);
      check('AC-4 实体仅生成实际存在的审计字段 ' + tableName + '.' + auditName,
        new RegExp('\\b' + javaField + '\\s*;').test(entity) === exists);
    }
    if (tableName === 'sys_sms_code') {
      check('AC-4 验证码表仅保留现有创建时间审计字段',
        source.filter(column => auditNames.includes(column.name)).map(column => column.name).join(',') === 'create_time'
        && entity.includes('FieldFill.INSERT') && entity.includes('createTime;'));
    }
    const receipt = await ctx.retainGenerated('actual-' + tableName, reloaded, files);
    configured.push({ tableName, tableId: selected.tableId, detail: reloaded, metadata: source, receipt });
  }
  const supplier = configured.find(value => value.tableName === 'oa_supplier');
  await verifyA1CodegenContracts(ctx, supplier);
  const supplierDraft = structuredClone(await get(base + '/' + supplier.tableId));
  const nameColumn = supplierDraft.columns.find(column => column.columnName === 'supplier_name');
  assert.ok(nameColumn);
  nameColumn.javaField = 'configuredSupplierName';
  nameColumn.queryFlag = 1;
  nameColumn.queryType = 'LIKE';
  await put(base, supplierDraft);
  await post(base + '/' + supplier.tableId + '/sync');
  const synced = await get(base + '/' + supplier.tableId);
  const syncedName = synced.columns.find(column => column.columnName === 'supplier_name');
  check('AC-1 同步真实结构保留字段改名与查询配置',
    syncedName.javaField === 'configuredSupplierName' && syncedName.queryFlag === 1 && syncedName.queryType === 'LIKE');
  const renamedFiles = await get(base + '/' + supplier.tableId + '/preview');
  const renamedEntity = Object.entries(renamedFiles).find(([name]) => name.endsWith('/SysSupplier.java'))?.[1];
  check('AC-1 改名字段显式绑定原数据库列',
    renamedEntity?.includes('@TableField("supplier_name")') && renamedEntity.includes('String configuredSupplierName;'));
  await ctx.retainGenerated('supplier-renamed', synced, renamedFiles);
  await put(base, { ...synced, columns: synced.columns.map(column => column.columnName === 'supplier_name'
    ? { ...column, javaField: 'supplierName', queryFlag: nameColumn.queryFlag, queryType: nameColumn.queryType } : column) });
  Object.assign(ctx, { codegenTables: configured, codegenOptions: options, codegenSupplier: supplier,
    codegenMetadata: metadata, codegenMetadataSnapshot: metadataSnapshot });
  evidence.imports = true;
  evidence.metadata = true;
  evidence.configuration = true;
  evidence.actualAuditFields = true;
  evidence.messageTables = true;
}
