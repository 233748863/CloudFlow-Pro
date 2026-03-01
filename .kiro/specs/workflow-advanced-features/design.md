# 设计文档：工作流高级功能

## 概述

本设计文档描述了 CloudFlow Pro 工作流系统高级功能的技术实现方案，包括流程模板库扩展、流程版本管理、流程导入导出以及批量删除/归档流程四个核心模块。

设计目标：
- 提供可复用的流程模板机制，提高流程创建效率
- 实现完整的版本控制系统，支持流程变更追踪和回滚
- 支持流程的跨环境迁移和备份恢复
- 提供灵活的流程生命周期管理能力

技术栈：
- 前端：React 18 + TypeScript 5 + Vite 4
- 后端：Spring Boot 3.x + MyBatis-Plus 3.x
- 数据库：MySQL 8.0
- 缓存：Redis（用于版本对比缓存）

## 架构设计

### 整体架构

系统采用前后端分离的架构，高级功能模块作为现有工作流系统的扩展，遵循以下设计原则：

1. **模块化设计**：每个功能模块独立封装，降低耦合度
2. **可扩展性**：预留扩展点，支持未来功能增强
3. **数据一致性**：使用事务保证批量操作的原子性
4. **性能优化**：版本对比使用缓存，大文件导入使用流式处理

### 模块划分

```
workflow-advanced-features/
├── template-library/          # 模板库模块
│   ├── TemplateManagement     # 模板管理
│   ├── TemplatePreview        # 模板预览
│   └── TemplateUsage          # 模板使用
├── version-control/           # 版本控制模块
│   ├── VersionHistory         # 版本历史
│   ├── VersionComparison      # 版本对比
│   └── VersionRollback        # 版本回滚
├── import-export/             # 导入导出模块
│   ├── WorkflowExporter       # 流程导出
│   ├── WorkflowImporter       # 流程导入
│   └── ConflictResolver       # 冲突解决
└── batch-operations/          # 批量操作模块
    ├── BatchArchive           # 批量归档
    ├── ArchiveManagement      # 归档管理
    └── PermanentDelete        # 永久删除
```


## 组件和接口

### 1. 模板库模块

#### 1.1 数据模型

**WorkflowTemplate 实体**
```typescript
interface WorkflowTemplate {
  id: string;                    // 模板唯一标识
  name: string;                  // 模板名称
  description: string;           // 模板描述
  categoryId: string;            // 分类 ID
  tags: string[];                // 标签列表
  definition: WorkflowDefinition; // 流程定义（JSON）
  previewImage?: string;         // 预览图 URL
  createdBy: string;             // 创建者 ID
  createdAt: Date;               // 创建时间
  updatedAt: Date;               // 更新时间
  usageCount: number;            // 使用次数
  isSystem: boolean;             // 是否系统预置模板
  status: 'active' | 'inactive'; // 模板状态
}

interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  parentId?: string;             // 支持分类层级
  order: number;                 // 排序
}
```

#### 1.2 后端接口

**TemplateController**
```java
@RestController
@RequestMapping("/api/workflow/templates")
public class TemplateController {
    
    // 查询模板列表（支持分页、筛选）
    @GetMapping
    ResponseEntity<Page<TemplateDTO>> listTemplates(
        @RequestParam(required = false) String categoryId,
        @RequestParam(required = false) List<String> tags,
        @RequestParam(required = false) String keyword,
        Pageable pageable
    );
    
    // 获取模板详情
    @GetMapping("/{id}")
    ResponseEntity<TemplateDTO> getTemplate(@PathVariable String id);
    
    // 创建模板（管理员）
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<TemplateDTO> createTemplate(@RequestBody CreateTemplateRequest request);
    
    // 更新模板（管理员）
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<TemplateDTO> updateTemplate(
        @PathVariable String id,
        @RequestBody UpdateTemplateRequest request
    );
    
    // 删除模板（管理员）
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<Void> deleteTemplate(@PathVariable String id);
    
    // 从模板创建流程
    @PostMapping("/{id}/create-workflow")
    ResponseEntity<WorkflowDTO> createWorkflowFromTemplate(
        @PathVariable String id,
        @RequestBody CreateFromTemplateRequest request
    );
    
    // 获取模板分类树
    @GetMapping("/categories")
    ResponseEntity<List<CategoryTreeNode>> getCategories();
}
```

#### 1.3 前端组件

**TemplateLibrary 组件**
- 模板列表展示（卡片视图/列表视图切换）
- 分类筛选侧边栏
- 标签筛选和搜索
- 模板预览对话框
- 从模板创建流程对话框


### 2. 版本控制模块

#### 2.1 数据模型

