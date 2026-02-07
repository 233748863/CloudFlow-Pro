/**
 * Import 配置检查脚本
 * 
 * 功能：
 * 1. 检查 tsconfig.json 和 vite.config.ts 路径别名一致性
 * 2. 验证所有 UI 组件是否在 index.ts 中导出
 * 3. 检测缺失的依赖项
 * 
 * 使用方法：
 * npm run check-imports
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 获取当前文件的目录路径（ESM 模块）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 检查结果接口
 */
interface CheckResult {
  success: boolean      // 是否通过检查
  errors: string[]      // 错误列表
  warnings: string[]    // 警告列表
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 开始检查 Import 配置...\n')

  const checks = [
    { name: '路径别名一致性', fn: checkPathAliasConsistency },
    { name: '组件索引完整性', fn: checkComponentIndex },
    { name: '依赖项检查', fn: checkDependencies }
  ]

  let hasErrors = false

  for (const check of checks) {
    console.log(`📋 检查: ${check.name}`)
    const result = check.fn()

    if (result.errors.length > 0) {
      hasErrors = true
      console.log('  ❌ 错误:')
      result.errors.forEach(err => console.log(`     - ${err}`))
    }

    if (result.warnings.length > 0) {
      console.log('  ⚠️  警告:')
      result.warnings.forEach(warn => console.log(`     - ${warn}`))
    }

    if (result.success && result.errors.length === 0 && result.warnings.length === 0) {
      console.log('  ✅ 通过')
    }

    console.log()
  }

  if (hasErrors) {
    console.log('❌ 检查失败，请修复上述错误')
    process.exit(1)
  } else {
    console.log('✅ 所有检查通过')
  }
}

/**
 * 检查路径别名配置一致性
 */
function checkPathAliasConsistency(): CheckResult {
  const result: CheckResult = {
    success: true,
    errors: [],
    warnings: []
  }

  try {
    // 读取 tsconfig.json
    const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json')
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'))
    const tsPaths = tsconfig.compilerOptions?.paths || {}

    // 检查 tsconfig 中的 @ 别名
    const tsAliasPattern = tsPaths['@/*']
    if (!tsAliasPattern || tsAliasPattern[0] !== './src/*') {
      result.success = false
      result.errors.push(
        `tsconfig.json: @/* 应该映射到 "./src/*"，当前为 "${tsAliasPattern?.[0] || '未定义'}"`
      )
    }

    // 检查 baseUrl
    const baseUrl = tsconfig.compilerOptions?.baseUrl
    if (baseUrl !== '.') {
      result.warnings.push(
        `tsconfig.json: baseUrl 建议设置为 "."，当前为 "${baseUrl || '未定义'}"`
      )
    }

    // 读取 vite.config.ts（简化版检查）
    const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts')
    const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8')
    
    // 检查 vite.config.ts 中的 @ 别名
    const viteAliasMatch = viteConfigContent.match(/'@':\s*path\.resolve\(__dirname,\s*['"]\.\/src['"]\)/)
    if (!viteAliasMatch) {
      result.success = false
      result.errors.push(
        `vite.config.ts: @ 别名应该指向 './src' 目录`
      )
    }

  } catch (error) {
    result.success = false
    result.errors.push(`配置文件读取失败: ${error}`)
  }

  return result
}

/**
 * 检查组件索引文件完整性
 */
function checkComponentIndex(): CheckResult {
  const result: CheckResult = {
    success: true,
    errors: [],
    warnings: []
  }

  try {
    const uiDir = path.resolve(process.cwd(), 'src/components/ui')
    const indexPath = path.join(uiDir, 'index.ts')

    // 检查 index.ts 是否存在
    if (!fs.existsSync(indexPath)) {
      result.success = false
      result.errors.push(`缺少组件索引文件: ${indexPath}`)
      return result
    }

    // 读取 index.ts 内容
    const indexContent = fs.readFileSync(indexPath, 'utf-8')

    // 获取所有组件文件
    const componentFiles = fs.readdirSync(uiDir)
      .filter(file => file.endsWith('.tsx') && file !== 'index.tsx')
      .map(file => file.replace('.tsx', ''))

    // 检查每个组件是否被导出
    for (const component of componentFiles) {
      const exportPattern = new RegExp(`export.*from\\s+['"]\\.\\/${component}['"]`)
      if (!exportPattern.test(indexContent)) {
        result.warnings.push(
          `组件 "${component}" 未在 index.ts 中导出`
        )
      }
    }

  } catch (error) {
    result.success = false
    result.errors.push(`组件索引检查失败: ${error}`)
  }

  return result
}

/**
 * 检查依赖项
 */
function checkDependencies(): CheckResult {
  const result: CheckResult = {
    success: true,
    errors: [],
    warnings: []
  }

  try {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }

    // 常见的 UI 组件依赖（可选）
    const optionalDeps = [
      '@radix-ui/react-label',
      '@radix-ui/react-slot',
      'class-variance-authority',
      'clsx',
      'tailwind-merge'
    ]

    // 检查可选依赖（仅警告）
    for (const dep of optionalDeps) {
      if (!dependencies[dep]) {
        // 这些依赖是可选的，不报告警告
        // result.warnings.push(`可选依赖未安装: ${dep}`)
      }
    }

    // 检查必需的依赖
    const requiredDeps = ['react', 'react-dom']
    for (const dep of requiredDeps) {
      if (!dependencies[dep]) {
        result.success = false
        result.errors.push(`缺少必需依赖: ${dep}`)
      }
    }

  } catch (error) {
    result.success = false
    result.errors.push(`依赖项检查失败: ${error}`)
  }

  return result
}

// 执行主函数
main()
