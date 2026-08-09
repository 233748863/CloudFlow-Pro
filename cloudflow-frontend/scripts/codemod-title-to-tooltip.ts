/**
 * 原生 title 提示 → data-tooltip 迁移脚本（步骤 4）
 *
 * 原生 title 的问题：触屏不显示、无法样式化、约 1s 延迟、屏幕阅读器支持不一致。
 * 迁移到 data-tooltip 后由 <TooltipLayer /> 统一接管（见 components/common/Tooltip.tsx）。
 *
 * 只处理原生小写标签（button/div/span/td/p），不动 React 组件的 title prop。
 * 对缺少无障碍名称的 <button> 补 aria-label——原本 title 承担了这个角色，
 * 直接删掉会让纯图标按钮失去可访问名称。
 *
 * 用法：
 *   npx tsx scripts/codemod-title-to-tooltip.ts --dry-run
 *   npx tsx scripts/codemod-title-to-tooltip.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'glob';
import path from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const SRC = path.resolve(import.meta.dirname, '../src');

const TAGS = ['button', 'div', 'span', 'td', 'p'] as const;
const TAG_RE = new RegExp(`<(${TAGS.join('|')})(?=[\\s/>])`, 'g');

/**
 * 从 `<tag` 的起始位置向前扫到该开标签的 `>`。
 * 需要跟踪引号与 {} 深度，否则 title={cond ? 'a>b' : 'c'} 这类写法会被截断。
 */
function findTagEnd(src: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return i;
  }
  return -1;
}

/** 在开标签文本里定位 title 属性，返回属性整体与其值 */
function readTitleAttr(tag: string):
  | { whole: string; kind: 'literal'; value: string }
  | { whole: string; kind: 'expr'; value: string }
  | null {
  const literal = /\stitle=("([^"]*)"|'([^']*)')/.exec(tag);
  if (literal) {
    return { whole: literal[0], kind: 'literal', value: literal[2] ?? literal[3] ?? '' };
  }
  const exprStart = /\stitle=\{/.exec(tag);
  if (!exprStart) return null;
  // 手动配对花括号，兼容 title={a ? '{' : '}'} 这种极端写法
  let depth = 0;
  let quote: string | null = null;
  const from = exprStart.index + exprStart[0].length - 1;
  for (let i = from; i < tag.length; i += 1) {
    const ch = tag[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          whole: tag.slice(exprStart.index, i + 1),
          kind: 'expr',
          value: tag.slice(from + 1, i),
        };
      }
    }
  }
  return null;
}

interface Stats {
  literal: number;
  expr: number;
  ariaAdded: number;
  skipped: number;
}

const total: Stats = { literal: 0, expr: 0, ariaAdded: 0, skipped: 0 };
const changed: Array<{ file: string; stats: Stats }> = [];
const skippedDetail: string[] = [];

const files = globSync('**/*.tsx', { cwd: SRC, absolute: true, nodir: true });

for (const file of files) {
  const original = readFileSync(file, 'utf8');
  const stats: Stats = { literal: 0, expr: 0, ariaAdded: 0, skipped: 0 };

  // 收集所有需要改写的开标签区间，之后从后往前替换
  const edits: Array<{ start: number; end: number; text: string }> = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(original)) !== null) {
    const tagName = m[1];
    const end = findTagEnd(original, m.index);
    if (end === -1) continue;
    const tag = original.slice(m.index, end + 1);

    const attr = readTitleAttr(tag);
    if (!attr) continue;

    // 组件把自身 title 透传下去时不能改，否则破坏该组件对外的 prop 约定
    if (attr.kind === 'expr' && /\bprops\.title\b|\btitle\b\s*\}/.test(attr.value)) {
      stats.skipped += 1;
      skippedDetail.push(`${path.relative(SRC, file)}: ${attr.whole.trim().slice(0, 70)}`);
      continue;
    }

    let replacement =
      attr.kind === 'literal'
        ? ` data-tooltip="${attr.value}"`
        : ` data-tooltip={${attr.value}}`;

    // 纯图标按钮原来靠 title 提供可访问名称，删掉 title 前必须补 aria-label。
    // 只对 button 生效：给非交互元素加 aria-label 通常被忽略甚至有害。
    // 注意不要要求属性前必须有空白——代码里存在 title="X"aria-label="X" 这种紧贴写法。
    const hasAriaName = /aria-label\s*=|aria-labelledby\s*=/.test(tag);
    if (tagName === 'button' && !hasAriaName) {
      replacement +=
        attr.kind === 'literal' ? ` aria-label="${attr.value}"` : ` aria-label={${attr.value}}`;
      stats.ariaAdded += 1;
    }

    const newTag = tag.replace(attr.whole, replacement);
    edits.push({ start: m.index, end: end + 1, text: newTag });
    if (attr.kind === 'literal') stats.literal += 1;
    else stats.expr += 1;
  }

  if (edits.length === 0) {
    total.skipped += stats.skipped;
    continue;
  }

  let updated = original;
  for (let i = edits.length - 1; i >= 0; i -= 1) {
    const e = edits[i];
    updated = updated.slice(0, e.start) + e.text + updated.slice(e.end);
  }

  total.literal += stats.literal;
  total.expr += stats.expr;
  total.ariaAdded += stats.ariaAdded;
  total.skipped += stats.skipped;
  changed.push({ file: path.relative(SRC, file), stats });

  if (!DRY_RUN) writeFileSync(file, updated, 'utf8');
}

console.log(`${DRY_RUN ? '[dry-run] ' : ''}扫描 ${files.length} 个 tsx，改动 ${changed.length} 个`);
console.log('\n合计：');
console.log(`  title="…"  → data-tooltip   ${total.literal}`);
console.log(`  title={…}  → data-tooltip   ${total.expr}`);
console.log(`  为 button 补 aria-label      ${total.ariaAdded}`);
console.log(`  跳过（title 透传）           ${total.skipped}`);
if (skippedDetail.length > 0) {
  console.log('\n跳过明细：');
  for (const line of skippedDetail) console.log(`  ${line}`);
}