**WorkflowVersion 实体**
```typescript
interface WorkflowVersion {
  id: string;                    // 版本唯一标识
  workflowId: string;            // 所属流程 ID
  versionNumber: string;         // 版本号（语义化版本）
  definition: WorkflowDefinition; // 流程定义快照
  changeLog: string;             // 变更说明
  changeType: 'major' | 'minor' | 'patch'; // 变更类型
  createdBy: string;             // 创建者 ID
  createdAt: Date;               // 创建时间
  isRollback: boolean;           // 是否为回滚版本
  rollbackFromVersion?: string;  // 回滚源版本号
  checksum: string;              // 定义内容校验和
}

interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  addedNodes: NodeChange[];      // 新增节点
  removedNodes: NodeChange[];    // 删除节点
  modifiedNodes: NodeChange[];   // 修改节点
  addedEdges: EdgeChange[];      // 新增连接
  removedEdges: EdgeChange[];    // 删除连接
  configChanges: ConfigChange[]; // 配置变更
}

interface NodeChange {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  changes?: PropertyChange[];    // 属性变更详情
}

interface PropertyChange {
  path: string;                  // 属性路径（如 config.timeout）
  oldValue: any;
  newValue: any;
}
```

#### 2.2 后端接口

**VersionController**
```java
@RestController
@RequestMapping("/api/workflow/versions")
public class VersionController {
    
    // 获取流程版本历史
    @GetMapping("/workflow/{workflowId}")
    ResponseEntity<List<VersionDTO>> getVersionHistory(
        @PathVariable String workflowId,
        Pageable pageable
    );
    
    // 获取特定版本详情
    @GetMapping("/{versionId}")
    ResponseEntity<VersionDetailDTO> getVersion(@PathVariable String versionId);
    
    // 对比两个版本
    @GetMapping("/compare")
    ResponseEntity<VersionComparisonDTO> compareVersions(
        @RequestParam String fromVersionId,
        @RequestParam String toVersionId
    );
    
    // 回滚到指定版本（管理员）
    @PostMapping("/rollback")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<WorkflowDTO> rollbackToVersion(
        @RequestBody RollbackRequest request
    );
    
    // 创建版本（内部调用）
    @PostMapping
    ResponseEntity<VersionDTO> createVersion(@RequestBody CreateVersionRequest request);
}
```

#### 2.3 版本号生成策略

使用语义化版本号（Semantic Versioning）：

- **主版本号（Major）**：流程结构重大变更
  - 新增或删除关键节点（开始、结束、审批节点）
  - 流程分支结构变更
  - 节点类型变更

- **次版本号（Minor）**：功能性配置修改
  - 节点配置参数修改
  - 新增非关键节点
  - 连接关系调整

- **修订版本号（Patch）**：小修复和优化
  - 节点名称、描述修改
  - UI 布局调整
  - 注释修改


### 3. 导入导出模块

#### 3.1 数据模型

**导出格式规范**
```typescript
interface WorkflowExportFormat {
  version: string;               // 导出格式版本（如 "1.0.0"）
  exportedAt: Date;              // 导出时间
  exportedBy: string;            // 导出用户
  workflow: {
    id: string;
    name: string;
    description: string;
    categoryId: string;
    tags: string[];
    definition: WorkflowDefinition;
    version: string;             // 流程版本号
    metadata: Record<string, any>; // 元数据
  };
  dependencies?: {               // 依赖信息
    nodeTypes: string[];         // 使用的节点类型
    integrations: string[];      // 使用的集成
  };
  checksum: string;              // 文件校验和
}

interface ImportResult {
  success: boolean;
  workflowId?: string;
  workflowName: string;
  action: 'created' | 'updated' | 'skipped';
  errors?: string[];
  warnings?: string[];
}

interface ConflictResolution {
  strategy: 'overwrite' | 'rename' | 'skip';
  newName?: string;              // 重命名时的新名称
}
```

#### 3.2 后端接口

**ImportExportController**
```java
@RestController
@RequestMapping("/api/workflow/import-export")
public class ImportExportController {
    
    // 导出单个流程
    @GetMapping("/export/{workflowId}")
    ResponseEntity<Resource> exportWorkflow(
        @PathVariable String workflowId,
        @RequestParam(defaultValue = "false") boolean includeSensitive
    );
    
    // 批量导出流程（管理员）
    @PostMapping("/export/batch")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<Resource> exportWorkflows(
        @RequestBody BatchExportRequest request
    );
    
    // 导入流程
    @PostMapping("/import")
    ResponseEntity<ImportResultDTO> importWorkflow(
        @RequestParam("file") MultipartFile file,
        @RequestParam(required = false) String conflictStrategy
    );
    
    // 批量导入流程（管理员）
    @PostMapping("/import/batch")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<List<ImportResultDTO>> importWorkflows(
        @RequestParam("files") List<MultipartFile> files,
        @RequestParam(required = false) String conflictStrategy
    );
    
    // 验证导入文件
    @PostMapping("/import/validate")
    ResponseEntity<ValidationResultDTO> validateImportFile(
        @RequestParam("file") MultipartFile file
    );
}
```

