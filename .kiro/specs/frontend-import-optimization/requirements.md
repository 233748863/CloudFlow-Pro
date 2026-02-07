# 需求文档：前端 Import 优化

## 简介

CloudFlow Pro 是一个企业级 OA 系统，前端使用 React + TypeScript + Vite 构建。当前项目存在模块导入配置不一致、import 语句冗余、路径别名配置错误等问题，导致开发体验差、类型检查失败、构建错误频发。本规范旨在系统性地解决这些问题，建立统一的模块导入标准和最佳实践。

## 术语表

- **TypeScript_Compiler**: TypeScript 编译器，负责类型检查和代码转译
- **Vite_Bundler**: Vite 构建工具，负责开发服务器和生产构建
- **Path_Alias**: 路径别名，用于简化模块导入路径的配置（如 `@/` 代表 `src/`）
- **Component_Index**: 组件索引文件，用于统一导出多个组件的 index.ts 文件
- **UI_Component**: UI 组件，指 src/components/ui 目录下的可复用界面组件
- **Import_Statement**: 导入语句，JavaScript/TypeScript 中的 import 声明
- **Module_Resolution**: 模块解析，编译器/打包工具查找和加载模块的过程

## 需求

### 需求 1：修复路径别名配置不一致

**用户故事：** 作为开发者，我希望 TypeScript 和 Vite 的路径别名配置保持一致，以便类型检查和运行时行为一致，避免"找不到模块"错误。

#### 验收标准

1. WHEN TypeScript_Compiler 解析路径别名时，THE TypeScript_Compiler SHALL 将 `@/*` 映射到 `./src/*`
2. WHEN Vite_Bundler 解析路径别名时，THE Vite_Bundler SHALL 将 `@/` 映射到项目根目录下的 `src/` 目录
3. WHEN 开发者使用 `@/components/ui/label` 导入模块时，THE TypeScript_Compiler SHALL 成功解析类型声明而不报错
4. WHEN 开发者使用 `@/components/ui/label` 导入模块时，THE Vite_Bundler SHALL 成功解析模块路径并加载文件
5. WHEN 配置文件被修改后，THE System SHALL 要求重启开发服务器以使配置生效

### 需求 2：创建统一的组件导出结构

**用户故事：** 作为开发者，我希望通过单一入口导入多个 UI 组件，以便减少 import 语句数量，提高代码可读性和维护性。

#### 验收标准

1. THE Component_Index SHALL 存在于 `src/components/ui/index.ts` 路径
2. WHEN Component_Index 被创建时，THE Component_Index SHALL 导出所有 UI_Component
3. WHEN 开发者导入多个 UI 组件时，THE System SHALL 允许使用 `import { Button, Label, Input } from '@/components/ui'` 语法
4. WHEN 新的 UI_Component 被添加时，THE Component_Index SHALL 被更新以包含新组件的导出
5. WHEN Component_Index 导出组件时，THE Component_Index SHALL 使用命名导出（named export）而非默认导出

### 需求 3：验证和修复缺失的依赖项

**用户故事：** 作为开发者，我希望所有必需的依赖项都已正确安装，以便组件能够正常工作，避免运行时错误。

#### 验收标准

1. WHEN UI_Component 依赖外部库（如 @radix-ui）时，THE System SHALL 在 package.json 中声明该依赖
2. WHEN 依赖项缺失时，THE System SHALL 在构建或开发时提供清晰的错误信息
3. WHEN 执行依赖检查脚本时，THE System SHALL 列出所有缺失的依赖项
4. WHEN 所有依赖项已安装时，THE System SHALL 成功完成类型检查而无错误
5. WHEN 安装新依赖后，THE System SHALL 更新 package-lock.json 或相应的锁文件

### 需求 4：减少重复的 Import 语句

**用户故事：** 作为开发者，我希望页面文件中的 import 语句简洁明了，以便提高代码可读性，减少维护成本。

#### 验收标准

1. WHEN 页面需要导入多个 UI 组件时，THE System SHALL 允许使用单行 import 语句从 `@/components/ui` 导入
2. WHEN 页面文件的 import 语句超过 15 行时，THE System SHALL 触发代码审查警告
3. WHEN 相同的组件在多个文件中被导入时，THE System SHALL 使用一致的导入路径
4. WHEN 重构 import 语句后，THE System SHALL 保持所有功能正常运行
5. WHEN 使用 ESLint 检查时，THE System SHALL 检测并报告未使用的 import 语句

