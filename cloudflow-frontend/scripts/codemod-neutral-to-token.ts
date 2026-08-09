/**
 * 中性色原子类 → 语义 token 类 的批量迁移脚本（步骤 2）
 *
 * 背景：index.css 里 `html.dark :is(shell) :is(.text-slate-600,…)` 这类规则
 * 特异性 0,3,1，会压过 Tailwind 的 dark: 变体（0,1,0），导致组件里针对中性色
 * 写的 dark: 全部失效。本脚本把中性色原子类换成 --cf-fg-* / --cf-surface-*
 * 驱动的语义类，并顺手删掉同一 className 里已经失效的 dark: 中性色变体。
 *
 * 亮色值 = 原 slate 档位，暗色值 = 原覆盖规则取值，因此迁移前后视觉不变。
 *
 * 用法：
 *   npx tsx scripts/codemod-neutral-to-token.ts --dry-run
 *   npx tsx scripts/codemod-neutral-to-token.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'glob';
import path from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const SRC = path.resolve(import.meta.dirname, '../src');

/** text-<family>-<shade> → 语义类 */
const TEXT_MAP: Record<string, string> = {
  '950': 'cf-title',
  '900': 'cf-title',
  '800': 'cf-title',
  '700': 'cf-body',
  '600': 'cf-muted',
  '500': 'cf-subtle',
  '400': 'cf-faint',
};

/** bg-white / bg-<family>-<shade> → 语义类（仅覆盖原 block A 捕获的三档） */
const BG_MAP: Record<string, string> = {
  white: 'cf-surface-1',
  '50': 'cf-surface-2',
  '100': 'cf-surface-3',
};

const NEUTRAL_FAMILIES = 'slate|gray|zinc|neutral|stone';

// 匹配可带任意变体前缀的 text-/bg- 中性色原子类
const TOKEN_RE = new RegExp(
  `(?<![\\w:./-])((?:[a-z0-9-]+:)*)(text|bg)-(?:(${NEUTRAL_FAMILIES})-(\\d{2,3})|(white))\\b`,
  'g',
);

// 匹配 JS/TS 里的字符串字面量（单引号 / 双引号 / 模板串）
const LITERAL_RE = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;

interface Stats {
  textMapped: number;
  bgMapped: number;
  darkTextRemoved: number;
  darkBgRemoved: number;
}

const total: Stats = { textMapped: 0, bgMapped: 0, darkTextRemoved: 0, darkBgRemoved: 0 };
const changedFiles: Array<{ file: string; stats: Stats }> = [];

interface Match {
  start: number;
  end: number;
  prefix: string;
  kind: 'text' | 'bg';
  shade: string;
  isDark: boolean;
  mapsTo: string | null;
}

/** 解析一段字面量里的全部中性色原子类 */
function collect(body: string): Match[] {
  const out: Match[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(body)) !== null) {
    const [full, prefix, kind, , shadeNum, white] = m;
    const shade = white ?? shadeNum;
    const isDark = /(^|:)dark:/.test(prefix);
    const table = kind === 'text' ? TEXT_MAP : BG_MAP;
    out.push({
      start: m.index,
      end: m.index + full.length,
      prefix,
      kind: kind as 'text' | 'bg',
      shade,
      isDark,
      mapsTo: table[shade] ?? null,
    });
  }
  return out;
}

/** 处理单个字面量，返回新内容与统计 */
function transformLiteral(body: string, stats: Stats): string {
  const matches = collect(body);
  if (matches.length === 0) return body;

  // 只有当同一字面量里存在会被映射的「非 dark」基类时，才删除对应的 dark 变体，
  // 避免误删那些没有中性基类、dark: 仍然生效的声明。
  const hasTextBase = matches.some((x) => !x.isDark && x.kind === 'text' && x.mapsTo);
  const hasBgBase = matches.some((x) => !x.isDark && x.kind === 'bg' && x.mapsTo);

  // 从后往前改写，保证前面的 index 不失效
  let result = body;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const x = matches[i];
    if (x.isDark) {
      const removable =
        (x.kind === 'text' && hasTextBase) || (x.kind === 'bg' && hasBgBase);
      if (!removable) continue;
      result = result.slice(0, x.start) + result.slice(x.end);
      if (x.kind === 'text') stats.darkTextRemoved += 1;
      else stats.darkBgRemoved += 1;
      continue;
    }
    if (!x.mapsTo) continue;
    result = result.slice(0, x.start) + x.prefix + x.kind + '-' + x.mapsTo + result.slice(x.end);
    if (x.kind === 'text') stats.textMapped += 1;
    else stats.bgMapped += 1;
  }

  // 删除 token 后可能留下连续空格，仅折叠水平空白，不动首尾与换行
  return result.replace(/[ \t]{2,}/g, ' ');
}

const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true, nodir: true });

