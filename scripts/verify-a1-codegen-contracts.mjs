import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export async function verifyA1CodegenContracts(ctx, supplier) {
  const root = path.resolve('cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa');
  const baseline = Object.fromEntries(await Promise.all([
    ['entity', 'domain/SysSupplier.java'], ['mapper', 'mapper/SysSupplierMapper.java'],
    ['controller', 'controller/SupplierController.java'],
  ].map(async ([kind, relative]) => [kind, { path: path.join(root, relative),
    text: await fs.readFile(path.join(root, relative), 'utf8') }])));
  const files = await ctx.get('/auth/system/codegen/' + supplier.tableId + '/preview');
  const generated = Object.fromEntries(Object.entries(files).filter(([name]) => name.endsWith('.java'))
    .map(([name, text]) => [name.includes('/domain/') ? 'entity' : name.includes('/mapper/') ? 'mapper'
      : name.includes('/controller/') ? 'controller' : name, text]));
  const normal = text => text.replaceAll('java.time.', '').replace(/\s+/g, ' ').trim();
  const fields = text => [...text.matchAll(/((?:\s*@[^\n]+\n)*)\s*private\s+([\w.<>]+)\s+(\w+)\s*;/g)]
    .map(match => ({ name: match[3], type: normal(match[2]), annotations: normal(match[1]) }));
  const originalFields = fields(baseline.entity.text);
  const generatedFields = fields(generated.entity);
  const observations = [];
  const compare = (label, expected, actual) => {
    observations.push({ label, expected, actual });
    ctx.check(label, JSON.stringify(actual) === JSON.stringify(expected));
  };
  for (const field of originalFields) {
    const actual = generatedFields.find(candidate => candidate.name === field.name);
    compare('AC-1 供应商实体字段类型和注解对照 ' + field.name, field, actual);
  }
  compare('AC-1 供应商实体完整字段集合', originalFields.map(field => field.name).sort(),
    generatedFields.map(field => field.name).sort());
  for (const annotation of ['@Data', '@TableName("oa_supplier")']) {
    compare('AC-1 供应商实体类注解 ' + annotation, baseline.entity.text.includes(annotation),
      generated.entity.includes(annotation));
  }
  const methods = text => [...text.matchAll(/public\s+(R<[^\n]+?>)\s+(list|getInfo|add|edit|remove)\s*\(/g)]
    .map(match => {
      let position = match.index + match[0].length;
      const begin = position;
      let depth = 1;
      while (depth && position < text.length) {
        if (text[position] === '(') depth++;
        if (text[position] === ')') depth--;
        position++;
      }
      assert.equal(depth, 0);
      const raw = text.slice(begin, position - 1);
      const parameters = raw.replace(/@\w+(?:\([^)]*\))?\s*/g, '').split(',')
        .map(value => normal(value).replace(/\s+\w+$/, '')).filter(Boolean);
      const prefix = text.slice(text.lastIndexOf('}', match.index) + 1, match.index);
      const annotations = [...prefix.matchAll(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|SaCheckPermission|SysLog|RepeatSubmit)(?:\(([^\n]*)\))?/g)]
        .map(annotation => annotation[1] === 'SysLog' ? '@SysLog' : normal(annotation[0])).sort();
      const parameterAnnotations = [...raw.matchAll(/@(PathVariable|RequestBody|RequestParam)(?:\(([^)]*)\))?/g)]
        .map(annotation => normal(annotation[0]));
      return { name: match[2], returns: normal(match[1]), parameters, annotations, parameterAnnotations };
    });
  compare('AC-1 供应商五个控制器方法签名返回类型与注解逐项对照',
    methods(baseline.controller.text), methods(generated.controller));
  for (const annotation of ['@RestController', '@RequestMapping("/supplier")', '@RequiredArgsConstructor']) {
    compare('AC-1 供应商控制器类注解 ' + annotation, baseline.controller.text.includes(annotation),
      generated.controller.includes(annotation));
  }
  for (const expected of ['@Mapper', 'extends BaseMapper<SysSupplier>']) {
    compare('AC-1 供应商Mapper公共契约 ' + expected, baseline.mapper.text.includes(expected),
      generated.mapper.includes(expected));
  }
  await fs.writeFile(path.join(ctx.directory, 'a1-structure-comparison-' + ctx.caseTag + '.json'),
    JSON.stringify({ actualPreview: true, baseline: Object.values(baseline).map(value => ({ path: value.path,
      hash: createHash('sha256').update(value.text).digest('hex') })), observations,
    handwrittenBusinessExtensions: ['selectForUpdate', 'countReferences', 'supplier lifecycle validation'],
    generatedBusinessLogicClaimed: false }, null, 2), { flag: 'wx' });
  ctx.evidence.structureComparison = true;
}
