import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { globSync } from 'glob'

type ImportBucket = {
  valueImports: Set<string>
  typeImports: Set<string>
  declarations: ts.ImportDeclaration[]
}

const rootDir = process.cwd()
const dryRun = process.argv.includes('--dry-run')

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

function isUiImport(specifier: string): boolean {
  return specifier === '@/components/ui'
    || specifier.startsWith('@/components/ui/')
    || /(?:^|\/)\.\.\/(?:.*\/)?components\/ui(?:\/|$)/.test(specifier)
}

function scriptKindForFile(filePath: string): ts.ScriptKind {
  return filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

function formatImportSpecifier(specifier: ts.ImportSpecifier): string {
  const importedName = specifier.propertyName?.text
  const localName = specifier.name.text
  return importedName && importedName !== localName
    ? `${importedName} as ${localName}`
    : localName
}

function collectUiImports(sourceFile: ts.SourceFile): ImportBucket | null {
  const bucket: ImportBucket = {
    valueImports: new Set<string>(),
    typeImports: new Set<string>(),
    declarations: [],
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue
    }

    const specifier = statement.moduleSpecifier.text
    if (!isUiImport(specifier)) {
      continue
    }

    const importClause = statement.importClause
    if (!importClause || !importClause.namedBindings || !ts.isNamedImports(importClause.namedBindings) || importClause.name) {
      return null
    }

    bucket.declarations.push(statement)
    for (const element of importClause.namedBindings.elements) {
      const rendered = formatImportSpecifier(element)
      if (importClause.isTypeOnly || element.isTypeOnly) {
        bucket.typeImports.add(rendered)
      } else {
        bucket.valueImports.add(rendered)
      }
    }
  }

  return bucket.declarations.length > 0 ? bucket : null
}

function uniqueSorted(items: Set<string>): string[] {
  return Array.from(items).sort((a, b) => a.localeCompare(b))
}

function buildMergedImports(bucket: ImportBucket): string {
  const lines: string[] = []
  const valueImports = uniqueSorted(bucket.valueImports)
  const typeImports = uniqueSorted(bucket.typeImports)

  if (valueImports.length > 0) {
    lines.push(`import { ${valueImports.join(', ')} } from '@/components/ui';`)
  }
  if (typeImports.length > 0) {
    lines.push(`import type { ${typeImports.join(', ')} } from '@/components/ui';`)
  }

  return lines.join('\n')
}

function removeRangeWithTrailingNewline(content: string, start: number, end: number): string {
  let nextEnd = end
  if (content.startsWith('\r\n', nextEnd)) {
    nextEnd += 2
  } else if (content[nextEnd] === '\n') {
    nextEnd += 1
  }
  return content.slice(0, start) + content.slice(nextEnd)
}

function migrateFile(filePath: string): { changed: boolean; mergedCount: number; skipped: boolean } {
  const original = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    original,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  )

  const bucket = collectUiImports(sourceFile)
  if (!bucket) {
    return { changed: false, mergedCount: 0, skipped: false }
  }

  const hasDirectUiImport = bucket.declarations.some((declaration) => {
    const specifier = (declaration.moduleSpecifier as ts.StringLiteral).text
    return specifier !== '@/components/ui'
  })
  if (!hasDirectUiImport) {
    return { changed: false, mergedCount: 0, skipped: false }
  }

  const mergedImportBlock = buildMergedImports(bucket)
  if (!mergedImportBlock) {
    return { changed: false, mergedCount: 0, skipped: false }
  }

  let nextContent = original
  const sortedDeclarations = [...bucket.declarations].sort((a, b) => b.getStart() - a.getStart())
  const insertionOffset = Math.min(...bucket.declarations.map((declaration) => declaration.getStart()))

  for (const declaration of sortedDeclarations) {
    nextContent = removeRangeWithTrailingNewline(nextContent, declaration.getStart(), declaration.getEnd())
  }

  nextContent = `${nextContent.slice(0, insertionOffset)}${mergedImportBlock}\n${nextContent.slice(insertionOffset)}`

  if (nextContent === original) {
    return { changed: false, mergedCount: 0, skipped: false }
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, nextContent, 'utf8')
  }

  return {
    changed: true,
    mergedCount: bucket.declarations.length,
    skipped: false,
  }
}

function main(): void {
  const files = globSync('src/**/*.{ts,tsx}', {
    cwd: rootDir,
    absolute: true,
    nodir: true,
    ignore: ['**/*.d.ts'],
  })

  let changedFiles = 0
  let mergedImports = 0
  const changedExamples: string[] = []

  for (const filePath of files) {
    const result = migrateFile(filePath)
    if (!result.changed) {
      continue
    }

    changedFiles += 1
    mergedImports += result.mergedCount
    if (changedExamples.length < 10) {
      changedExamples.push(normalizePath(path.relative(rootDir, filePath)))
    }
  }

  console.log(dryRun ? 'Import 迁移预检查完成' : 'Import 迁移完成')
  console.log(`扫描文件数: ${files.length}`)
  console.log(`变更文件数: ${changedFiles}`)
  console.log(`合并导入声明数: ${mergedImports}`)

  if (changedExamples.length > 0) {
    console.log('示例文件:')
    changedExamples.forEach((file) => console.log(`  - ${file}`))
  }

  if (dryRun) {
    console.log('当前为 dry-run，未写入文件')
  }
}

main()
