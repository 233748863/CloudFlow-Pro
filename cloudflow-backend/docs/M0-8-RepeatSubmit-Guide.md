# M0-8: @RepeatSubmit 默认挂载指南

## 背景

M0-8 要求业务模块所有写接口（`add*/submit*/approve*/reject*/publish*/cancel*/convert*/receive*/handover*`）挂载 `@RepeatSubmit` 注解，防止重复提交。

## 实施范围

- **模块**：cloudflow-service-oa / cloudflow-service-crm / cloudflow-service-hr / cloudflow-service-workflow
- **目标方法**：所有 `@PostMapping` 且方法名匹配上述模式的 Controller 方法
- **TTL**：默认 3s（`@RepeatSubmit` 默认值）
- **Key**：`user+uri+payloadHash`（`cloudflow-common-idempotent` 默认策略）

## 挂载示例

### 修改前
```java
@PostMapping("/submit")
public R<Void> submitClaim(@RequestBody BizExpenseClaim claim) {
    expenseClaimService.submitClaim(claim.getId());
    return R.ok();
}
```

### 修改后
```java
@RepeatSubmit  // M0-8: 防重复提交
@PostMapping("/submit")
public R<Void> submitClaim(@RequestBody BizExpenseClaim claim) {
    expenseClaimService.submitClaim(claim.getId());
    return R.ok();
}
```

## 豁免场景

以下场景显式标注豁免（需在 `RepeatSubmit` 注解类加 `@interface Disabled`）：

- 文件分片上传 `/file/chunk/upload`（同 hash 必失败）
- 心跳 / 状态查询 `*/keepalive` / `*/status`
- 计数器自增 `*/counter/increment`

豁免示例：
```java
@RepeatSubmit.Disabled  // 文件分片上传，同 hash 必失败
@PostMapping("/chunk/upload")
public R<Void> uploadChunk(@RequestBody ChunkDTO chunk) {
    // ...
}
```

## ArchUnit 校验

M0-7 已引入 ArchUnit 规则 1：写接口必须 `@RepeatSubmit` 或显式豁免，缺失即编译期红。

## 执行计划

M0-8 在 M0 阶段仅做准备（注解定义已存在、ArchUnit 规则已立），**实际批量挂载在 M1-8 执行**（与 INF-09-A 对齐）。

## 验证

```bash
# 编译期校验（ArchUnit）
mvn test -Dtest=CloudFlowArchitectureTest#controllerWriteMethodsShouldHaveRepeatSubmit

# 运行期验证
# 同请求 3s 内重复 POST，第 2 次应返回 409 重复提交
```
