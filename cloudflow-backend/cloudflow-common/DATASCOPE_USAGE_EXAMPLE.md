# 数据权限使用示例

本文档提供了在CloudFlow项目中使用数据权限系统的完整示例。

## 目录

1. [前置准备](#前置准备)
2. [数据库配置](#数据库配置)
3. [Mapper层实现](#mapper层实现)
4. [Service层实现](#service层实现)
5. [Controller层实现](#controller层实现)
6. [测试场景](#测试场景)

---

## 前置准备

### 1. 确保已完成集成

参考 `DATASCOPE_INTEGRATION_GUIDE.md` 完成以下步骤:
- 在 `pom.xml` 中添加依赖
- 在 `application.yml` 中配置MyBatis-Plus
- 确保 `sys_role` 表已添加 `ds_type` 和 `ds_scope` 字段

### 2. 理解数据权限类型

```java
// 数据权限类型枚举
public enum DataScopeTypeEnum {
    ALL(0, "全部数据权限"),           // 可以查看所有数据
    CUSTOM(1, "自定义数据权限"),      // 可以查看指定部门的数据
    OWN_CHILD_LEVEL(2, "本级及下级"), // 可以查看本部门及下级部门的数据
    OWN_LEVEL(3, "本级"),            // 只能查看本部门的数据
    SELF_LEVEL(4, "本人");           // 只能查看自己创建的数据
}
```

---

## 数据库配置

### 1. 业务表设计

假设我们有一个请假申请表 `oa_leave_request`:

```sql
CREATE TABLE `oa_leave_request` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint(20) NOT NULL COMMENT '申请人ID',
  `user_name` varchar(50) NOT NULL COMMENT '申请人姓名',
  `dept_id` bigint(20) NOT NULL COMMENT '申请人部门ID',
  `leave_type` varchar(20) NOT NULL COMMENT '请假类型',
  `start_date` date NOT NULL COMMENT '开始日期',
  `end_date` date NOT NULL COMMENT '结束日期',
  `days` int(11) NOT NULL COMMENT '请假天数',
  `reason` varchar(500) DEFAULT NULL COMMENT '请假原因',
  `status` varchar(20) DEFAULT 'PENDING' COMMENT '状态',
  `create_by` varchar(50) DEFAULT NULL COMMENT '创建人',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_dept_id` (`dept_id`),
  KEY `idx_create_by` (`create_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='请假申请表';
```

**关键字段说明:**
- `dept_id`: 用于部门级别的数据权限过滤
- `create_by`: 用于个人级别的数据权限过滤

### 2. 配置角色数据权限

```sql
-- 示例: 配置不同角色的数据权限

-- 1. 总经理角色 - 全部数据权限
UPDATE sys_role SET ds_type = 0, ds_scope = NULL 
WHERE role_key = 'ceo';

-- 2. 部门经理角色 - 本级及下级数据权限
UPDATE sys_role SET ds_type = 2, ds_scope = NULL 
WHERE role_key = 'dept_manager';

-- 3. 人事专员角色 - 自定义数据权限(可以查看人事部和行政部)
UPDATE sys_role SET ds_type = 1, ds_scope = '100,101' 
WHERE role_key = 'hr_specialist';

-- 4. 普通员工角色 - 本人数据权限
UPDATE sys_role SET ds_type = 4, ds_scope = NULL 
WHERE role_key = 'employee';
```

---

## Mapper层实现

### 1. 创建Domain类

```java
package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.io.Serializable;
import java.util.Date;

/**
 * 请假申请实体类
 */
@Data
@TableName("oa_leave_request")
public class LeaveRequest implements Serializable {
    
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /** 申请人ID */
    private Long userId;
    
    /** 申请人姓名 */
    private String userName;
    
    /** 申请人部门ID */
    private Long deptId;
    
    /** 请假类型 */
    private String leaveType;
    
    /** 开始日期 */
    private Date startDate;
    
    /** 结束日期 */
    private Date endDate;
    
    /** 请假天数 */
    private Integer days;
    
    /** 请假原因 */
    private String reason;
    
    /** 状态 */
    private String status;
    
    /** 创建人 */
    private String createBy;
    
    /** 创建时间 */
    private Date createTime;
}
```

### 2. 创建Mapper接口

**重要: 继承 `CloudFlowBaseMapper` 而不是 `BaseMapper`**

```java
package com.cloudflow.oa.mapper;

import com.cloudflow.common.datascope.CloudFlowBaseMapper;
import com.cloudflow.oa.domain.LeaveRequest;
import org.apache.ibatis.annotations.Mapper;

/**
 * 请假申请Mapper接口
 * 继承CloudFlowBaseMapper以自动启用数据权限
 */
@Mapper
public interface LeaveRequestMapper extends CloudFlowBaseMapper<LeaveRequest> {
    // 继承CloudFlowBaseMapper后,所有查询方法都会自动应用数据权限
    // 无需额外配置
}
```

---

## Service层实现

### 1. Service接口

```java
package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.LeaveRequest;
import java.util.List;

/**
 * 请假申请Service接口
 */
public interface ILeaveRequestService {
    
    /**
     * 查询请假申请列表
     * 根据当前用户的数据权限自动过滤
     */
    List<LeaveRequest> selectLeaveRequestList(LeaveRequest leaveRequest);
    
    /**
     * 根据ID查询请假申请
     */
    LeaveRequest selectLeaveRequestById(Long id);
    
    /**
     * 新增请假申请
     */
    int insertLeaveRequest(LeaveRequest leaveRequest);
    
    /**
     * 修改请假申请
     */
    int updateLeaveRequest(LeaveRequest leaveRequest);
    
    /**
     * 删除请假申请
     */
    int deleteLeaveRequestById(Long id);
}
```

### 2. Service实现类

```java
package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.LeaveRequest;
import com.cloudflow.oa.mapper.LeaveRequestMapper;
import com.cloudflow.oa.service.ILeaveRequestService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Date;
import java.util.List;

/**
 * 请假申请Service实现类
 */
@Service
public class LeaveRequestServiceImpl implements ILeaveRequestService {
    
    @Autowired
    private LeaveRequestMapper leaveRequestMapper;
    
    @Override
    public List<LeaveRequest> selectLeaveRequestList(LeaveRequest leaveRequest) {
        // 构建查询条件
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<>();
        
        // 业务查询条件
        if (leaveRequest.getUserId() != null) {
            wrapper.eq(LeaveRequest::getUserId, leaveRequest.getUserId());
        }
        if (StringUtils.hasText(leaveRequest.getLeaveType())) {
            wrapper.eq(LeaveRequest::getLeaveType, leaveRequest.getLeaveType());
        }
        if (StringUtils.hasText(leaveRequest.getStatus())) {
            wrapper.eq(LeaveRequest::getStatus, leaveRequest.getStatus());
        }
        if (leaveRequest.getStartDate() != null) {
            wrapper.ge(LeaveRequest::getStartDate, leaveRequest.getStartDate());
        }
        if (leaveRequest.getEndDate() != null) {
            wrapper.le(LeaveRequest::getEndDate, leaveRequest.getEndDate());
        }
        
        // 排序
        wrapper.orderByDesc(LeaveRequest::getCreateTime);
        
        // 执行查询 - 数据权限会自动应用
        // CloudFlowBaseMapper会自动在SQL中添加数据权限过滤条件
        return leaveRequestMapper.selectList(wrapper);
    }
    
    @Override
    public LeaveRequest selectLeaveRequestById(Long id) {
        // 根据ID查询也会自动应用数据权限
        return leaveRequestMapper.selectById(id);
    }
    
    @Override
    public int insertLeaveRequest(LeaveRequest leaveRequest) {
        // 设置创建信息
        leaveRequest.setCreateBy(UserContext.getUserName());
        leaveRequest.setCreateTime(new Date());
        leaveRequest.setUserId(UserContext.getUserId());
        leaveRequest.setUserName(UserContext.getUserName());
        leaveRequest.setDeptId(UserContext.getDeptId());
        
        return leaveRequestMapper.insert(leaveRequest);
    }
    
    @Override
    public int updateLeaveRequest(LeaveRequest leaveRequest) {
        // 更新操作也会自动应用数据权限
        // 只能更新有权限查看的数据
        return leaveRequestMapper.updateById(leaveRequest);
    }
    
    @Override
    public int deleteLeaveRequestById(Long id) {
        // 删除操作也会自动应用数据权限
        // 只能删除有权限查看的数据
        return leaveRequestMapper.deleteById(id);
    }
}
```

---

## Controller层实现

```java
package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.LeaveRequest;
import com.cloudflow.oa.service.ILeaveRequestService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 请假申请Controller
 */
@RestController
@RequestMapping("/oa/leave")
public class LeaveRequestController {
    
    @Autowired
    private ILeaveRequestService leaveRequestService;
    
    /**
     * 查询请假申请列表
     * 数据权限会自动根据用户角色过滤结果
     */
    @PreAuthorize("@ss.hasPermi('oa:leave:list')")
    @GetMapping("/list")
    public R<List<LeaveRequest>> list(LeaveRequest leaveRequest) {
        // Service层会自动应用数据权限
        List<LeaveRequest> list = leaveRequestService.selectLeaveRequestList(leaveRequest);
        return R.ok(list);
    }
    
    /**
     * 根据ID查询请假申请详情
     */
    @PreAuthorize("@ss.hasPermi('oa:leave:query')")
    @GetMapping("/{id}")
    public R<LeaveRequest> getInfo(@PathVariable Long id) {
        // 如果用户没有权限查看此数据,会返回null
        LeaveRequest leaveRequest = leaveRequestService.selectLeaveRequestById(id);
        return R.ok(leaveRequest);
    }
    
    /**
     * 新增请假申请
     */
    @PreAuthorize("@ss.hasPermi('oa:leave:add')")
    @PostMapping
    public R<Void> add(@RequestBody LeaveRequest leaveRequest) {
        return R.ok(leaveRequestService.insertLeaveRequest(leaveRequest));
    }
    
    /**
     * 修改请假申请
     */
    @PreAuthorize("@ss.hasPermi('oa:leave:edit')")
    @PutMapping
    public R<Void> edit(@RequestBody LeaveRequest leaveRequest) {
        return R.ok(leaveRequestService.updateLeaveRequest(leaveRequest));
    }
    
    /**
     * 删除请假申请
     */
    @PreAuthorize("@ss.hasPermi('oa:leave:remove')")
    @DeleteMapping("/{id}")
    public R<Void> remove(@PathVariable Long id) {
        return R.ok(leaveRequestService.deleteLeaveRequestById(id));
    }
}
```

---

## 测试场景

### 场景1: 总经理查询(全部数据权限)

**用户信息:**
- 角色: 总经理(ceo)
- 数据权限: 全部数据权限(ds_type=0)

**执行查询:**
```java
GET /oa/leave/list
```

**生成的SQL:**
```sql
SELECT * FROM oa_leave_request 
ORDER BY create_time DESC
-- 没有额外的WHERE条件,可以查看所有数据
```

**结果:** 返回所有部门的所有请假申请

---

### 场景2: 部门经理查询(本级及下级)

**用户信息:**
- 角色: 部门经理(dept_manager)
- 部门: 研发部(dept_id=100)
- 数据权限: 本级及下级(ds_type=2)

**部门结构:**
```
研发部(100)
├── 前端组(101)
└── 后端组(102)
```

**执行查询:**
```java
GET /oa/leave/list
```

**生成的SQL:**
```sql
SELECT * FROM oa_leave_request 
WHERE dept_id IN (100, 101, 102)  -- 自动添加的数据权限条件
ORDER BY create_time DESC
```

**结果:** 返回研发部及其下级部门(前端组、后端组)的所有请假申请

---

### 场景3: 人事专员查询(自定义权限)

**用户信息:**
- 角色: 人事专员(hr_specialist)
- 数据权限: 自定义(ds_type=1, ds_scope='100,101')

**执行查询:**
```java
GET /oa/leave/list
```

**生成的SQL:**
```sql
SELECT * FROM oa_leave_request 
WHERE dept_id IN (100, 101)  -- 根据ds_scope配置的部门ID
ORDER BY create_time DESC
```

**结果:** 只返回人事部(100)和行政部(101)的请假申请

---

### 场景4: 普通员工查询(本人权限)

**用户信息:**
- 角色: 普通员工(employee)
- 用户名: zhangsan
- 数据权限: 本人(ds_type=4)

**执行查询:**
```java
GET /oa/leave/list
```

**生成的SQL:**
```sql
SELECT * FROM oa_leave_request 
WHERE create_by = 'zhangsan'  -- 只能查看自己创建的数据
ORDER BY create_time DESC
```

**结果:** 只返回该员工自己提交的请假申请

---

## 高级用法

### 1. 手动设置数据权限

在某些特殊场景下,你可能需要手动设置数据权限:

```java
@Service
public class LeaveRequestServiceImpl implements ILeaveRequestService {
    
    @Autowired
    private LeaveRequestMapper leaveRequestMapper;
    
    /**
     * 查询指定部门的请假申请
     * 手动设置数据权限范围
     */
    public List<LeaveRequest> selectByDeptIds(List<Long> deptIds) {
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<>();
        
        // 手动设置数据权限
        wrapper.in(LeaveRequest::getDeptId, deptIds);
        
        return leaveRequestMapper.selectList(wrapper);
    }
}
```

### 2. 跳过数据权限检查

在某些管理功能中,可能需要跳过数据权限检查:

```java
@Service
public class LeaveRequestServiceImpl implements ILeaveRequestService {
    
    @Autowired
    private LeaveRequestMapper leaveRequestMapper;
    
    /**
     * 统计所有请假申请(跳过数据权限)
     * 注意: 此方法应该有严格的权限控制
     */
    @PreAuthorize("hasRole('ADMIN')")
    public long countAll() {
        // 使用原生MyBatis-Plus方法,不经过数据权限拦截器
        return leaveRequestMapper.selectCount(null);
    }
}
```

### 3. 动态数据权限

根据业务逻辑动态调整数据权限:

```java
@Service
public class LeaveRequestServiceImpl implements ILeaveRequestService {
    
    @Autowired
    private LeaveRequestMapper leaveRequestMapper;
    
    /**
     * 查询待审批的请假申请
     * 审批人可以看到需要自己审批的所有申请
     */
    public List<LeaveRequest> selectPendingForApproval() {
        Long userId = UserContext.getUserId();
        
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(LeaveRequest::getStatus, "PENDING");
        
        // 根据业务规则,部门经理可以审批本部门的申请
        // 数据权限会自动应用,只返回有权限查看的数据
        
        return leaveRequestMapper.selectList(wrapper);
    }
}
```

---

## 注意事项

1. **Mapper继承**: 必须继承 `CloudFlowBaseMapper` 而不是 `BaseMapper`
2. **字段命名**: 业务表必须包含 `dept_id` 和 `create_by` 字段
3. **性能考虑**: 数据权限会在SQL中添加额外的WHERE条件,建议在相关字段上建立索引
4. **权限配置**: 确保角色的 `ds_type` 和 `ds_scope` 字段配置正确
5. **测试验证**: 在生产环境使用前,务必充分测试各种数据权限场景

---

## 故障排查

### 问题1: 数据权限不生效

**症状:** 查询返回了不应该看到的数据

**排查步骤:**
1. 检查Mapper是否继承了 `CloudFlowBaseMapper`
2. 检查 `DataScopeConfiguration` 是否正确配置
3. 检查用户角色的 `ds_type` 字段是否正确设置
4. 查看SQL日志,确认是否添加了数据权限条件

### 问题2: 查询返回空结果

**症状:** 明明有数据,但查询返回空

**排查步骤:**
1. 检查用户的 `dept_id` 是否正确
2. 检查角色的 `ds_scope` 配置是否正确
3. 检查业务表的 `dept_id` 和 `create_by` 字段是否有值
4. 使用管理员账号测试,确认数据确实存在

### 问题3: 性能问题

**症状:** 查询速度慢

**解决方案:**
1. 在 `dept_id` 和 `create_by` 字段上建立索引
2. 对于大数据量场景,考虑使用分页查询
3. 优化数据权限的实现逻辑,减少不必要的子查询

---

## 总结

通过以上示例,你应该能够:
1. 理解数据权限系统的工作原理
2. 在实际业务中正确使用数据权限
3. 根据不同的业务场景配置合适的数据权限类型
4. 处理常见的数据权限问题

如有疑问,请参考:
- `DATASCOPE_README.md` - 系统设计文档
- `DATASCOPE_INTEGRATION_GUIDE.md` - 集成指南
