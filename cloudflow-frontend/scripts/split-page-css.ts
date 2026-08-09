/**
 * index.css 按页面拆分（步骤 3）
 *
 * index.css 有 1.8 万行、构建出近 490KB 单文件阻塞首屏。页面级样式按 class 前缀成族，
 * 且每个页面本身已经是 import.meta.glob 出来的懒加载 chunk，
 * 所以把某一族样式搬进「页面同目录的 CSS + 页面组件 import」后，
 * Vite 会自动把它切成随该页面按需加载的 CSS chunk。
 *
 * 先跑 --analyze 看归属分布，再跑 --apply 真正搬运。
 *
 * 用法：
 *   npx tsx scripts/split-page-css.ts --analyze
 *   npx tsx scripts/split-page-css.ts --apply [--min-lines=40]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'glob';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../src');
const INDEX_CSS = path.join(SRC, 'index.css');

const ANALYZE = process.argv.includes('--analyze');
const APPLY = process.argv.includes('--apply');
const MIN_LINES = Number(
  (process.argv.find((a) => a.startsWith('--min-lines=')) ?? '--min-lines=40').split('=')[1],
);

type Node =
  | { kind: 'rule'; prelude: string; body: string; raw: string; start: number; end: number }
  | { kind: 'at'; prelude: string; children: Node[]; raw: string; start: number; end: number }
  | { kind: 'other'; raw: string; start: number; end: number };

/** 括号配对解析；base 是本段文本在原文里的偏移量，用于记录绝对位置以便精确删除 */
function parse(css: string, base = 0): Node[] {
  const nodes: Node[] = [];
  let i = 0;
  const n = css.length;

  while (i < n) {
    while (i < n && /\s/.test(css[i])) i += 1;
    if (i >= n) break;
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      nodes.push({ kind: 'other', raw: css.slice(i, stop), start: base + i, end: base + stop });
      i = stop;
      continue;
    }

    const start = i;
    let braceStart = -1;
    while (i < n) {
      const ch = css[i];
      if (ch === '{') {
        braceStart = i;
        break;
      }
      if (ch === ';') break;
      i += 1;
    }

    if (i >= n) {
      nodes.push({ kind: 'other', raw: css.slice(start), start: base + start, end: base + n });
      break;
    }

    if (css[i] === ';') {
      nodes.push({
        kind: 'other',
        raw: css.slice(start, i + 1),
        start: base + start,
        end: base + i + 1,
      });
      i += 1;
      continue;
    }

    let depth = 0;
    let j = braceStart;
    for (; j < n; j += 1) {
      if (css.startsWith('/*', j)) {
        const end = css.indexOf('*/', j + 2);
        j = end === -1 ? n : end + 1;
        continue;
      }
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    const prelude = css.slice(start, braceStart).trim();
    const body = css.slice(braceStart + 1, j);
    const raw = css.slice(start, j + 1);
    const absStart = base + start;
    const absEnd = base + j + 1;

    if (prelude.startsWith('@')) {
      const at = prelude.split(/\s|\(/)[0];
      const leaf = at === '@keyframes' || at === '@font-face' || at === '@property';
      nodes.push(
        leaf
          ? { kind: 'other', raw, start: absStart, end: absEnd }
          : {
              kind: 'at',
              prelude,
              children: parse(body, base + braceStart + 1),
              raw,
              start: absStart,
              end: absEnd,
            },
      );
    } else {
      nodes.push({ kind: 'rule', prelude, body, raw, start: absStart, end: absEnd });
    }
    i = j + 1;
  }

  return nodes;
}

/** 从选择器里提取 class 名 */
function classesOf(prelude: string): string[] {
  return Array.from(prelude.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)).map((m) => m[1]);
}

/**
 * 取「族名」= class 前两段（admin-workflow-xxx → admin-workflow）。
 * 只有一段的（cf-app / table）归为自身。
 */
function familyOf(cls: string): string {
  const parts = cls.split('-');
  if (parts.length <= 1) return cls;
  return `${parts[0]}-${parts[1]}`;
}

/** 全局层：这些前缀是跨页面共享的骨架/通用组件，一律留在 index.css */
const GLOBAL_FAMILY_PREFIXES = [
  'cf-',
  'unity-',
  'mobile-',
  'table-',
  'pagination-',
  'select-',
  'modal-',
  'dialog-',
  'layout-',
  'form-',
  'admin-dialog',
  'admin-inner',
  'admin-source',
  'admin-toolbar',
  'admin-horizontal',
  'admin-users-toolbar',
  'hide-scrollbar',
  'animate-',
  'pb-safe',
  'pt-safe',
  'pl-safe',
  'pr-safe',
  'driver-',
];

function isGlobalFamily(family: string): boolean {
  return GLOBAL_FAMILY_PREFIXES.some((p) => family.startsWith(p));
}

interface Located {
  node: Extract<Node, { kind: 'rule' }>;
  /** 从外到内的 at-rule prelude 链，重建时按序包回去 */
  chain: string[];
  families: string[];
}