#### 3.3 导入冲突处理策略

**冲突检测**
- 按流程名称检测冲突
- 按流程 ID 检测冲突（如果保留原 ID）
- 检测节点类型兼容性

**解决策略**
1. **覆盖（Overwrite）**：替换现有流程，创建新版本
2. **重命名（Rename）**：自动或手动重命名后导入
3. **跳过（Skip）**：跳过冲突的流程，继续导入其他


### 4. 批量操作模块

#### 4.1 数据模型

**WorkflowArchive 实体**
```typescript
interface WorkflowArchive {
  id: string;                    // 归档记录 ID
  workflowId: string;            // 流程 ID
  workflowName: string;          // 流程名称（冗余存储）
  archivedBy: string;            // 归档操作人
  archivedAt: Date;              // 归档时间
  archiveReason: string;         // 归档原因
  canRestore: boolean;           // 是否可恢复
  originalData: WorkflowDefinition; // 原始流程数据
}

interface BatchOperationResult {
  totalCount: number;            // 总数
  successCount: number;          // 成功数
  failedCount: number;           // 失败数
  skippedCount: number;          // 跳过数
  details: OperationDetail[];    // 详细结果
}

interface OperationDetail {
  workflowId: string;
  workflowName: string;
  status: 'success' | 'failed' | 'skipped';
  message?: string;              // 错误或警告信息
}
```

#### 4.2 后端接口

**BatchOperationController**
```java
@RestController
@RequestMapping("/api/workflow/batch")
public class BatchOperationController {
    
    // 批量归档流程（管理员）
    @PostMapping("/archive")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<BatchOperationResultDTO> archiveWorkflows(
        @RequestBody BatchArchiveRequest request
    );
    
    // 获取归档流程列表（管理员）
    @GetMapping("/archived")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<Page<ArchivedWorkflowDTO>> listArchivedWorkflows(
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) LocalDateTime archivedAfter,
        @RequestParam(required = false) LocalDateTime archivedBefore,
        Pageable pageable
    );
    
    // 恢复归档流程（管理员）
    @PostMapping("/restore")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<BatchOperationResultDTO> restoreWorkflows(
        @RequestBody BatchRestoreRequest request
    );
    
    // 永久删除流程（管理员）
    @DeleteMapping("/permanent")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<BatchOperationResultDTO> permanentDeleteWorkflows(
        @RequestBody BatchDeleteRequest request
    );
    
    // 检查流程是否可以安全归档/删除
    @PostMapping("/check-safety")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<SafetyCheckResultDTO> checkOperationSafety(
        @RequestBody List<String> workflowIds
    );
}
```

#### 4.3 安全检查机制

在执行批量归档或删除前，系统需要检查：

1. **运行中的实例检查**
   - 查询是否有正在运行的流程实例
   - 如果有，警告用户并要求确认

2. **依赖关系检查**
   - 检查是否有其他流程引用该流程
   - 检查是否有定时任务关联该流程

3. **权限验证**
   - 验证操作用户是否有权限操作所有选中的流程
   - 记录操作审计日志


## 数据模型

### 数据库表设计

#### workflow_template（流程模板表）
```sql
CREATE TABLE workflow_template (
    id VARCHAR(64) PRIMARY KEY COMMENT '模板ID',
    name VARCHAR(200) NOT NULL COMMENT '模板名称',
    description TEXT COMMENT '模板描述',
    category_id VARCHAR(64) COMMENT '分类ID',
    tags JSON COMMENT '标签列表',
    definition JSON NOT NULL COMMENT '流程定义',
    preview_image VARCHAR(500) COMMENT '预览图URL',
    created_by VARCHAR(64) NOT NULL COMMENT '创建者ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    usage_count INT DEFAULT 0 COMMENT '使用次数',
    is_system TINYINT(1) DEFAULT 0 COMMENT '是否系统模板',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态',
    INDEX idx_category (category_id),
    INDEX idx_created_by (created_by),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程模板表';
```

#### template_category（模板分类表）
```sql
CREATE TABLE template_category (
    id VARCHAR(64) PRIMARY KEY COMMENT '分类ID',
    name VARCHAR(100) NOT NULL COMMENT '分类名称',
    description VARCHAR(500) COMMENT '分类描述',
    parent_id VARCHAR(64) COMMENT '父分类ID',
    order_num INT DEFAULT 0 COMMENT '排序',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板分类表';
```