### 需求 5：建立 Import 最佳实践指南

**用户故事：** 作为团队成员，我希望有明确的 import 使用规范，以便团队保持代码风格一致，新成员快速上手。

#### 验收标准

1. THE System SHALL 提供书面的 import 最佳实践文档
2. WHEN 文档被创建时，THE System SHALL 包含路径别名使用规则、组件导入规范、依赖管理指南
3. WHEN 开发者违反 import 规范时，THE System SHALL 通过 ESLint 规则提供自动提示
4. WHEN 新组件被创建时，THE System SHALL 提供模板或示例代码展示正确的导入方式
5. THE System SHALL 在文档中说明何时使用相对路径、何时使用路径别名

### 需求 6：实现自动化检查和修复

**用户故事：** 作为开发者，我希望有自动化工具检查和修复 import 问题，以便快速发现和解决问题，减少手动工作。

#### 验收标准

1. THE System SHALL 提供脚本来检查路径别名配置的一致性
2. WHEN 执行检查脚本时，THE System SHALL 验证 tsconfig.json 和 vite.config.ts 中的路径别名是否一致
3. WHEN 发现配置不一致时，THE System SHALL 输出详细的差异报告
4. WHEN 执行修复脚本时，THE System SHALL 自动更新不一致的配置文件
5. THE System SHALL 提供脚本来扫描所有源文件，检测缺失的 Component_Index 导出
6. WHEN 发现未导出的组件时，THE System SHALL 自动更新 Component_Index 文件
7. THE System SHALL 集成到 CI/CD 流程中，在代码提交前自动执行检查

### 需求 7：提供迁移和重构工具

**用户故事：** 作为开发者，我希望有工具帮助我将现有代码迁移到新的 import 规范，以便快速完成重构，减少手动修改的错误。

#### 验收标准

1. THE System SHALL 提供脚本来批量更新现有文件中的 import 语句
2. WHEN 执行迁移脚本时，THE System SHALL 将分散的 UI 组件导入合并为单行导入
3. WHEN 迁移脚本运行时，THE System SHALL 保留代码的原有功能和行为
4. WHEN 迁移完成后，THE System SHALL 生成迁移报告，列出所有修改的文件
5. THE System SHALL 在迁移前创建备份，以便出现问题时回滚
6. WHEN 迁移脚本遇到无法自动处理的情况时，THE System SHALL 记录警告并跳过该文件
7. THE System SHALL 提供干运行（dry-run）模式，允许开发者预览将要进行的更改

### 需求 8：确保类型安全和智能提示

**用户故事：** 作为开发者，我希望 IDE 能够正确识别导入的模块并提供类型提示，以便提高开发效率，减少类型错误。

#### 验收标准

1. WHEN 开发者在 IDE 中输入 `import { } from '@/components/ui'` 时，THE IDE SHALL 提供所有可用组件的自动补全列表
2. WHEN 开发者悬停在导入的组件上时，THE IDE SHALL 显示该组件的类型定义和文档
3. WHEN TypeScript_Compiler 执行类型检查时，THE TypeScript_Compiler SHALL 正确解析所有通过路径别名导入的模块
4. WHEN Component_Index 导出组件时，THE Component_Index SHALL 保留原始组件的类型信息
5. WHEN 使用 `tsc --noEmit` 命令时，THE System SHALL 不产生任何类型错误

## 需求优先级

1. **P0 (必须)**: 需求 1 - 修复路径别名配置不一致
2. **P0 (必须)**: 需求 3 - 验证和修复缺失的依赖项
3. **P1 (重要)**: 需求 2 - 创建统一的组件导出结构
4. **P1 (重要)**: 需求 8 - 确保类型安全和智能提示
5. **P2 (建议)**: 需求 4 - 减少重复的 Import 语句
6. **P2 (建议)**: 需求 6 - 实现自动化检查和修复
7. **P3 (可选)**: 需求 5 - 建立 Import 最佳实践指南
8. **P3 (可选)**: 需求 7 - 提供迁移和重构工具
