# DataScope 数据权限系统使用文档

## 概述

DataScope是一个基于MyBatis-Plus的数据权限控制系统,支持多级权限传递,可以自动在SQL查询中添加数据权限过滤条件。

## 已完成的组件

### 1. 数据库结构

在`DB/01.cloudflow-common.sql`中,sys_role表已添加数据权限字段:

```sql
ds_type INT(1) DEFAULT 1 COMMENT '数据权限类型（0全部 1自定义 2本级及下级 3本级 4本人）'
ds_scope VARCHAR(500) DEFAULT NULL COMMENT '自定义数据权限（部门ID列表，逗号分隔）'
```

### 2. 核心Java类

位于`cloudflow-common/src/main/java/com/cloudflow/common/datascope/`:

- **DataScopeTypeEnum** - 数据权限类型枚举
- **DataScopeFuncEnum** - SQL函数类型枚举
- **DataScope** - 数据权限参数核心类
- **DataScopeInterceptor** - MyBatis拦截器接口
- **DataScopeInnerInterceptor** - MyBatis拦截器实现
- **DataScopeHandle** - 权限处理器接口
- **CloudFlowDefaultDataScopeHandle** - 默认权限处理器实现
- **CloudFlowBaseMapper** - 扩展的BaseMapper接口

## 数据权限类型

| 类型 | 值 | 说明 | 使用场景 |
|------|---|------|---------|
| ALL | 0 | 全部数据 | 管理员角色,查看所有数据 |
| CUSTOM | 1 | 自定义 | 指定特定部门ID列表 |
| OWN_CHILD_LEVEL | 2 | 本级及下级 | 部门经理,查看本部门及所有下级部门数据 |
| OWN_LEVEL | 3 | 本级 | 查看本部门数据 |
| SELF_LEVEL | 4 | 本人 | 普通员工,仅查看个人创建的数据 |

## 待完成工作

### 1. 完善CloudFlowDefaultDataScopeHandle

需要注入实际的Service来查询数据库:

```java
@Autowired
private ISysRoleService roleService;

@Autowired
private ISysDeptService deptService;

// 实现getUserDataScopeType方法
private Integer getUserDataScopeType(Long userId) {
    List<SysRole> roles = roleService.getRolesByUserId(userId);
    if (roles != null && !roles.isEmpty()) {
        // 如果用户有多个角色,取权限最大的(数值最小的)
        return roles.stream()
            .map(SysRole::getDsType)
            .min(Integer::compareTo)
            .orElse(null);
    }
    return null;
}

// 实现getDescendantDeptIds方法
private List<Long> getDescendantDeptIds(Long deptId) {
    return deptService.selectDeptList(new SysDept())
        .stream()
        .filter(dept -> dept.getAncestors() != null && 
                        dept.getAncestors().contains("," + deptId + ","))
        .map(SysDept::getDeptId)
        .collect(Collectors.toList());
}
```

### 2. 创建MyBatis配置类

创建`DataScopeConfiguration.java`:

```java
@Configuration
public class DataScopeConfiguration {
    
    @Autowired
    private CloudFlowDefaultDataScopeHandle dataScopeHandle;
    
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        
        // 添加数据权限拦截器
        DataScopeInnerInterceptor dataScopeInterceptor = new DataScopeInnerInterceptor();
        dataScopeInterceptor.setDataScopeHandle(dataScopeHandle);
        interceptor.addInnerInterceptor(dataScopeInterceptor);
        
        // 添加分页拦截器
        PaginationInnerInterceptor paginationInterceptor = new PaginationInnerInterceptor();
        paginationInterceptor.setDbType(DbType.MYSQL);
        interceptor.addInnerInterceptor(paginationInterceptor);
        
        return interceptor;
    }
}
```

### 3. 在Mapper中使用

#### 方式一: 使用CloudFlowBaseMapper

```java
public interface SysAnnouncementMapper extends CloudFlowBaseMapper<SysAnnouncement> {
    // 继承了selectPageByScope、selectListByScope等方法
}
```

对应的XML:

```xml
<select id="selectPageByScope" resultType="com.cloudflow.oa.domain.SysAnnouncement">
    SELECT * FROM sys_announcement WHERE del_flag = '0'
</select>

<select id="selectListByScope" resultType="com.cloudflow.oa.domain.SysAnnouncement">
    SELECT * FROM sys_announcement WHERE del_flag = '0'
</select>
```

#### 方式二: 在现有Mapper方法中传入DataScope参数

```java
public interface SysAnnouncementMapper extends BaseMapper<SysAnnouncement> {
    IPage<SysAnnouncement> selectAnnouncementPage(
        Page<SysAnnouncement> page,
        @Param("ew") Wrapper<SysAnnouncement> wrapper,
        @Param("dataScope") DataScope dataScope
    );
}
```

### 4. 在Service层使用

```java
@Service
public class SysAnnouncementServiceImpl implements ISysAnnouncementService {
    
    @Autowired
    private SysAnnouncementMapper announcementMapper;
    
    @Override
    public IPage<SysAnnouncement> listAnnouncements(Page<SysAnnouncement> page) {
        // 构建DataScope
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        scope.setScopeDeptName("dept_id");      // 指定部门字段名
        scope.setScopeUserName("create_by");    // 指定创建人字段名
        
        // 查询,系统会自动根据用户权限过滤
        return announcementMapper.selectPageByScope(page, scope);
    }
}
```

## 工作原理

1. **Service层构建DataScope对象**,指定部门字段和用户字段名
2. **权限处理器计算权限范围**:
   - 从UserContext获取当前用户信息
   - 查询用户角色的ds_type
   - 根据权限类型计算可访问的部门ID列表
3. **MyBatis拦截器改写SQL**:
   - 拦截查询操作
   - 在原始SQL外包装一层,添加WHERE条件
   - 根据部门ID列表或用户名过滤数据

## SQL改写示例

原始SQL:
```sql
SELECT * FROM sys_announcement WHERE del_flag = '0'
```

改写后(本级及下级权限,假设用户部门ID为101,下级部门为106,107):
```sql
SELECT * FROM (
    SELECT * FROM sys_announcement WHERE del_flag = '0'
) temp_data_scope 
WHERE temp_data_scope.dept_id IN (101, 106, 107)
```

改写后(本人权限):
```sql
SELECT * FROM (
    SELECT * FROM sys_announcement WHERE del_flag = '0'
) temp_data_scope 
WHERE temp_data_scope.create_by = 'zhangsan'
```

## 注意事项

1. **字段名配置**: 确保DataScope中配置的字段名与实际表结构一致
2. **性能考虑**: 对于大数据量查询,建议在dept_id和create_by字段上建立索引
3. **跳过权限**: 如果某些查询不需要权限过滤,可以设置`dataScope.setSkip(true)`
4. **手动设置**: 可以在Service层手动设置部门列表或用户名,覆盖自动计算的权限

## 下一步

1. 完善CloudFlowDefaultDataScopeHandle,注入实际的RoleService和DeptService
2. 创建DataScopeConfiguration配置类
3. 在OA模块的公告、考勤等功能中应用数据权限
4. 在工作流模块的流程实例查询中应用数据权限
5. 进行完整的功能测试和性能测试

## 参考

本实现参考了API-release项目的DataScope设计,并针对CloudFlow项目进行了适配。