#### workflow_version（流程版本表）
```sql
CREATE TABLE workflow_version (
    id VARCHAR(64) PRIMARY KEY COMMENT '版本ID',
    workflow_id VARCHAR(64) NOT NULL COMMENT '流程ID',
    version_number VARCHAR(20) NOT NULL COMMENT '版本号',
    definition JSON NOT NULL COMMENT '流程定义快照',
    change_log TEXT COMMENT '变更说明',
    change_type VARCHAR(20) NOT NULL COMMENT '变更类型',
    created_by VARCHAR(64) NOT NULL COMMENT '创建者ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    is_rollback TINYINT(1) DEFAULT 0 COMMENT '是否回滚版本',
    rollback_from_version VARCHAR(20) COMMENT '回滚源版本',
    checksum VARCHAR(64) NOT NULL COMMENT '校验和',
    INDEX idx_workflow (workflow_id),
    INDEX idx_version (workflow_id, version_number),
    INDEX idx_created_at (created_at),
    UNIQUE KEY uk_workflow_version (workflow_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程版本表';
```

#### workflow_archive（流程归档表）
```sql
CREATE TABLE workflow_archive (
    id VARCHAR(64) PRIMARY KEY COMMENT '归档ID',
    workflow_id VARCHAR(64) NOT NULL COMMENT '流程ID',
    workflow_name VARCHAR(200) NOT NULL COMMENT '流程名称',
    archived_by VARCHAR(64) NOT NULL COMMENT '归档人ID',
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
    archive_reason TEXT COMMENT '归档原因',
    can_restore TINYINT(1) DEFAULT 1 COMMENT '是否可恢复',
    original_data JSON NOT NULL COMMENT '原始数据',
    INDEX idx_workflow (workflow_id),
    INDEX idx_archived_by (archived_by),
    INDEX idx_archived_at (archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程归档表';
```

#### workflow 表扩展字段
```sql
ALTER TABLE workflow ADD COLUMN template_id VARCHAR(64) COMMENT '来源模板ID';
ALTER TABLE workflow ADD COLUMN current_version VARCHAR(20) DEFAULT '1.0.0' COMMENT '当前版本号';
ALTER TABLE workflow ADD COLUMN is_archived TINYINT(1) DEFAULT 0 COMMENT '是否已归档';
ALTER TABLE workflow ADD INDEX idx_template (template_id);
ALTER TABLE workflow ADD INDEX idx_archived (is_archived);
```

### 索引策略

1. **查询优化索引**
   - 模板按分类查询：`idx_category`
   - 版本历史查询：`idx_workflow`
   - 归档流程查询：`idx_archived_at`

2. **唯一性约束**
   - 流程版本唯一：`uk_workflow_version`

3. **性能考虑**
   - JSON 字段不建索引，使用全文搜索或 ES 扩展
   - 大字段（definition）考虑分离存储


## 正确性属性

正确性属性是系统行为的形式化规范，描述了在所有有效执行中都应该保持为真的特性。这些属性作为需求和实现之间的桥梁，为自动化测试提供可验证的规范。

### 模板库模块属性

**属性 1：模板输入验证完整性**
*对于任意*模板创建或更新请求，如果缺少必填字段（名称、描述、分类、标签），系统都应该拒绝该请求并返回明确的验证错误。
**验证需求：1.2**

**属性 2：模板结构有效性**
*对于任意*模板定义，系统都应该验证其至少包含一个开始节点和一个结束节点，否则拒绝保存。
**验证需求：1.3**

**属性 3：模板删除安全性**
*对于任意*被流程引用的模板，删除操作都应该被阻止，并提示有多少个流程正在使用该模板。
**验证需求：1.6, 10.1**

**属性 4：模板元数据完整性**
*对于任意*模板的创建或修改操作，系统都应该自动记录或更新创建时间、创建者、最后修改时间和使用次数。
**验证需求：1.7**

**属性 5：模板搜索准确性**
*对于任意*按分类、标签或关键词的搜索请求，返回的所有模板都应该匹配至少一个搜索条件。
**验证需求：2.2**

**属性 6：模板复制完整性**
*对于任意*从模板创建流程的操作，新流程应该包含模板的所有节点、连接和基础配置，且节点数量和连接数量应该相等。
**验证需求：2.4**

**属性 7：模板使用计数准确性**
*对于任意*成功从模板创建流程的操作，该模板的使用计数都应该增加 1。
**验证需求：2.7**

**属性 8：模板来源可追溯性**
*对于任意*从模板创建的流程，都应该记录其来源模板 ID，且该 ID 应该能关联到有效的模板记录。
**验证需求：2.5**

### 版本控制模块属性

**属性 9：版本自动创建**
*对于任意*流程保存操作，系统都应该自动创建一个新的版本记录。
**验证需求：3.1**