/** 收集所有规则及其包裹链 */
function collectRules(nodes: Node[], chain: string[], out: Located[]) {
  for (const node of nodes) {
    if (node.kind === 'rule') {
      const families = Array.from(new Set(classesOf(node.prelude).map(familyOf)));
      out.push({ node, chain, families });
    } else if (node.kind === 'at') {
      collectRules(node.children, [...chain, node.prelude], out);
    }
  }
}

const css = readFileSync(INDEX_CSS, 'utf8');
const tree = parse(css);
const rules: Located[] = [];
collectRules(tree, [], rules);

/** 每个族在哪些 tsx 里出现过 —— 用来判断归属页面 */
const tsxFiles = globSync('**/*.tsx', { cwd: SRC, absolute: true, nodir: true });
const fileContents = new Map<string, string>();
for (const f of tsxFiles) fileContents.set(f, readFileSync(f, 'utf8'));

function ownersOf(family: string): string[] {
  const owners: string[] = [];
  for (const [file, content] of fileContents) {
    if (content.includes(family)) owners.push(file);
  }
  return owners;
}

/** 族 → 归属它的规则 */
const byFamily = new Map<string, Located[]>();
/** 跨族规则（一条选择器牵扯多个族）不搬，避免拆错 */
const mixed: Located[] = [];
const globalRules: Located[] = [];

for (const rule of rules) {
  const candidate = rule.families.filter((f) => !isGlobalFamily(f));
  if (rule.families.length === 0 || candidate.length === 0) {
    globalRules.push(rule);
    continue;
  }
  const unique = Array.from(new Set(candidate));
  if (unique.length > 1) {
    mixed.push(rule);
    continue;
  }
  const family = unique[0];
  // 选择器里同时含全局族时也不搬（例如 .cf-filter-bar .admin-crm-x）
  if (rule.families.some(isGlobalFamily)) {
    mixed.push(rule);
    continue;
  }
  const list = byFamily.get(family) ?? [];
  list.push(rule);
  byFamily.set(family, list);
}

function lineCount(list: Located[]): number {
  return list.reduce((sum, r) => sum + r.node.raw.split('\n').length, 0);
}

interface Plan {
  family: string;
  rules: Located[];
  lines: number;
  owner: string | null;
  ownerCount: number;
}

const plans: Plan[] = [];
for (const [family, list] of byFamily) {
  const owners = ownersOf(family);
  plans.push({
    family,
    rules: list,
    lines: lineCount(list),
    owner: owners.length === 1 ? owners[0] : null,
    ownerCount: owners.length,
  });
}
plans.sort((a, b) => b.lines - a.lines);

if (ANALYZE) {
  console.log(`index.css 共 ${css.split('\n').length} 行，解析出 ${rules.length} 条规则`);
  console.log(`  全局/无 class 规则   ${globalRules.length} 条（${lineCount(globalRules)} 行）`);
  console.log(`  跨族规则（不搬）     ${mixed.length} 条（${lineCount(mixed)} 行）`);
  console.log(`  可归族规则           ${rules.length - globalRules.length - mixed.length} 条`);
  console.log(`  族数量               ${plans.length}`);

  const single = plans.filter((p) => p.owner && p.lines >= MIN_LINES);
  const multi = plans.filter((p) => !p.owner && p.lines >= MIN_LINES);
  console.log(
    `\n可安全外迁（唯一归属页面 且 ≥${MIN_LINES} 行）：${single.length} 族 / ${single.reduce((s, p) => s + p.lines, 0)} 行`,
  );
  for (const p of single.slice(0, 40)) {
    console.log(`  ${String(p.lines).padStart(5)} 行  ${p.family.padEnd(26)} → ${path.relative(SRC, p.owner!)}`);
  }
  console.log(
    `\n归属不唯一（≥${MIN_LINES} 行，暂留 index.css）：${multi.length} 族 / ${multi.reduce((s, p) => s + p.lines, 0)} 行`,
  );
  for (const p of multi.slice(0, 20)) {
    console.log(`  ${String(p.lines).padStart(5)} 行  ${p.family.padEnd(26)} 出现在 ${p.ownerCount} 个 tsx`);
  }
  process.exit(0);
}

if (!APPLY) {
  console.log('请指定 --analyze 或 --apply');
  process.exit(1);
}

/**
 * 决定某个族搬到哪个文件：
 * - 唯一归属 → 页面同目录、以页面名命名的 css
 * - 多归属但都在同一目录 → 该目录下 <family>.css，由这些页面各自 import
 * - 多归属且跨目录（≤8 个）→ src/styles/features/<family>.css，各自 import
 * - 归属过多（说明是共享骨架，例如 admin-users 出现在 134 个文件）→ 留在 index.css
 */
