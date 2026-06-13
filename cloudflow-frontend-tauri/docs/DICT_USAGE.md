# 字典系统使用指南

## 概览

CloudFlow Pro 前端字典系统将枚举数据从硬编码迁移到后端 `sys_dict_type` / `sys_dict_data` 表，通过 `useDict` Hook 和 `DictBadge` / `DictSelect` / `DictLabel` 组件统一调用。

**架构**：
```
sys_dict_data (表) → SysDictHelper (Redis 缓存) → /auth/system/dict/data/type/:dictType (REST)
                                                              ↓
                                                    useDict Hook (React Query)
                                                              ↓
                                            DictBadge / DictSelect / DictLabel
```

## 核心 API

### useDict(dictType, options?)

```tsx
import { useDict } from '@/hooks/useDict';

const dict = useDict('employee_status');

dict.data;          // DictItem[] | undefined
dict.isLoading;     // boolean
dict.getLabel('ACTIVE');                // '在职' | 原值
dict.getItem('ACTIVE');                 // DictItem | undefined
dict.getOptions();                      // [{ label, value }, ...]
```

**配置**：
- `staleTime`：默认 10 分钟，缓存命中期内不重新请求
- `gcTime`：30 分钟，缓存保留时间
- 利用 `tenantAwareQueryKeyHashFn`，租户切换自动隔离

### DictBadge — 彩色状态标签

```tsx
import { DictBadge } from '@/components/common/DictBadge';

<DictBadge dictType="employee_status" value={row.status} />
<DictBadge dictType="employee_status" value={row.status} variant="ring" />
<DictBadge dictType="announcement_status" value={status} fallback="-" />
```

**variant**：`border`（默认） / `ring` / `solid`

### DictSelect — 字典下拉

```tsx
import { DictSelect } from '@/components/common/DictSelect';

<DictSelect
  dictType="employee_status"
  value={status}
  onChange={setStatus}
  placeholder="选择状态"
  showBadge        // 选项显示彩色标签
  filter={(item) => item.value !== 'DELETED'}
/>
```

### DictLabel — 纯文本

```tsx
import { DictLabel } from '@/components/common/DictLabel';

<DictLabel dictType="invoice_status" value="WRITEOFF_FULL" />
{/* 输出：全部核销 */}
```

## listClass → 颜色映射

后端 `dict_data.list_class` 字段控制前端样式，映射规则（在 `src/utils/dictMapper.ts`）：

| listClass | colorName | 视觉 |
|-----------|-----------|------|
| `success` | emerald | 绿 - 通过/正常/已完成 |
| `warning` | amber | 黄 - 待审/部分核销 |
| `danger` | rose | 红 - 驳回/作废/严重 |
| `info` | sky | 蓝 - 处理中/绑定 |
| `primary` | teal | 青 - 一般信息 |
| `default` | slate | 灰 - 草稿/已撤销 |

每个 `colorName` 自动展开为完整 Tailwind 类（含 light + dark mode），支持 `border` / `ring` / `solid` 三种 variant。

## 新增字典迁移步骤

**Step 1 — 后端写入字典数据**

编辑 `cloudflow-backend/DB/06.cloudflow-business-seed.sql`：

```sql
-- 1. 在 reset 区块的 sys_dict_data / sys_dict_type 删除列表加上新 dictType
DELETE FROM cloud_flow_db.sys_dict_data WHERE dict_type IN (..., 'your_new_type');
DELETE FROM cloud_flow_db.sys_dict_type WHERE dict_type IN (..., 'your_new_type');

-- 2. 在字典类型 INSERT 中加一行
INSERT IGNORE INTO cloud_flow_db.sys_dict_type (`dict_name`, `dict_type`, `remark`) VALUES
(..., ('xxx 状态', 'your_new_type', '说明'));

-- 3. 在字典数据 INSERT 中追加该字典的所有数据项
INSERT IGNORE INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`, `remark`) VALUES
(1, '已通过', 'APPROVED',  'your_new_type', 'success', '通过'),
(2, '已驳回', 'REJECTED',  'your_new_type', 'danger',  '驳回');
```

执行 SQL 后，后端 `SysDictTypeServiceImpl.init()` 会在重启时自动写入 Redis 缓存。

**Step 2 — 调用点改造**

```tsx
// ❌ 改造前 — 硬编码
const STATUS_LABEL: Record<string, string> = { APPROVED: '已通过', ... };
<TableCell>{STATUS_LABEL[row.status] || row.status}</TableCell>

// ✅ 改造后 — 使用字典
<TableCell><DictBadge dictType="your_new_type" value={row.status} /></TableCell>
```

**Step 3 — 加入预加载（可选）**

如果该字典在首屏页面被使用，将其加入 `src/App.tsx` 的 `commonDicts` 数组以避免 loading 闪烁。

**Step 4 — DictPage 缓存失效**

`DictPage` 在 add/edit/remove 后已自动调用 `queryClient.invalidateQueries`，无需额外处理。

## 已迁移字典清单

P0/P1 共 13 个字典已迁移到后端：

| 字典类型 | 用途 |
|---------|------|
| employee_status | HR 员工状态 |
| employee_type | HR 员工类型 |
| request_status | 通用申请单状态 |
| contract_status | 合同状态 |
| invoice_status | 发票状态 |
| salary_slip_status | 薪资单状态 |
| crm_lead_status | CRM 线索状态 |
| severity_level | 风险/告警严重度 |
| announcement_status | 公告状态 |
| announcement_type | 公告类型 |
| announcement_priority | 公告优先级 |
| workflow_status | 工作流实例状态 |
| workflow_definition_status | 工作流定义状态 |

## 保留为前端枚举（不迁移）

以下枚举仍在 `src/utils/enumLabels.ts`，原因是技术性强耦合或固定不变：

`ANOMALY_TYPE_LABELS`（工作流异常）、`THRESHOLD_STATUS_LABELS`（阈值算法）、`RECRUIT_CHANNEL_STATUS_LABELS`（启停）、`TRAINING_ENROLLMENT_STATUS_LABELS`（培训）、`EXAM_PAPER_STATUS_LABELS`（试卷）、`TODO_STATUS_LABELS`（待办引擎）、`CRM_GENERIC_STATUS_LABELS`（启停）、`INVOICE_DIRECTION_META`（进项/销项）、`CERTIFICATE_STATUS_META`（证明）。

## 故障排查

**Q：DictBadge 显示原始 value，没翻译？**
- 检查后端是否已写入对应 dictType 数据：`SELECT * FROM sys_dict_data WHERE dict_type = 'xxx'`
- 检查浏览器 Network：`/auth/system/dict/data/type/xxx` 是否返回 200 + 数据
- 检查 React Query DevTools：query key 是否命中 `['dict', 'xxx']`

**Q：管理员改了字典，业务页面没更新？**
- DictPage 的 add/edit/remove 已自动 invalidateQueries
- 如手动通过其他途径改库（直连数据库），需重启后端让 SysDictTypeServiceImpl 重新预热 Redis

**Q：租户切换后字典没刷新？**
- AuthContext.switchTenant 已 `queryClient.clear()`，理论上不会有残留
- 如有残留，检查 `tenantAwareQueryKeyHashFn` 是否生效

## 后续优化方向

1. **WebSocket 推送字典变更**：管理员改字典 → 后端广播 → 所有客户端 invalidate（依赖后端事件）
2. **字典版本号**：响应头携带 etag，客户端检测变化主动刷新
3. **批量加载 API**：`GET /system/dict/data/batch?types=a,b,c` 一次请求多字典，减少首屏请求数