**属性 10：版本元数据完整性**
*对于任意*版本记录，都应该包含版本号、保存时间、操作用户和变更说明这四个必要字段。
**验证需求：3.2**

**属性 11：版本号格式规范性**
*对于任意*生成的版本号，都应该符合语义化版本格式（X.Y.Z），其中 X、Y、Z 都是非负整数。
**验证需求：3.3**

**属性 12：版本号递增正确性**
*对于任意*流程变更，系统应该根据变更类型正确递增版本号：结构重大变更增加主版本号，配置修改增加次版本号，小修复增加修订版本号。
**验证需求：3.4, 3.5, 3.6**

**属性 13：版本数据持久性**
*对于任意*历史版本，都应该能完整恢复其流程定义数据，且恢复后的数据应该与保存时的数据一致（通过校验和验证）。
**验证需求：3.7**

**属性 14：版本对比准确性**
*对于任意*两个不同版本的对比，系统都应该能正确识别所有新增、删除和修改的节点及连接。
**验证需求：4.1**

**属性 15：配置变更细粒度对比**
*对于任意*节点配置的变更，系统都应该能识别到字段级别的差异，包括字段路径、旧值和新值。
**验证需求：4.2**

**属性 16：版本回滚非破坏性**
*对于任意*版本回滚操作，系统都应该创建新版本而不是覆盖当前版本，且新版本的变更说明应该包含"回滚自版本 X.Y.Z"标记。
**验证需求：4.4, 4.5**

**属性 17：回滚安全检查**
*对于任意*有正在运行实例的流程，执行回滚操作时都应该触发警告并要求用户确认。
**验证需求：4.6**

**属性 18：版本号唯一性和连续性**
*对于任意*流程的版本序列，版本号都应该是唯一的且按时间顺序递增的。
**验证需求：10.4**

### 导入导出模块属性

**属性 19：导出数据完整性**
*对于任意*流程的导出操作，导出的 JSON 文件都应该包含流程的所有节点、连接、配置和元数据，且节点数量应该与原流程一致。
**验证需求：5.3**

**属性 20：导出元数据包含性**
*对于任意*导出的 JSON 文件，都应该包含流程版本信息和导出时间戳字段。
**验证需求：5.4**

**属性 21：导出文件命名规范性**
*对于任意*导出操作，生成的文件名都应该符合标准格式：workflow_{名称}_{版本}_{日期}.json。
**验证需求：5.6**

**属性 22：导入格式验证**
*对于任意*上传的导入文件，系统都应该验证其 JSON 格式的有效性和必要字段的完整性，无效文件应该被拒绝。
**验证需求：6.2**

**属性 23：导入冲突处理**
*对于任意*导入的流程，如果其名称已存在，系统都应该提示用户选择处理策略（覆盖、重命名或跳过），而不是直接覆盖。
**验证需求：6.3**

**属性 24：导入兼容性验证**
*对于任意*导入的流程，系统都应该验证其所有节点类型在当前系统中是否可用，如果存在不支持的节点类型，应该列出并阻止导入。
**验证需求：6.4, 6.5**

**属性 25：导入结果完整性**
*对于任意*导入操作（单个或批量），系统都应该返回包含成功数、失败数和跳过数的结果摘要。
**验证需求：6.7**

**属性 26：导入事务原子性**
*对于任意*流程导入操作，所有数据写入都应该在事务中完成，如果发生错误，应该回滚所有已导入的数据。
**验证需求：10.2, 10.3**

**属性 27：导入导出往返一致性（Round-trip）**
*对于任意*流程，执行导出然后导入操作后，新流程的定义应该与原流程的定义一致（节点、连接、配置完全相同）。
**验证需求：5.1, 5.3, 6.2**

### 批量操作模块属性

**属性 28：归档数据保留性**
*对于任意*归档的流程，系统都应该将其标记为不可见状态，但保留所有原始数据，且归档后的流程不应该出现在正常的流程列表中。
**验证需求：7.4**

**属性 29：归档安全检查**
*对于任意*有正在运行实例的流程，执行归档操作时都应该触发警告并要求管理员确认。
**验证需求：7.5**

**属性 30：归档通知发送**
*对于任意*归档操作，系统都应该向流程创建者发送通知。
**验证需求：7.6**

**属性 31：归档搜索准确性**
*对于任意*按归档时间、流程名称或归档原因的搜索请求，返回的所有归档流程都应该匹配搜索条件。
**验证需求：8.3**

**属性 32：归档恢复完整性**
*对于任意*归档流程的恢复操作，恢复后的流程应该恢复到正常可见状态，且所有数据应该与归档前一致。
**验证需求：8.4**

