# HR服务异常处理

## 异常类

### 1. HrBusinessException - 业务异常
用于所有业务逻辑错误，返回 400 Bad Request

**工厂方法：**
- `insufficientQuota()` - 假期额度不足
- `positionHasEmployee()` - 职位存在在职员工
- `contractExpired()` - 合同已过期
- `invalidEmployeeStatus()` - 员工状态无效
- `headcountExceeded()` - 编制超额
- `duplicateEmployeeNo()` - 工号重复
- `attendanceConflict()` - 考勤冲突
- `invalidDeptOrPost()` - 部门或岗位无效

### 2. HrSystemException - 系统异常
用于系统级错误，返回 500 Internal Server Error 或 503 Service Unavailable

**工厂方法：**
- `authServiceFailed()` - Auth服务调用失败
- `workflowServiceFailed()` - Workflow服务调用失败
- `deptSyncFailed()` - 部门数据同步失败
- `postSyncFailed()` - 岗位数据同步失败
- `fullSyncFailed()` - 全量同步失败

## 使用示例

```java
// 业务异常
if (availableQuota.compareTo(requestedQuota) < 0) {
    throw HrBusinessException.insufficientQuota("年假", availableQuota, requestedQuota);
}

// 系统异常
try {
    authServiceClient.getDeptTree(tenantId);
} catch (Exception e) {
    throw HrSystemException.authServiceFailed("/api/auth/dept/tree", "连接超时", e);
}
```

## 异常处理器

`HrExceptionHandler` 统一处理所有HR异常，记录日志并返回标准化响应。
