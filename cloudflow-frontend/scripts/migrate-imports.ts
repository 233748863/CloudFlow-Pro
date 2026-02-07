/**
 * Import 语句迁移脚本
 * 
 * 功能：
 * 1. 扫描所有源文件
 * 2. 将分散的 UI 组件导入合并为单行
 * 3. 生成迁移报告
 * 
 * 使用方法：
 * npm run migrate-imports          # 执行迁移
 * npm run migrate-imports:dry      # 干运行模式（预览更改）
 */

import fs from 'fs'
import path from 'path'
import { glob } from 'glob'

/**
 * 迁移结果接口
 */
interface MigrationResult {
  file: string              // 文件路径
  before: string[]          // 迁移前的导入语句
  after: string[]           // 迁移后的导入语句
  changed: boolean          // 是否有变化
}

/**
 * 解析结果接口
 */
interface ParseResult {
  uiImports: Set<string>    // UI 组件导入集合
  otherImports: string[]    // 其他导入语句
  restContent: string       // 剩余内容
}

/**
 * 解析文件中的 import 语句
 * 
 * @param content - 文件内容
 * @returns 解析结果
 */
function parseImports(content: string): ParseResult {
  const lines = content.split('\n')
  const uiImports = new Set<string>()
  const otherImports: string[] = []
  let inImportSection = true
  const restLines: string[] = []
  let skipNextLines = 0

  for (let i = 0; i < lines.length; i++) {
    if (skipNextLines > 0) {
      skipNextLines--
      continue
    }

    const line = lines[i]
    const trimmed = line.trim()

    // 检测是否是 UI 组件导入（从 @/components/ui/[component] 导入）
    const uiImportMatch = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"]@\/components\/ui\/(\w+)['"]/)
    
    if (uiImportMatch) {
      // 提取组件名
      const components = uiImportMatch[1].split(',').map(c => c.trim())
      components.forEach(comp => uiImports.add(comp))
      continue
    }

    // 检测多行 UI 组件导入
    if (trimmed.startsWith('import {') || trimmed.startsWith('import{')) {
      // 查找结束的 } from '@/components/ui/...'
      let fullImport = line
      let j = i + 1
      while (j < lines.length && !lines[j].includes('from')) {
        fullImport += '\n' + lines[j]
        j++
      }
      if (j < lines.length) {
        fullImport += '\n' + lines[j]
      }

      const multiLineMatch = fullImport.match(/import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/ui\/(\w+)['"]/s)
      if (multiLineMatch) {
        const components = multiLineMatch[1].split(',').map(c => c.trim()).filter(c => c)
        components.forEach(comp => uiImports.add(comp))
        skipNextLines = j - i
        continue
      }
    }

    // 检测是否已经是从 @/components/ui 统一导入
    const unifiedImportMatch = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"]@\/components\/ui['"]/)
    if (unifiedImportMatch) {
      // 已经是统一导入，保留
      otherImports.push(line)
      continue
    }

    // 其他 import 语句
    if (trimmed.startsWith('import ') && inImportSection) {
      otherImports.push(line)
      continue
    }

    // 非 import 语句，标记 import 区域结束
    if (trimmed && !trimmed.startsWith('import ') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      inImportSection = false
    }

    restLines.push(line)
  }

  return {
    uiImports,
    otherImports,
    restContent: restLines.join('\n')
  }
}

/**
 * 生成优化后的 import 语句
 * 
 * @param uiImports - UI 组件导入集合
 * @param otherImports - 其他导入语句
 * @returns 优化后的导入语句数组
 */
function generateOptimizedImports(
  uiImports: Set<string>,
  otherImports: string[]
): string[] {
  const result: string[] = []

  // 添加其他 import
  result.push(...otherImports)

  // 添加合并后的 UI 组件 import
  if (uiImports.size > 0) {
    const components = Array.from(uiImports).sort()
    
    // 如果组件数量较少，使用单行
    if (components.length <= 5) {
      result.push(`import { ${components.join(', ')} } from '@/components/ui'`)
    } else {
      // 组件较多时，使用多行格式
      result.push('import {')
      components.forEach((comp, index) => {
        const comma = index < components.length - 1 ? ',' : ''
        result.push(`  ${comp}${comma}`)
      })
      result.push(`} from '@/components/ui'`)
    }
  }

  return result
}

/**
 * 迁移单个文件
 * 
 * @param filePath - 文件路径
 * @param dryRun - 是否为干运行模式
 * @returns 迁移结果
 */
function migrateFile(filePath: string, dryRun: boolean = false): MigrationResult {
  const content = fs.readFileSync(filePath, 'utf-8')
  const { uiImports, otherImports, restContent } = parseImports(content)

  const result: MigrationResult = {
    file: filePath,
    before: [],
    after: [],
    changed: false
  }

  // 如果没有 UI 组件导入，跳过
  if (uiImports.size === 0) {
    return result
  }

  // 生成新的 import 语句
  const newImports = generateOptimizedImports(uiImports, otherImports)
  const newContent = [...newImports, '', restContent].join('\n')

  // 检查是否有变化
  if (content !== newContent) {
    result.changed = true
    result.before = Array.from(uiImports)
    result.after = newImports.filter(line => line.includes('@/components/ui'))

    // 如果不是干运行，写入文件
    if (!dryRun) {
      // 创建备份
      const backupPath = `${filePath}.backup`
      fs.writeFileSync(backupPath, content, 'utf-8')
      
      try {
        fs.writeFileSync(filePath, newContent, 'utf-8')
        // 删除备份
        fs.unlinkSync(backupPath)
      } catch (error) {
        // 恢复备份
        fs.writeFileSync(filePath, content, 'utf-8')
        fs.unlinkSync(backupPath)
        throw error
      }
    }
  }

  return result
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('🚀 开始迁移 Import 语句...')
  if (dryRun) {
    console.log('📋 干运行模式：不会修改文件\n')
  } else {
    console.log('⚠️  将修改文件，已创建备份\n')
  }

  // 查找所有 TypeScript/TSX 文件
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**', '**/*.d.ts'],
    cwd: process.cwd()
  })

  console.log(`📁 找到 ${files.length} 个文件\n`)

  const results: MigrationResult[] = []
  let changedCount = 0

  for (const file of files) {
    try {
      const result = migrateFile(file, dryRun)
      if (result.changed) {
        results.push(result)
        changedCount++
        console.log(`✏️  ${file}`)
        console.log(`   之前: ${result.before.length} 个分散的导入`)
        console.log(`   之后: 合并为统一导入`)
      }
    } catch (error) {
      console.error(`❌ 处理文件失败: ${file}`)
      console.error(`   错误: ${error}`)
    }
  }

  console.log(`\n✅ 迁移完成`)
  console.log(`   总文件数: ${files.length}`)
  console.log(`   修改文件数: ${changedCount}`)

  if (dryRun && changedCount > 0) {
    console.log(`\n💡 运行 'npm run migrate-imports' 应用这些更改`)
  }
}

// 执行主函数
main().catch(error => {
  console.error('❌ 迁移失败:', error)
  process.exit(1)
})