**属性 33：永久删除级联性**
*对于任意*永久删除操作，系统都应该级联删除该流程的所有版本历史记录、归档记录和审计日志。
**验证需求：8.7, 10.7**

**属性 34：批量操作事务原子性**
*对于任意*批量归档或删除操作，所有操作都应该在数据库事务中执行，保证要么全部成功，要么全部失败。
**验证需求：10.5**

**属性 35：归档状态验证**
*对于任意*归档操作，系统都应该验证流程状态的有效性（如流程未被删除、未被归档），无效状态应该被拒绝。
**验证需求：10.6**

### 权限控制属性

**属性 36：管理员权限强制性**
*对于任意*需要管理员权限的操作（模板管理、版本回滚、批量导出、批量归档、永久删除），非管理员用户的请求都应该被拒绝并返回 403 权限错误。
**验证需求：9.1, 9.3, 9.4, 9.6, 9.7**

**属性 37：流程所有权验证**
*对于任意*流程的版本历史查看或导出操作，只有流程创建者或管理员应该能访问，其他用户应该被拒绝。
**验证需求：9.3, 9.5**

**属性 38：权限错误明确性**
*对于任意*无权限的操作请求，系统都应该返回明确的权限错误提示，说明需要什么权限。
**验证需求：9.8**

### 审计和日志属性

**属性 39：关键操作审计完整性**
*对于任意*关键操作（版本回滚、流程归档、永久删除），系统都应该记录包含操作人、操作时间、操作类型和操作原因的审计日志。
**验证需求：4.7, 7.7**


## 错误处理

### 错误分类和处理策略

#### 1. 客户端错误（4xx）

**400 Bad Request - 请求参数错误**
- 场景：缺少必填字段、字段格式不正确、JSON 格式无效
- 响应示例：
```json
{
  "code": "INVALID_REQUEST",
  "message": "请求参数验证失败",
  "errors": [
    {
      "field": "name",
      "message": "模板名称不能为空"
    }
  ]
}
```

**403 Forbidden - 权限不足**
- 场景：非管理员尝试执行管理员操作
- 响应示例：
```json
{
  "code": "PERMISSION_DENIED",
  "message": "您没有权限执行此操作，需要管理员权限"
}
```

**404 Not Found - 资源不存在**
- 场景：请求的模板、流程或版本不存在
- 响应示例：
```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "未找到 ID 为 xxx 的流程模板"
}
```

**409 Conflict - 资源冲突**
- 场景：导入流程名称冲突、版本号冲突
- 响应示例：
```json
{
  "code": "RESOURCE_CONFLICT",
  "message": "流程名称已存在",
  "conflictType": "NAME_DUPLICATE",
  "suggestions": ["重命名", "覆盖", "跳过"]
}
```

#### 2. 服务器错误（5xx）

**500 Internal Server Error - 服务器内部错误**
- 场景：数据库连接失败、未预期的异常
- 处理：记录详细错误日志，返回通用错误信息
- 响应示例：
```json
{
  "code": "INTERNAL_ERROR",
  "message": "服务器内部错误，请稍后重试",
  "requestId": "req-123456"
}
```

**503 Service Unavailable - 服务不可用**
- 场景：数据库维护、系统升级
- 响应示例：
```json
{
  "code": "SERVICE_UNAVAILABLE",
  "message": "系统正在维护，预计 30 分钟后恢复"
}
```

### 业务错误处理

#### 模板库模块

1. **模板删除被引用错误**
```java
if (workflowRepository.countByTemplateId(templateId) > 0) {
    throw new BusinessException(
        "TEMPLATE_IN_USE",
        "该模板正在被使用，无法删除",
        Map.of("usageCount", count)
    );
}
```

2. **模板结构验证错误**
```java
if (!hasStartNode(definition) || !hasEndNode(definition)) {
    throw new ValidationException(
        "INVALID_TEMPLATE_STRUCTURE",
        "模板必须包含至少一个开始节点和一个结束节点"
    );
}
```

#### 版本控制模块

1. **版本回滚冲突**
```java
if (hasRunningInstances(workflowId)) {
    return WarningResponse.builder()
        .code("RUNNING_INSTANCES_WARNING")
        .message("该流程有正在运行的实例，回滚可能影响运行中的流程")
        .requireConfirmation(true)
        .build();
}
```

2. **版本不存在错误**
```java
Version version = versionRepository.findById(versionId)
    .orElseThrow(() -> new NotFoundException(
        "VERSION_NOT_FOUND",
        "未找到指定的版本记录"
    ));
```

#### 导入导出模块

1. **导入文件格式错误**
```java
try {
    WorkflowExportFormat format = objectMapper.readValue(file, WorkflowExportFormat.class);
    validateExportFormat(format);
} catch (JsonProcessingException e) {
    throw new ValidationException(
        "INVALID_JSON_FORMAT",
        "导入文件格式不正确，请确保是有效的 JSON 文件"
    );
}
```

