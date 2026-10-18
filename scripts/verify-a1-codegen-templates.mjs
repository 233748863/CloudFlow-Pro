import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyA1CodegenTemplates(ctx) {
  const { get, put, post, check, codegenSupplier, codegenMetadata, evidence } = ctx;
  const base = '/auth/system/codegen';
  for (const [tableName, moduleName] of [['oa_supplier_category', 'oa'], ['hr_job_level', 'hr']]) {
    await post(base + '/import', { tableNames: [tableName], moduleName });
  }
  const tables = (await get(base + '/list?pageNum=1&pageSize=100')).rows;
  const categoryTable = tables.find(table => table.tableName === 'oa_supplier_category');
  const hrTable = tables.find(table => table.tableName === 'hr_job_level');
  assert.ok(categoryTable && hrTable);
  const originalSupplier = await get(base + '/' + codegenSupplier.tableId);
  const originalCategory = await get(base + '/' + categoryTable.tableId);
  const originalHr = await get(base + '/' + hrTable.tableId);
  const variants = [];
  const types = ['CRUD', 'TREE', 'SUB', 'INNER', 'HR_TYPED'];
  for (const category of types) {
    const original = category === 'TREE' ? originalCategory : category === 'HR_TYPED' ? originalHr : originalSupplier;
    const actualColumns = codegenMetadata(original.table.tableName);
    const switches = [['tenantFieldFlag', 'tenant_id'], ['logicDeleteFlag', 'deleted'], ['versionFieldFlag', 'version']];
    const availableMask = switches.reduce((mask, entry, index) =>
      actualColumns.some(column => column.name === entry[1]) ? mask | (1 << index) : mask, 0);
    const prefix = category.toLowerCase().replaceAll('_', '');
    for (let mask = 0; mask < 8; mask++) {
      if ((mask & ~availableMask) !== 0) continue;
      const configured = structuredClone(original);
      Object.assign(configured.table, {
        tplCategory: category, moduleName: category === 'HR_TYPED' ? 'hr' : 'oa',
        className: 'A1' + category.replaceAll('_', '') + 'Variant' + mask,
        packageName: 'com.cloudflow.a1acceptance.' + prefix + '.variant' + mask,
        businessName: 'a1_' + prefix + '_' + mask + '_' + ctx.caseTag,
        functionName: 'A1验收' + category + mask,
      });
      for (const [index, [flag]] of switches.entries()) configured.table[flag] = (mask & (1 << index)) === 0 ? 0 : 1;
      if (category === 'TREE') Object.assign(configured.table, { treeParentCode: 'parent_id', treeNameCode: 'category_name' });
      if (category === 'SUB') Object.assign(configured.table, { subTableName: 'oa_supplier_qualification', subTableFk: 'supplier_id' });
      await put(base, configured);
      const current = await get(base + '/' + configured.table.tableId);
      const files = await get(base + '/' + configured.table.tableId + '/preview');
      const javaFiles = Object.keys(files).filter(name => name.endsWith('.java'));
      const entityPath = 'src/main/java/' + current.table.packageName.replaceAll('.', '/')
        + (category === 'HR_TYPED' ? '/domain/entity/' : '/domain/') + current.table.className + '.java';
      const entity = files[entityPath];
      check('AC-2 五类模板按声明输出真实Java文件 ' + category + '/' + mask,
        typeof entity === 'string' && javaFiles.length === (category === 'HR_TYPED' ? 1 : 5));
      for (const [index, [flag, columnName]] of switches.entries()) {
        const field = columnName.replace(/_([a-z])/g, (whole, letter) => letter.toUpperCase());
        check('AC-2/4 模板独立开关保持 ' + category + '/' + mask + '/' + flag,
          current.table[flag] === configured.table[flag]
          && new RegExp('\\b' + field + '\\s*;').test(entity) === ((mask & (1 << index)) !== 0));
      }
      check('AC-2 仅主子模板生成自定义查询XML ' + category + '/' + mask,
        Object.keys(files).some(name => name.endsWith('Mapper.xml')) === (category === 'SUB'));
      if (category === 'HR_TYPED') {
        const snippet = files['snippets/' + current.table.className + 'ResourceController.java.txt'];
        check('AC-2 HR模板明确保留实体和接入现有控制器的片段', typeof snippet === 'string'
          && Object.keys(files).length === 2 && snippet.includes('HrTypedCrudService')
          && (snippet.match(/@SaCheckPermission\("hr:/g) || []).length === 5);
      } else {
        const controller = files['src/main/java/' + current.table.packageName.replaceAll('.', '/')
          + '/controller/' + current.table.className + 'Controller.java'];
        assert.equal(typeof controller, 'string');
        if (category === 'INNER') {
          check('AC-6 内部模板保留内部路径和身份注解 ' + mask,
            controller.includes('@RequestMapping("/inner/oa/' + current.table.businessName + '")')
            && controller.includes('@Inner') && !controller.includes('@SaCheckPermission(')
            && !Object.keys(files).some(name => name.endsWith('-menu.sql')));
        } else {
          check('AC-3 外部模板全部映射方法具有合法权限 ' + category + '/' + mask,
            (controller.match(/@(Get|Post|Put|Delete)Mapping/g) || []).length
              === (controller.match(/@SaCheckPermission\("oa:/g) || []).length);
        }
      }
      const receipt = await ctx.retainGenerated('variant-' + prefix + '-' + mask, current, files);
      variants.push({ category, mask, availableMask, actualColumns: actualColumns.map(column => column.name), receipt });
    }
  }
  await put(base, originalSupplier);
  await put(base, originalCategory);
  await put(base, originalHr);
  check('AC-2 五种模板各自覆盖实际字段支持的全部独立开关组合', types.every(category => {
    const selected = variants.filter(variant => variant.category === category);
    const supported = selected[0].availableMask.toString(2).replaceAll('0', '').length;
    return selected.length === 2 ** supported;
  }));
  await fs.writeFile(path.join(ctx.directory, 'a1-template-variants-' + ctx.caseTag + '.json'),
    JSON.stringify({ actualPreview: true, variants, compilationExecuted: false }, null, 2), { flag: 'wx' });
  ctx.codegenVariants = variants;
  evidence.templateVariants = true;
  evidence.internalTemplate = true;
}