function resolveTarget(plan: Plan): { cssPath: string; importers: string[] } | null {
  const owners = ownersOf(plan.family);
  if (owners.length === 0 || owners.length > 8) return null;

  if (owners.length === 1) {
    const owner = owners[0];
    return {
      cssPath: owner.replace(/\.tsx$/, '.css'),
      importers: [owner],
    };
  }

  const dirs = new Set(owners.map((f) => path.dirname(f)));
  if (dirs.size === 1) {
    return {
      cssPath: path.join(path.dirname(owners[0]), `${plan.family}.css`),
      importers: owners,
    };
  }

  return {
    cssPath: path.join(SRC, 'styles', 'features', `${plan.family}.css`),
    importers: owners,
  };
}

/** 把一组规则按包裹链重建成 CSS 文本 */
function renderRules(list: Located[]): string {
  const groups = new Map<string, Located[]>();
  for (const rule of list) {
    const key = JSON.stringify(rule.chain);
    const arr = groups.get(key) ?? [];
    arr.push(rule);
    groups.set(key, arr);
  }

  const chunks: string[] = [];
  for (const [key, arr] of groups) {
    const chain: string[] = JSON.parse(key);
    const inner = arr.map((r) => r.node.raw).join('\n\n');
    let text = inner;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const indented = text
        .split('\n')
        .map((line) => (line.trim() ? `  ${line}` : line))
        .join('\n');
      text = `${chain[i]} {\n${indented}\n}`;
    }
    chunks.push(text);
  }
  return chunks.join('\n\n');
}

const targets: Array<{ plan: Plan; cssPath: string; importers: string[] }> = [];
for (const plan of plans) {
  if (plan.lines < MIN_LINES) continue;
  const resolved = resolveTarget(plan);
  if (!resolved) continue;
  targets.push({ plan, ...resolved });
}

// 同一个 CSS 目标可能承载多个族，先按目标合并
const byTarget = new Map<string, { rules: Located[]; importers: Set<string>; families: string[] }>();
for (const t of targets) {
  const entry = byTarget.get(t.cssPath) ?? { rules: [], importers: new Set(), families: [] };
  entry.rules.push(...t.plan.rules);
  for (const im of t.importers) entry.importers.add(im);
  entry.families.push(t.plan.family);
  byTarget.set(t.cssPath, entry);
}

// 写出各页面 CSS
const removals: Array<{ start: number; end: number }> = [];
let movedRules = 0;
let movedLines = 0;

for (const [cssPath, entry] of byTarget) {
  const header =
    `/* 从 index.css 拆分而来：${entry.families.join(', ')}\n` +
    `   由 ${Array.from(entry.importers).map((f) => path.basename(f)).join(', ')} import，\n` +
    `   随对应页面的懒加载 chunk 按需加载，不再阻塞首屏。 */\n\n`;
  writeFileSync(cssPath, header + renderRules(entry.rules) + '\n', 'utf8');

  for (const rule of entry.rules) {
    removals.push({ start: rule.node.start, end: rule.node.end });
    movedRules += 1;
    movedLines += rule.node.raw.split('\n').length;
  }

  // 给每个 importer 加 import（插在最后一条 import 之后）
  for (const importer of entry.importers) {
    // 目标 CSS 可能不在 importer 同目录（跨目录族放在 styles/features 下），
    // 所以必须按 importer 的位置算相对路径，不能只取 basename
    let relative = path
      .relative(path.dirname(importer), cssPath)
      .split(path.sep)
      .join('/');
    if (!relative.startsWith('.')) relative = `./${relative}`;

    let content = fileContents.get(importer)!;
    if (content.includes(relative)) continue;
    const lines = content.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/from\s+['"][^'"]+['"];\s*$/.test(line) || /^import\s+['"][^'"]+['"];\s*$/.test(line)) {
        lastImport = i;
      }
    }
    const insertAt = lastImport + 1;
    lines.splice(insertAt, 0, `import '${relative}';`);
    content = lines.join('\n');
    fileContents.set(importer, content);
    writeFileSync(importer, content, 'utf8');
  }
}

// 从 index.css 里删掉已搬走的规则（从后往前，避免偏移失效）
removals.sort((a, b) => b.start - a.start);
let reduced = css;
for (const r of removals) {
  reduced = reduced.slice(0, r.start) + reduced.slice(r.end);
}
// 清理搬空后剩下的空 @layer / @media 壳与多余空行
reduced = reduced.replace(/@(?:layer|media|supports)[^{}]*\{\s*\}\s*/g, '');
reduced = reduced.replace(/\n{3,}/g, '\n\n');
writeFileSync(INDEX_CSS, reduced, 'utf8');

console.log(`搬出 ${byTarget.size} 个 CSS 文件、${movedRules} 条规则、约 ${movedLines} 行`);
console.log(`index.css: ${css.split('\n').length} 行 → ${reduced.split('\n').length} 行`);
console.log('\n生成的文件：');
for (const [cssPath, entry] of byTarget) {
  console.log(
    `  ${path.relative(SRC, cssPath).padEnd(56)} ${entry.families.join(', ')}`,
  );
}