2. **节点类型不兼容错误**
```java
List<String> unsupportedTypes = findUnsupportedNodeTypes(workflow);
if (!unsupportedTypes.isEmpty()) {
    throw new ValidationException(
        "UNSUPPORTED_NODE_TYPES",
        "流程包含不支持的节点类型",
        Map.of("unsupportedTypes", unsupportedTypes)
    );
}
```

3. **导入事务回滚**
```java
@Transactional(rollbackFor = Exception.class)
public ImportResult importWorkflow(MultipartFile file) {
    try {
        // 导入逻辑
        return ImportResult.success();
    } catch (Exception e) {
        // 事务自动回滚
        log.error("导入失败，已回滚所有更改", e);
        throw new ImportException("IMPORT_FAILED", "导入失败：" + e.getMessage());
    }
}
```

#### 批量操作模块

1. **归档安全检查**
```java
List<String> workflowsWithInstances = checkRunningInstances(workflowIds);
if (!workflowsWithInstances.isEmpty()) {
    return WarningResponse.builder()
        .code("RUNNING_INSTANCES_WARNING")
        .message("以下流程有正在运行的实例")
        .affectedWorkflows(workflowsWithInstances)
        .requireConfirmation(true)
        .build();
}
```

2. **批量操作部分失败处理**
```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public OperationDetail archiveSingleWorkflow(String workflowId) {
    try {
        // 归档单个流程
        return OperationDetail.success(workflowId);
    } catch (Exception e) {
        log.error("归档流程失败: {}", workflowId, e);
        return OperationDetail.failed(workflowId, e.getMessage());
    }
}

public BatchOperationResult archiveWorkflows(List<String> workflowIds) {
    List<OperationDetail> details = workflowIds.stream()
        .map(this::archiveSingleWorkflow)
        .collect(Collectors.toList());
    
    return BatchOperationResult.builder()
        .totalCount(workflowIds.size())
        .successCount(countSuccess(details))
        .failedCount(countFailed(details))
        .details(details)
        .build();
}
```

### 错误日志记录

所有错误都应该记录详细的日志信息：

```java
@Slf4j
public class ErrorLoggingAspect {
    
    @AfterThrowing(pointcut = "execution(* com.cloudflow..*(..))", throwing = "ex")
    public void logError(JoinPoint joinPoint, Throwable ex) {
        String methodName = joinPoint.getSignature().getName();
        String className = joinPoint.getTarget().getClass().getName();
        Object[] args = joinPoint.getArgs();
        
        log.error("错误发生在 {}.{}, 参数: {}, 错误: {}",
            className, methodName, args, ex.getMessage(), ex);
        
        // 记录到审计日志
        auditLogService.logError(className, methodName, args, ex);
    }
}
```

### 前端错误处理

```typescript
// 统一错误处理器
export const handleApiError = (error: AxiosError<ApiError>) => {
  const { code, message, errors } = error.response?.data || {};
  
  switch (code) {
    case 'PERMISSION_DENIED':
      notification.error({
        message: '权限不足',
        description: message,
      });
      break;
      
    case 'RESOURCE_CONFLICT':
      // 显示冲突解决对话框
      showConflictDialog(error.response?.data);
      break;
      
    case 'RUNNING_INSTANCES_WARNING':
      // 显示确认对话框
      showConfirmDialog(message, () => {
        // 用户确认后重试
        retryWithConfirmation();
      });
      break;
      
    case 'INVALID_REQUEST':
      // 显示字段级别的验证错误
      showValidationErrors(errors);
      break;
      
    default:
      notification.error({
        message: '操作失败',
        description: message || '未知错误，请稍后重试',
      });
  }
};
```


## 实施注意事项

### 性能优化建议

1. **版本对比缓存**
   - 使用 Redis 缓存版本对比结果
   - 缓存键：`version:compare:{fromVersionId}:{toVersionId}`
   - 过期时间：1 小时

2. **批量操作优化**
   - 使用批处理减少数据库往返
   - 每批处理 100 条记录
   - 使用线程池并行处理（注意事务边界）

3. **大文件导入优化**
   - 使用流式 JSON 解析
   - 分块处理大型流程定义
   - 设置文件大小限制（建议 10MB）

### 安全考虑

1. **权限验证**
   - 所有 API 都需要进行权限验证
   - 使用 Spring Security 的 `@PreAuthorize` 注解
   - 记录所有敏感操作的审计日志

2. **数据脱敏**
   - 导出时可选择是否包含敏感配置
   - 审计日志中不记录敏感数据

3. **SQL 注入防护**
   - 使用 MyBatis-Plus 的参数化查询
   - 避免拼接 SQL 语句

