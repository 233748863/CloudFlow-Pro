# Import 最佳实践指南

本文档描述了 CloudFlow Pro 前端项目中模块导入的最佳实践和规范。

## 目录

1. [路径别名使用规则](#路径别名使用规则)
2. [组件导入规范](#组件导入规范)
3. [依赖管理指南](#依赖管理指南)
4. [常见问题和解决方案](#常见问题和解决方案)

---

## 路径别名使用规则

### 何时使用 `@/` 路径别名

✅ **推荐使用场景：**

```typescript
// 从 src 目录导入模块
import { Button } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getVehicleList } from '@/services/api/vehicle'
import type { User } from '@/types'
```

**优点：**
- 路径清晰，不受文件移动影响
- 避免复杂的相对路径（如 `../../../components`）
- IDE 自动补全支持更好

### 何时使用相对路径

✅ **推荐使用场景：**

```typescript
// 同一目录下的文件
import { helper } from './utils'
import type { Props } from './types'

// 父目录或子目录的文件（距离较近）
import { Component } from '../Component'
import { SubComponent } from './components/SubComponent'
```

**优点：**
- 表明文件之间的相对关系
- 适合紧密耦合的模块

### ❌ 错误示例

```typescript
// 不要混用路径别名和相对路径导入同一模块
import { Button } from '@/components/ui/button'  // ❌
import { Label } from '../../../components/ui/label'  // ❌

// 应该统一使用
import { Button, Label } from '@/components/ui'  // ✅
```

---

## 组件导入规范

### UI 组件统一导入

✅ **推荐方式：**

```typescript
// 从统一入口导入多个组件
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label
} from '@/components/ui'
```

**优点：**
- 减少 import 语句数量
- 代码更简洁易读
- 便于维护和重构

### ❌ 避免的方式

```typescript
// 不要分散导入
import { Button } from '@/components/ui/button'  // ❌
import { Label } from '@/components/ui/label'    // ❌
import { Input } from '@/components/ui/input'    // ❌
```

### 导入行数限制

⚠️ **警告：** 如果一个文件的 import 语句超过 15 行，考虑：

1. 使用统一导出（如 `@/components/ui`）
2. 检查是否导入了不必要的模块
3. 考虑拆分文件

### 导入顺序规范

推荐的导入顺序：

```typescript
// 1. React 和第三方库
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'

// 2. UI 组件
import {
  Button,
  Card,
  Input
} from '@/components/ui'

// 3. 自定义组件
import { CustomComponent } from '@/components/CustomComponent'

// 4. Hooks 和 Context
import { useAuth } from '@/context/AuthContext'

// 5. 服务和 API
import { getVehicleList } from '@/services/api/vehicle'

// 6. 类型定义
import type { Vehicle } from '@/types'

// 7. 工具函数
import { formatDate } from '@/utils/date'

// 8. 样式和资源
import './styles.css'
```

---

## 依赖管理指南

### 添加新依赖

1. **安装依赖：**

```bash
# 生产依赖
npm install package-name

# 开发依赖
npm install --save-dev package-name
```

2. **验证安装：**

```bash
npm run check-imports
npm run type-check
```

### 常用依赖

项目已包含以下依赖：

- **UI 框架：** React 19.2.0
- **路由：** react-router-dom
- **HTTP 客户端：** axios
- **日期处理：** date-fns
- **图标：** lucide-react
- **构建工具：** Vite
- **样式：** Tailwind CSS

### 检查缺失依赖

```bash
npm run check-imports
```

该命令会检查：
- 路径别名配置一致性
- 组件索引完整性
- 依赖项完整性

---

## 常见问题和解决方案

### 问题 1：找不到模块 `@/components/ui`

**错误信息：**
```
Cannot find module '@/components/ui' or its corresponding type declarations.
```

**解决方案：**

1. 检查 `tsconfig.json` 配置：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

2. 检查 `vite.config.ts` 配置：

```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

3. 重启开发服务器：

```bash
npm run dev
```

### 问题 2：类型检查失败

**错误信息：**
```
Property 'xxx' does not exist on type 'yyy'.
```

**解决方案：**

1. 运行类型检查：

```bash
npm run type-check
```

2. 检查组件导出是否正确：

```bash
npm run check-imports
```

3. 确保 `src/components/ui/index.ts` 包含所有组件导出

### 问题 3：导入语句过多

**症状：** 文件顶部有大量 import 语句

**解决方案：**

1. 使用迁移脚本（干运行模式预览）：

```bash
npm run migrate-imports:dry
```

2. 执行迁移：

```bash
npm run migrate-imports
```

3. 验证迁移结果：

```bash
npm run type-check
```

### 问题 4：IDE 自动补全不工作

**解决方案：**

1. 重启 TypeScript 服务器（VS Code）：
   - 按 `Ctrl+Shift+P`
   - 输入 "TypeScript: Restart TS Server"

2. 检查 IDE 是否正确识别 `tsconfig.json`

3. 确保项目根目录有 `tsconfig.json` 文件

---

## 代码示例

### ✅ 正确示例

```typescript
// src/pages/VehicleBooking.tsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getVehicleList, submitBooking } from '@/services/api/vehicle'
import type { Vehicle } from '@/types'

const VehicleBooking: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  // 组件逻辑...
}

export default VehicleBooking
```

### ❌ 错误示例

```typescript
// src/pages/VehicleBooking.tsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
// ❌ 分散导入
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CardContent } from '@/components/ui/card'
import { CardHeader } from '@/components/ui/card'
import { CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { SelectContent } from '@/components/ui/select'
import { SelectItem } from '@/components/ui/select'
import { SelectTrigger } from '@/components/ui/select'
import { SelectValue } from '@/components/ui/select'
// ❌ 混用相对路径
import { useAuth } from '../../../context/AuthContext'
import { getVehicleList, submitBooking } from '../../../services/api/vehicle'
import type { Vehicle } from '../../../types'

const VehicleBooking: React.FC = () => {
  // 组件逻辑...
}

export default VehicleBooking
```

---

## 自动化工具

### 检查配置

```bash
npm run check-imports
```

检查内容：
- 路径别名配置一致性
- 组件索引完整性
- 依赖项完整性

### 迁移导入语句

```bash
# 预览更改（不修改文件）
npm run migrate-imports:dry

# 执行迁移
npm run migrate-imports
```

### 类型检查

```bash
npm run type-check
```

---

## 总结

遵循这些最佳实践可以：

✅ 提高代码可读性和可维护性  
✅ 减少导入语句数量  
✅ 统一团队代码风格  
✅ 提升开发效率  
✅ 减少类型错误和构建问题

如有疑问，请参考本文档或运行 `npm run check-imports` 进行自动检查。
