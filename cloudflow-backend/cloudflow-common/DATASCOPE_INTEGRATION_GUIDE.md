# DataScope数据权限系统集成指南

本文档详细说明如何完成DataScope数据权限系统的完整集成。

## 当前状态

已完成的核心组件:
- ✅ 数据库结构(sys_role表添加ds_type和ds_scope字段)
- ✅ 所有核心Java类(枚举、DataScope、拦截器、处理器、BaseMapper)
- ✅ MyBatis配置已集成到MybatisPlusConfig中
- ✅ 完整使用文档

## 配置说明

数据权限拦截器已集成到`MybatisPlusConfig`中,会自动检测并注册`DataScopeHandle`实现:

```java
@Configuration
public class MybatisPlusConfig {
    
    @Autowired(required = false)
    private DataScopeHandle dataScopeHandle;
    
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        
        // 多租户插件
        interceptor.addInnerInterceptor(new TenantLineInnerInterceptor(...));
        
        // 数据权限插件 (如果存在DataScopeHandle实现)
        if (dataScopeHandle != null) {
            interceptor.addInnerInterceptor(new DataScopeInnerInterceptor(dataScopeHandle));
        }
        
        // 分页插件
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
```

**注意**: 
- 数据权限拦截器会在多租户插件之后、分页插件之前执行
- 如果Spring容器中没有`DataScopeHandle`实现,拦截器不会被注册
- 在cloudflow-auth模块中已提供完整的`AuthDataScopeHandleImpl`实现

## 待完成工作

### 第一步: 完善CloudFlowDefaultDataScopeHandle

CloudFlowDefaultDataScopeHandle目前有3个TODO方法需要实现:

#### 1.1 实现getUserDataScopeType()方法

需要查询用户角色的ds_type字段。由于CloudFlow项目中角色和用户的关联关系,需要:

```java
@Autowired
private ISysUserService userService;

@Autowired
private ISysRoleService roleService;

private Integer getUserDataScopeType(Long userId) {
    // 方案1: 如果UserContext中已经包含角色信息
    // 可以直接从UserContext获取
    
    // 方案2: 查询用户角色关联表
    // 1. 查询用户的所有角色ID
    // 2. 查询这些角色的ds_type
    // 3. 如果用户有多个角色,取权限最大的(数值最小的)
    
    // 示例实现:
    List<SysRole> roles = roleService.selectRolesByUserId(userId);
    if (roles != null && !roles.isEmpty()) {
        return roles.stream()
            .map(SysRole::getDsType)
            .filter(Objects::nonNull)
            .min(Integer::compareTo)
            .orElse(null);
    }
    return null;
}
```

**注意**: 需要在ISysRoleService中添加selectRolesByUserId方法。

#### 1.2 实现getUserDsScope()方法

查询用户角色的自定义权限范围:

```java
private String getUserDsScope() {
    Long userId = UserContext.getUserId();
    List<SysRole> roles = roleService.selectRolesByUserId(userId);
    if (roles != null && !roles.isEmpty()) {
        return roles.stream()
            .map(SysRole::getDsScope)
            .filter(Objects::nonNull)
            .filter(s -> !s.trim().isEmpty())
            .collect(Collectors.joining(","));
    }
    return null;
}
```

#### 1.3 实现getDescendantDeptIds()方法

查询指定部门的所有下级部门ID列表:

```java
@Autowired
private ISysDeptService deptService;

private List<Long> getDescendantDeptIds(Long deptId) {
    // 通过ancestors字段快速查询所有下级部门
    // ancestors字段格式: "0,100,101"
    // 查询ancestors包含当前部门ID的所有部门
    
    List<SysDept> allDepts = deptService.selectDeptList(new SysDept());
    return allDepts.stream()
        .filter(dept -> dept.getAncestors() != null && 
                        dept.getAncestors().contains("," + deptId + ","))
        .map(SysDept::getDeptId)
        .collect(Collectors.toList());
}
```

**注意**: 需要确保ISysDeptService中有selectDeptList方法。

### 第二步: 在OA模块应用数据权限

#### 2.1 公告管理(SysAnnouncement)

**修改Mapper接口**:

```java
public interface SysAnnouncementMapper extends CloudFlowBaseMapper<SysAnnouncement> {
    // 继承了selectPageByScope、selectListByScope等方法
}
```

**修改Mapper XML**:

```xml
<!-- 添加数据权限查询方法 -->
<select id="selectPageByScope" resultType="com.cloudflow.oa.domain.SysAnnouncement">
    SELECT * FROM sys_announcement 
    WHERE del_flag = '0'
    ORDER BY create_time DESC
</select>

<select id="selectListByScope" resultType="com.cloudflow.oa.domain.SysAnnouncement">
    SELECT * FROM sys_announcement 
    WHERE del_flag = '0'
    ORDER BY create_time DESC
</select>

<select id="selectCountByScope" resultType="java.lang.Long">
    SELECT COUNT(*) FROM sys_announcement 
    WHERE del_flag = '0'
</select>
```