### 数据库初始化

直接创建所有必要的表和初始数据：

```sql
-- 创建模板分类表
CREATE TABLE template_category (
    id VARCHAR(64) PRIMARY KEY COMMENT '分类ID',
    name VARCHAR(100) NOT NULL COMMENT '分类名称',
    description VARCHAR(500) COMMENT '分类描述',
    parent_id VARCHAR(64) COMMENT '父分类ID',
    order_num INT DEFAULT 0 COMMENT '排序',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板分类表';

-- 创建流程模板表
CREATE TABLE workflow_template (
    id VARCHAR(64) PRIMARY KEY COMMENT '模板ID',
    name VARCHAR(200) NOT NULL COMMENT '模板名称',
    description TEXT COMMENT '模板描述',
    category_id VARCHAR(64) COMMENT '分类ID',
    tags JSON COMMENT '标签列表',
    definition JSON NOT NULL COMMENT '流程定义',
    preview_image VARCHAR(500) COMMENT '预览图URL',
    created_by VARCHAR(64) NOT NULL COMMENT '创建者ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    usage_count INT DEFAULT 0 COMMENT '使用次数',
    is_system TINYINT(1) DEFAULT 0 COMMENT '是否系统模板',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态',
    INDEX idx_category (category_id),
    INDEX idx_created_by (created_by),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程模板表';

-- 创建流程版本表
CREATE TABLE workflow_version (
    id VARCHAR(64) PRIMARY KEY COMMENT '版本ID',
    workflow_id VARCHAR(64) NOT NULL COMMENT '流程ID',
    version_number VARCHAR(20) NOT NULL COMMENT '版本号',
    definition JSON NOT NULL COMMENT '流程定义快照',
    change_log TEXT COMMENT '变更说明',
    change_type VARCHAR(20) NOT NULL COMMENT '变更类型',
    created_by VARCHAR(64) NOT NULL COMMENT '创建者ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    is_rollback TINYINT(1) DEFAULT 0 COMMENT '是否回滚版本',
    rollback_from_version VARCHAR(20) COMMENT '回滚源版本',
    checksum VARCHAR(64) NOT NULL COMMENT '校验和',
    INDEX idx_workflow (workflow_id),
    INDEX idx_version (workflow_id, version_number),
    INDEX idx_created_at (created_at),
    UNIQUE KEY uk_workflow_version (workflow_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程版本表';

-- 创建流程归档表
CREATE TABLE workflow_archive (
    id VARCHAR(64) PRIMARY KEY COMMENT '归档ID',
    workflow_id VARCHAR(64) NOT NULL COMMENT '流程ID',
    workflow_name VARCHAR(200) NOT NULL COMMENT '流程名称',
    archived_by VARCHAR(64) NOT NULL COMMENT '归档人ID',
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
    archive_reason TEXT COMMENT '归档原因',
    can_restore TINYINT(1) DEFAULT 1 COMMENT '是否可恢复',
    original_data JSON NOT NULL COMMENT '原始数据',
    INDEX idx_workflow (workflow_id),
    INDEX idx_archived_by (archived_by),
    INDEX idx_archived_at (archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程归档表';

-- 修改现有 workflow 表，添加新字段
ALTER TABLE workflow 
    ADD COLUMN template_id VARCHAR(64) COMMENT '来源模板ID',
    ADD COLUMN current_version VARCHAR(20) DEFAULT '1.0.0' COMMENT '当前版本号',
    ADD COLUMN is_archived TINYINT(1) DEFAULT 0 COMMENT '是否已归档',
    ADD INDEX idx_template (template_id),
    ADD INDEX idx_archived (is_archived);

-- 插入预置模板分类
INSERT INTO template_category (id, name, description, order_num) VALUES
('cat-hr', '人事管理', '人力资源相关流程', 1),
('cat-finance', '财务管理', '财务相关流程', 2),
('cat-procurement', '采购管理', '采购相关流程', 3),
('cat-contract', '合同管理', '合同审批相关流程', 4),
('cat-admin', '行政管理', '行政事务相关流程', 5);

-- 插入预置流程模板（示例：请假流程）
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status) VALUES
('tpl-leave', '请假流程', '员工请假审批流程模板', 'cat-hr', '["请假", "审批", "人事"]', 
'{"nodes": [{"id": "start", "type": "start", "name": "开始"}, {"id": "apply", "type": "form", "name": "填写请假申请"}, {"id": "approve", "type": "approval", "name": "主管审批"}, {"id": "end", "type": "end", "name": "结束"}], "edges": [{"from": "start", "to": "apply"}, {"from": "apply", "to": "approve"}, {"from": "approve", "to": "end"}]}',
1, 'active');

-- 更多预置模板可以继续添加...
```

