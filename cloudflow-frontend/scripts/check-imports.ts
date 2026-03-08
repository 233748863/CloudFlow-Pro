import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'
import ts from 'typescript'
import { globSync } from 'glob'

type CheckResult = {
  title: string
  ok: boolean
  details: string[]
}

const rootDir = process.cwd()
const builtins = new Set(
  builtinModules.flatMap((name) => [name, name.replace(/^node:/, '')]),
)

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

function normalizeAliasTarget(value: string): string {
  return normalizePath(value)
    .replace(/\/\*$/, '')
    .replace(/\*$/, '')
    .replace(/\/$/, '')
    .trim()
}

function parseTsConfigAlias(): string | null {
  const tsconfig = JSON.parse(readText('tsconfig.json'))
  const raw = tsconfig?.compilerOptions?.paths?.['@/*']?.[0]
  return typeof raw === 'string' ? normalizeAliasTarget(raw) : null
}

function parseViteAlias(): string | null {
  const viteConfig = readText('vite.config.ts')
  const match = viteConfig.match(/['"]@['"]\s*:\s*path\.resolve\(__dirname,\s*['"]([^'"]+)['"]\)/)
  return match ? normalizeAliasTarget(match[1]) : null
}

function checkAliasConsistency(): CheckResult {
  const tsAlias = parseTsConfigAlias()
  const viteAlias = parseViteAlias()

  if (!tsAlias || !viteAlias) {
    return {
      title: '路径别名一致性',
      ok: false,
      details: [
        !tsAlias ? 'tsconfig.json 缺少 @/* 路径映射' : '',
        !viteAlias ? 'vite.config.ts 缺少 @ 别名配置' : '',
      ].filter(Boolean),
    }
  }

  const expectedTsAlias = './src'
  if (tsAlias !== expectedTsAlias || viteAlias !== expectedTsAlias) {
    return {
      title: '路径别名一致性',
      ok: false,
      details: [
        `tsconfig.json 当前配置: ${tsAlias}`,
        `vite.config.ts 当前配置: ${viteAlias}`,
        `期望统一为: ${expectedTsAlias}`,
      ],
    }
  }

  return {
    title: '路径别名一致性',
    ok: true,
    details: [`tsconfig.json 与 vite.config.ts 均指向 ${expectedTsAlias}`],
  }
}

function listUiModules(): string[] {
  const uiDir = path.join(rootDir, 'src/components/ui')
  return fs
    .readdirSync(uiDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(ts|tsx)$/.test(name) && name !== 'index.ts')
    .map((name) => name.replace(/\.(ts|tsx)$/, ''))
    .sort()
}

function checkUiIndexIntegrity(): CheckResult {
  const indexContent = readText('src/components/ui/index.ts')
  const exportedSources = new Set<string>()
  const exportPattern = /from\s+['"](\.\/[^'"]+)['"]/g
  let match: RegExpExecArray | null = null
  while ((match = exportPattern.exec(indexContent)) !== null) {
    exportedSources.add(match[1])
  }

  const missingModules = listUiModules().filter((moduleName) => !exportedSources.has(`./${moduleName}`))
  if (missingModules.length > 0) {
    return {
      title: 'UI 组件索引完整性',
      ok: false,
      details: missingModules.map((moduleName) => `index.ts 未导出: ${moduleName}`),
    }
  }

  return {
    title: 'UI 组件索引完整性',
    ok: true,
    details: [`共检查 ${listUiModules().length} 个 UI 组件文件，均已接入 index.ts`],
  }
}

function resolvePackageName(specifier: string): string | null {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@/')) {
    return null
  }
  if (specifier.startsWith('virtual:') || specifier.startsWith('data:')) {
    return null
  }
  if (specifier.startsWith('node:')) {
    return null
  }

  const normalized = specifier.split('?')[0]
  const packageName = normalized.startsWith('@')
    ? normalized.split('/').slice(0, 2).join('/')
    : normalized.split('/')[0]

  return builtins.has(packageName) ? null : packageName
}

function scriptKindForFile(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (filePath.endsWith('.cts')) return ts.ScriptKind.TS
  if (filePath.endsWith('.mts')) return ts.ScriptKind.TS
  if (filePath.endsWith('.cjs')) return ts.ScriptKind.JS
  if (filePath.endsWith('.mjs')) return ts.ScriptKind.JS
  if (filePath.endsWith('.js')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function collectImportSpecifiers(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  )

  const specifiers = new Set<string>()

  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.add(node.moduleSpecifier.text)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.add(node.moduleSpecifier.text)
    }
  })

  return Array.from(specifiers)
}

function checkDependencies(): CheckResult {
  const packageJson = JSON.parse(readText('package.json'))
  const installedPackages = new Set<string>([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ])

  const files = globSync(
    ['src/**/*.{ts,tsx}', 'scripts/**/*.{ts,tsx,js,cjs,mjs,cts,mts}', 'vite.config.ts'],
    {
      cwd: rootDir,
      absolute: true,
      nodir: true,
      ignore: ['**/*.d.ts'],
    },
  )

  const missingPackages = new Map<string, Set<string>>()
  for (const filePath of files) {
    const relativePath = normalizePath(path.relative(rootDir, filePath))
    for (const specifier of collectImportSpecifiers(filePath)) {
      const packageName = resolvePackageName(specifier)
      if (!packageName || installedPackages.has(packageName)) {
        continue
      }
      const refs = missingPackages.get(packageName) ?? new Set<string>()
      refs.add(relativePath)
      missingPackages.set(packageName, refs)
    }
  }

  if (missingPackages.size > 0) {
    const details = Array.from(missingPackages.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([packageName, filesUsingPackage]) => {
        const examples = Array.from(filesUsingPackage).slice(0, 3).join(', ')
        return `缺少依赖 ${packageName}，引用位置: ${examples}`
      })
    return {
      title: '依赖项检查',
      ok: false,
      details,
    }
  }

  return {
    title: '依赖项检查',
    ok: true,
    details: [`共扫描 ${files.length} 个文件，未发现缺失依赖`],
  }
}

function printResult(result: CheckResult): void {
  console.log(`检查项: ${result.title}`)
  if (result.ok) {
    console.log('  结果: 通过')
  } else {
    console.log('  结果: 失败')
  }
  for (const detail of result.details) {
    console.log(`  - ${detail}`)
  }
  console.log('')
}

function main(): void {
  console.log('开始检查 Import 配置...\n')

  const results = [
    checkAliasConsistency(),
    checkUiIndexIntegrity(),
    checkDependencies(),
  ]

  results.forEach(printResult)

  const failed = results.filter((result) => !result.ok)
  if (failed.length > 0) {
    console.error(`检查未通过，共 ${failed.length} 项失败`)
    process.exitCode = 1
    return
  }

  console.log('所有检查通过')
}

main()