// --tidy：只做空白收尾，清理上一轮删除 dark: 变体后残留的首尾空格。
// 仅处理「纯 class 列表」字面量（不含模板插值、不含中文/句子），保证安全。
const TIDY = process.argv.includes('--tidy');
const PURE_CLASS_RE = /^[\sA-Za-z0-9:_\-[\]/().,#%*&>+~='"]+$/;

if (TIDY) {
  let tidied = 0;
  let tidiedFiles = 0;
  for (const file of files) {
    const original = readFileSync(file, 'utf8');
    let hits = 0;
    LITERAL_RE.lastIndex = 0;
    const updated = original.replace(LITERAL_RE, (full, quote: string, body: string) => {
      if (quote === '`' && body.includes('${')) return full;
      if (!body.includes('-') || !PURE_CLASS_RE.test(body)) return full;
      const next = body.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');
      if (next === body || next.length === 0) return full;
      hits += 1;
      return quote + next + quote;
    });
    if (hits === 0) continue;
    tidied += hits;
    tidiedFiles += 1;
    writeFileSync(file, updated, 'utf8');
  }
  console.log(`空白收尾：处理 ${tidiedFiles} 个文件，清理 ${tidied} 处字面量`);
  process.exit(0);
}

// --rescue：以「行」为作用域再跑一遍，兜底字面量扫描器漏掉的文件。
// 字面量扫描依赖引号配对，遇到正则字面量里含引号（例如 /[&<>"']/g）会失步，
// 导致该文件后续内容整段跳过。按行处理不受此影响，且对已迁移文件是幂等的。
const RESCUE = process.argv.includes('--rescue');

if (RESCUE) {
  const rescued: Array<{ file: string; stats: Stats }> = [];
  for (const file of files) {
    const original = readFileSync(file, 'utf8');
    const stats: Stats = { textMapped: 0, bgMapped: 0, darkTextRemoved: 0, darkBgRemoved: 0 };
    const updated = original
      .split('\n')
      .map((line) =>
        line.includes('-slate-') || line.includes('-gray-') || line.includes('bg-white')
          ? transformLiteral(line, stats)
          : line,
      )
      .join('\n');
    const touched =
      stats.textMapped + stats.bgMapped + stats.darkTextRemoved + stats.darkBgRemoved;
    if (touched === 0) continue;
    total.textMapped += stats.textMapped;
    total.bgMapped += stats.bgMapped;
    total.darkTextRemoved += stats.darkTextRemoved;
    total.darkBgRemoved += stats.darkBgRemoved;
    rescued.push({ file: path.relative(SRC, file), stats });
    if (!DRY_RUN) writeFileSync(file, updated, 'utf8');
  }
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}按行兜底：改动 ${rescued.length} 个文件`);
  for (const { file, stats } of rescued) {
    console.log(
      `  ${file}  text:${stats.textMapped} bg:${stats.bgMapped} -dark:text:${stats.darkTextRemoved} -dark:bg:${stats.darkBgRemoved}`,
    );
  }
  process.exit(0);
}

for (const file of files) {
  const original = readFileSync(file, 'utf8');
  const stats: Stats = { textMapped: 0, bgMapped: 0, darkTextRemoved: 0, darkBgRemoved: 0 };

  LITERAL_RE.lastIndex = 0;
  const updated = original.replace(LITERAL_RE, (full, quote: string, body: string) => {
    const next = transformLiteral(body, stats);
    return next === body ? full : quote + next + quote;
  });

  const touched =
    stats.textMapped + stats.bgMapped + stats.darkTextRemoved + stats.darkBgRemoved;
  if (touched === 0) continue;

  total.textMapped += stats.textMapped;
  total.bgMapped += stats.bgMapped;
  total.darkTextRemoved += stats.darkTextRemoved;
  total.darkBgRemoved += stats.darkBgRemoved;
  changedFiles.push({ file: path.relative(SRC, file), stats });

  if (!DRY_RUN) writeFileSync(file, updated, 'utf8');
}

changedFiles.sort(
  (a, b) =>
    b.stats.textMapped + b.stats.bgMapped - (a.stats.textMapped + a.stats.bgMapped),
);

console.log(`${DRY_RUN ? '[dry-run] ' : ''}扫描 ${files.length} 个文件，改动 ${changedFiles.length} 个`);
console.log('前 15 个改动最多的文件：');
for (const { file, stats } of changedFiles.slice(0, 15)) {
  console.log(
    `  ${file}  text:${stats.textMapped} bg:${stats.bgMapped} -dark:text:${stats.darkTextRemoved} -dark:bg:${stats.darkBgRemoved}`,
  );
}
console.log('\n合计：');
console.log(`  text-* → 语义类       ${total.textMapped}`);
console.log(`  bg-*   → 语义类       ${total.bgMapped}`);
console.log(`  删除失效 dark:text-*  ${total.darkTextRemoved}`);
console.log(`  删除失效 dark:bg-*    ${total.darkBgRemoved}`);