**修改Service实现**:

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
        scope.setScopeDeptName("dept_id");      // 公告表的部门字段
        scope.setScopeUserName("create_by");    // 公告表的创建人字段
        
        // 系统会自动根据用户权限过滤
        return announcementMapper.selectPageByScope(page, scope);
    }
}
```

#### 2.2 考勤管理(SysAttendance)

类似公告管理的实现方式:

```java
@Service
public class AttendanceServiceImpl implements IAttendanceService {
    
    @Autowired
    private SysAttendanceMapper attendanceMapper;
    
    @Override
    public IPage<SysAttendance> listAttendance(Page<SysAttendance> page) {
        DataScope scope = new DataScope();
        scope.setScopeDeptName("dept_id");
        scope.setScopeUserName("user_id");  // 考勤记录的用户字段
        
        return attendanceMapper.selectPageByScope(page, scope);
    }
}
```

#### 2.3 会议室预订(MeetingRoom)

```java
@Service
public class MeetingRoomServiceImpl implements IMeetingRoomService {
    
    @Autowired
    private MeetingRoomMapper meetingRoomMapper;
    
    @Override
    public IPage<MeetingRoom> listBookings(Page<MeetingRoom> page) {
        DataScope scope = new DataScope();
        scope.setScopeDeptName("dept_id");
        scope.setScopeUserName("create_by");
        
        return meetingRoomMapper.selectPageByScope(page, scope);
    }
}
```

### 第三步: 在工作流模块应用数据权限

#### 3.1 流程实例查询

```java
@Service
public class WorkflowServiceImpl implements IWorkflowService {
    
    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;
    
    @Override
    public IPage<WfProcessInstance> listProcessInstances(Page<WfProcessInstance> page) {
        DataScope scope = new DataScope();
        scope.setScopeDeptName("dept_id");
        scope.setScopeUserName("start_user_id");  // 流程发起人
        
        return processInstanceMapper.selectPageByScope(page, scope);
    }
}
```

#### 3.2 任务列表查询

```java
@Service
public class TaskServiceImpl implements ITaskService {
    
    @Autowired
    private WfTaskMapper taskMapper;
    
    @Override
    public IPage<WfTask> listTasks(Page<WfTask> page) {
        DataScope scope = new DataScope();
        scope.setScopeDeptName("dept_id");
        scope.setScopeUserName("assignee");  // 任务处理人
        
        return taskMapper.selectPageByScope(page, scope);
    }
}
```

## 实施步骤总结

1. **完善CloudFlowDefaultDataScopeHandle**
   - 在ISysRoleService中添加selectRolesByUserId方法
   - 创建ISysDeptService接口(如果不存在)
   - 实现3个TODO方法

2. **在OA模块应用**
   - 修改Mapper接口继承CloudFlowBaseMapper
   - 在Mapper XML中添加selectPageByScope等方法
   - 在Service层使用DataScope

3. **在工作流模块应用**
   - 同样的方式修改Mapper和Service

4. **测试验证**
   - 使用不同角色的用户登录
   - 验证数据权限过滤是否正确
   - 检查SQL日志确认权限条件已添加

## 注意事项

1. **字段名配置**: 确保DataScope中配置的字段名与实际表结构一致
2. **性能优化**: 在dept_id和create_by字段上建立索引
3. **跳过权限**: 某些管理员操作可能需要跳过权限检查,使用`scope.setSkip(true)`
4. **手动设置**: 可以在Service层手动设置部门列表,覆盖自动计算的权限

## 测试场景

1. **管理员用户**: 应该能看到所有数据
2. **部门经理**: 应该能看到本部门及下级部门的数据
3. **普通员工**: 应该只能看到自己创建的数据
4. **财务专员**: 应该只能看到本部门的数据

## 故障排查

如果数据权限不生效:
1. 检查DataScopeConfiguration是否被Spring扫描到
2. 检查CloudFlowDefaultDataScopeHandle的TODO方法是否已实现
3. 检查Mapper是否正确继承CloudFlowBaseMapper
4. 检查Service层是否正确构建DataScope对象
5. 查看SQL日志,确认权限条件是否已添加

## 参考资料

- DataScope核心类: `cloudflow-common/src/main/java/com/cloudflow/common/datascope/`
- 使用文档: `cloudflow-common/DATASCOPE_README.md`
- 数据库脚本: `DB/01.cloudflow-common.sql`
