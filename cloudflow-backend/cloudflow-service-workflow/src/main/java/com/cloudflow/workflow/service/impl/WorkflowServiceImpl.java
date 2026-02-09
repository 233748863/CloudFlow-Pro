package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.IWorkflowService;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.domain.system.SysDept;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.SimpleEvaluationContext;

import com.cloudflow.common.core.utils.RedisCache;

import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import java.util.concurrent.TimeUnit;

import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;

import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.service.RateLimiterService;
import com.cloudflow.workflow.service.WorkflowAuditService;
import com.cloudflow.workflow.service.IReplayAttackPreventionService;
import com.cloudflow.workflow.service.IWorkflowSagaService;
import com.cloudflow.workflow.service.IWorkflowHealthCheckService;
import com.cloudflow.workflow.service.ICountersignService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.domain.WfProcessSnapshot;
import com.cloudflow.workflow.mapper.WfProcessSnapshotMapper;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.retry.annotation.Retryable;
import org.springframework.retry.annotation.Backoff;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class WorkflowServiceImpl implements IWorkflowService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowServiceImpl.class);

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfTaskHistoryMapper taskHistoryMapper;

    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;

    @Autowired
    private WfFormDefinitionMapper formDefinitionMapper;
    
    @Autowired
    private SysUserMapper sysUserMapper;
    
    @Autowired
    private SysRoleMapper sysRoleMapper;
    
    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;
    
    @Autowired
    private SysDeptMapper sysDeptMapper;

    @Autowired
    private com.cloudflow.workflow.service.ISysNoticeService sysNoticeService;

    @Autowired
    private com.cloudflow.workflow.mapper.WfTaskReadMapper taskReadMapper;
    
    @Autowired
    private com.cloudflow.workflow.mapper.WfTaskUrgeMapper taskUrgeMapper;

    /** P0: 权限校验服务 */
    @Autowired
    private WorkflowPermissionService permissionService;

    /** P0: 限流服务 */
    @Autowired
    private RateLimiterService rateLimiterService;

    /** S.3: 审计日志服务 */
    @Autowired
    private WorkflowAuditService auditService;

    /** P3: JSON Schema 验证器 */
    @Autowired
    private JsonSchemaValidator jsonSchemaValidator;

    /** P3: 安全工具类 */
    @Autowired
    private WorkflowSecurityUtils securityUtils;

    /** S.4: 防重放攻击服务 */
    @Autowired
    private IReplayAttackPreventionService replayAttackPrevention;

    /** G.2: Saga 补偿服务 */
    @Autowired
    private IWorkflowSagaService sagaService;

    /** R.5: 健康检查服务 */
    @Autowired
    private IWorkflowHealthCheckService healthCheckService;

    /** 9.C: 流程实例快照 Mapper */
    @Autowired
    private WfProcessSnapshotMapper snapshotMapper;

    /** 5.I: 会签服务 */
    @Autowired
    private ICountersignService countersignService;

    /** P1-6: 异步流程启动服务 */
    @Autowired
    private com.cloudflow.workflow.service.AsyncWorkflowService asyncWorkflowService;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private final ExpressionParser parser = new SpelExpressionParser();

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "processDefinition", allEntries = true)
    public R<?> saveProcessDefinition(WfProcessDefinition definition) {
        log.info("[saveProcessDefinition] 开始保存流程定义, processKey={}", definition.getProcessKey());
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(definition.getProcessKey())) {
            throw WorkflowException.validationError("流程Key不能为空");
        }
        if (!StringUtils.hasText(definition.getProcessName())) {
            throw WorkflowException.validationError("流程名称不能为空");
        }
        
        // S.6: XSS 防护 - 清理用户输入
        definition.setProcessName(securityUtils.sanitizeXss(definition.getProcessName()));
        
        // 1.A: 流程定义 JSON 结构校验
        if (StringUtils.hasText(definition.getModelJson())) {
            jsonSchemaValidator.validateProcessDefinitionJson(definition.getModelJson());
        }
        
        // P0-2: 权限校验 - 仅管理员可操作流程定义
        permissionService.checkDefinitionPermission("保存");
        
        // 查找当前Key的最大版本
        WfProcessDefinition lastDef = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, definition.getProcessKey())
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );

        // 1.B: 并发编辑冲突检测（乐观锁）
        if (lastDef != null && definition.getVersionLock() != null) {
            if (!definition.getVersionLock().equals(lastDef.getVersionLock())) {
                throw WorkflowException.invalidState("流程定义已被其他用户修改，请刷新后重试");
            }
        }

        int version = 1;
        if (lastDef != null) {
            version = lastDef.getVersion() + 1;
            // 12.A: 将旧版本标记为非最新
            lastDef.setIsLatest(0);
            processDefinitionMapper.updateById(lastDef);
        }

        definition.setDefinitionId(UUID.randomUUID().toString());
        definition.setVersion(version);
        definition.setVersionLock(0); // 1.B: 初始化乐观锁版本号
        definition.setIsLatest(1); // 12.A: 标记为最新版本
        definition.setStatus("DRAFT"); // 默认为草稿状态
        definition.setCreateTime(new Date());
        
        processDefinitionMapper.insert(definition);
        log.info("[saveProcessDefinition] 流程定义保存成功, definitionId={}, version={}", definition.getDefinitionId(), version);
        auditService.log(WorkflowAuditService.AuditAction.DEFINITION_CREATE, definition.getDefinitionId(), 
            "processKey=" + definition.getProcessKey() + ", version=" + version);
        return R.ok(definition.getDefinitionId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "processDefinition", allEntries = true)
    public R<?> deployProcessDefinition(String definitionId) {
        log.info("[deployProcessDefinition] 开始发布流程定义, definitionId={}", definitionId);
        
        // P0-2: 权限校验
        permissionService.checkDefinitionPermission("发布");
        
        WfProcessDefinition def = processDefinitionMapper.selectById(definitionId);
        if (def == null) {
            throw WorkflowException.processNotFound(definitionId);
        }
        
        // P0-4: 状态校验
        if ("PUBLISHED".equals(def.getStatus())) {
            throw WorkflowException.invalidState("流程定义已发布，无需重复发布");
        }
        
        // 2.C: 发布前完整性检查 - 验证流程定义 JSON 结构
        if (StringUtils.hasText(def.getModelJson())) {
            jsonSchemaValidator.validateProcessDefinitionJson(def.getModelJson());
        } else {
            throw WorkflowException.validationError("流程定义模型为空，无法发布");
        }
        
        // Update status to PUBLISHED
        def.setStatus("PUBLISHED");
        def.setVersionLock(def.getVersionLock() != null ? def.getVersionLock() + 1 : 1); // 1.B: 更新乐观锁
        processDefinitionMapper.updateById(def);
        
        // 2.A: 旧版本处理策略 - 将同 processKey 的旧版本归档
        processDefinitionMapper.update(null,
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, def.getProcessKey())
                .ne(WfProcessDefinition::getDefinitionId, definitionId)
                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                .set(WfProcessDefinition::getStatus, "ARCHIVED")
        );
        
        log.info("[deployProcessDefinition] 流程定义发布成功, definitionId={}, processKey={}", definitionId, def.getProcessKey());
        auditService.log(WorkflowAuditService.AuditAction.DEFINITION_DEPLOY, definitionId, 
            "processKey=" + def.getProcessKey());
        return R.ok();
    }
    
    /**
     * 1.F: 流程定义删除保护
     * 检查流程定义是否被引用，已使用的流程不能删除
     */
    public R<?> deleteProcessDefinition(String definitionId) {
        log.info("[deleteProcessDefinition] 开始删除流程定义, definitionId={}", definitionId);
        
        permissionService.checkDefinitionPermission("删除");
        
        WfProcessDefinition def = processDefinitionMapper.selectById(definitionId);
        if (def == null) {
            throw WorkflowException.processNotFound(definitionId);
        }
        
        // 1.F: 检查是否有运行中的实例引用此流程定义
        Long runningCount = processInstanceMapper.selectCount(
            new LambdaQueryWrapper<WfProcessInstance>()
                .eq(WfProcessInstance::getProcessDefKey, def.getProcessKey())
                .eq(WfProcessInstance::getStatus, WfProcessStatus.RUNNING.getCode())
        );
        
        if (runningCount != null && runningCount > 0) {
            throw WorkflowException.invalidState("该流程定义有 " + runningCount + " 个运行中的实例，无法删除");
        }
        
        // 检查是否有历史实例
        Long totalCount = processInstanceMapper.selectCount(
            new LambdaQueryWrapper<WfProcessInstance>()
                .eq(WfProcessInstance::getProcessDefKey, def.getProcessKey())
        );
        
        if (totalCount != null && totalCount > 0) {
            // 有历史实例，只能归档不能删除
            def.setStatus("ARCHIVED");
            processDefinitionMapper.updateById(def);
            log.info("[deleteProcessDefinition] 流程定义已归档（有历史实例）, definitionId={}", definitionId);
            return R.ok("流程定义已归档（存在历史实例，无法物理删除）");
        }
        
        processDefinitionMapper.deleteById(definitionId);
        log.info("[deleteProcessDefinition] 流程定义已删除, definitionId={}", definitionId);
        auditService.log(WorkflowAuditService.AuditAction.DEFINITION_CREATE, definitionId, "DELETE");
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "formDefinition", allEntries = true)
    public R<?> saveFormDefinition(WfFormDefinition definition) {
        log.info("[saveFormDefinition] 开始保存表单定义, formId={}", definition.getFormId());
        
        // P0-2: 权限校验
        permissionService.checkDefinitionPermission("保存表单");
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(definition.getFormName())) {
            throw WorkflowException.validationError("表单名称不能为空");
        }
        
        // S.6: XSS 防护
        definition.setFormName(securityUtils.sanitizeXss(definition.getFormName()));
        
        // 3.A/3.B: 表单 Schema 验证和字段 ID 唯一性检查
        if (StringUtils.hasText(definition.getFormSchema())) {
            jsonSchemaValidator.validateFormSchema(definition.getFormSchema());
        }
        
        if (!StringUtils.hasText(definition.getFormId())) {
            definition.setFormId(UUID.randomUUID().toString());
        }
        
        WfFormDefinition exist = formDefinitionMapper.selectById(definition.getFormId());
        if (exist != null) {
            // 3.E: 并发编辑冲突检测（乐观锁）
            if (definition.getVersionLock() != null && !definition.getVersionLock().equals(exist.getVersionLock())) {
                throw WorkflowException.invalidState("表单定义已被其他用户修改，请刷新后重试");
            }
            
            definition.setVersion(exist.getVersion() + 1);
            definition.setVersionLock(exist.getVersionLock() != null ? exist.getVersionLock() + 1 : 1);
            definition.setIsLatest(1); // 14.C: 标记为最新版本
            formDefinitionMapper.updateById(definition);
            log.info("[saveFormDefinition] 表单定义更新成功, formId={}, version={}", definition.getFormId(), definition.getVersion());
        } else {
            definition.setVersion(1);
            definition.setVersionLock(0);
            definition.setIsLatest(1); // 14.C: 标记为最新版本
            definition.setCreateTime(new Date());
            formDefinitionMapper.insert(definition);
            log.info("[saveFormDefinition] 表单定义创建成功, formId={}", definition.getFormId());
        }
        return R.ok(definition.getFormId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> startProcess(String processDefKey, String businessKey, Map<String, Object> variables) {
        Long userId = UserContext.getUserId();
        String userName = UserContext.getUserName();
        log.info("[startProcess] 开始启动流程, processDefKey={}, businessKey={}, userId={}", processDefKey, businessKey, userId);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(processDefKey)) {
            throw WorkflowException.validationError("流程定义Key不能为空");
        }
        if (variables == null) {
            variables = new HashMap<>();
        }
        
        // P0-5: 限流检查
        rateLimiterService.checkStartProcessLimit(userId != null ? userId : 0L);
        
        // S.4: 防重放攻击
        String nonce = (String) variables.get("_nonce");
        if (StringUtils.hasText(nonce) && !replayAttackPrevention.checkAndRegisterNonce(nonce)) {
            throw WorkflowException.validationError("检测到重复提交，请勿重复操作");
        }
        
        // S.6: XSS 过滤用户输入变量
        variables = securityUtils.sanitizeMapXss(variables);
        
        // 4.F: 流程实例去重（幂等Key防重）
        String idempotentKey = (String) variables.get("_idempotentKey");
        if (StringUtils.hasText(idempotentKey)) {
            String existingInstanceId = redisCache.getCacheObject("sys:wf:idempotent:" + idempotentKey);
            if (existingInstanceId != null) {
                log.info("[startProcess] 幂等Key命中, 返回已存在的实例, idempotentKey={}, instanceId={}", idempotentKey, existingInstanceId);
                return R.ok(existingInstanceId);
            }
        }
        
        // P0-4: 变量大小限制（防止超大 payload）
        try {
            String varsJson = objectMapper.writeValueAsString(variables);
            if (varsJson.length() > 65536) { // 64KB 限制
                throw WorkflowException.validationError("流程变量数据过大，请精简后重试");
            }
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[startProcess] 变量序列化检查失败: {}", e.getMessage());
        }
        
        // 1. 查询流程定义（优先查已发布的最新版本）
        WfProcessDefinition def = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, processDefKey)
                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );

        if (def == null) {
            throw WorkflowException.processNotFound(processDefKey);
        }
        
        // 4.D: businessKey 唯一性约束检查
        if (StringUtils.hasText(businessKey)) {
            Long existCount = processInstanceMapper.selectCount(
                new LambdaQueryWrapper<WfProcessInstance>()
                    .eq(WfProcessInstance::getProcessDefKey, processDefKey)
                    .eq(WfProcessInstance::getBusinessKey, businessKey)
            );
            if (existCount != null && existCount > 0) {
                throw WorkflowException.validationError("该业务已存在流程实例，不能重复启动");
            }
        }
        
        // 4.C: 启动权限校验（按角色/部门限制）
        checkStartPermission(userId, def);

        // 2. 创建流程实例
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId(UUID.randomUUID().toString());
        instance.setProcessDefKey(processDefKey);
        instance.setDefinitionId(def.getDefinitionId()); // 4.I: 流程定义版本锁定
        instance.setBusinessKey(businessKey);
        instance.setTitle((String) variables.getOrDefault("title", def.getProcessName()));
        
        instance.setStartUserId(userId != null ? userId : 1L);
        instance.setStartUserName(userName != null ? userName : "admin");
        instance.setStatus(WfProcessStatus.RUNNING.getCode());
        instance.setStartTime(new Date());
        
        // P0-4: 安全序列化变量
        try {
            instance.setVariables(objectMapper.writeValueAsString(variables));
        } catch (Exception e) {
            log.error("[startProcess] 变量序列化失败: {}", e.getMessage());
            instance.setVariables("{}");
        }

        processInstanceMapper.insert(instance);
        log.info("[startProcess] 流程实例创建成功, instanceId={}", instance.getInstanceId());

        // 3. 解析模型并启动
        // P1-6: 支持异步启动模式
        boolean asyncMode = variables.containsKey("_async") && Boolean.TRUE.equals(variables.get("_async"));
        
        try {
            if (!StringUtils.hasText(def.getModelJson())) {
                log.info("[startProcess] 使用 Legacy 模式启动流程");
                return startLegacyProcess(instance, variables);
            }

            if (asyncMode) {
                // P1-6: 异步模式 - 同步返回实例ID，异步执行节点解析和任务创建
                final Map<String, Object> finalVars = variables;
                asyncWorkflowService.asyncStartProcessNodes(instance, def, finalVars,
                    (inst, node, vars, depth, root) -> runNode(inst, node, vars, depth, root));
                log.info("[startProcess] 异步启动模式, instanceId={}", instance.getInstanceId());
            } else {
                // 同步模式 - 原有逻辑
                WfNodeConfig rootNode = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
                WfNodeConfig nextNode = rootNode.getNext();
                // 4.K: 将根节点作为参数传递，避免 runNode 中重复加载定义
                runNode(instance, nextNode, variables, 0, rootNode);
            }
            
        } catch (WorkflowException e) {
            // G.2: Saga 补偿 - 流程启动失败时回滚
            sagaService.compensate(instance.getInstanceId(), e.getMessage());
            throw e;
        } catch (Exception e) {
            // G.2: Saga 补偿
            sagaService.compensate(instance.getInstanceId(), e.getMessage());
            log.error("[startProcess] 启动流程失败, instanceId={}, error={}", instance.getInstanceId(), e.getMessage(), e);
            throw new WorkflowException("PROCESS_START_FAILED", "启动流程失败: " + e.getMessage(), e);
        }

        // 4.F: 注册幂等Key
        if (StringUtils.hasText(idempotentKey)) {
            try {
                redisCache.setCacheObject("sys:wf:idempotent:" + idempotentKey, instance.getInstanceId(), 5, TimeUnit.MINUTES);
            } catch (Exception e) {
                log.warn("[startProcess] 注册幂等Key失败: {}", e.getMessage());
            }
        }

        log.info("[startProcess] 流程启动成功, instanceId={}", instance.getInstanceId());
        auditService.log(WorkflowAuditService.AuditAction.PROCESS_START, instance.getInstanceId(),
            "processDefKey=" + processDefKey + ", businessKey=" + businessKey);
        return R.ok(instance.getInstanceId());
    }
    
    /**
     * 4.C: 检查用户是否有权限启动指定流程
     * 支持 ALL（所有人）、ROLE（按角色）、DEPT（按部门）、USER（按用户）
     */
    private void checkStartPermission(Long userId, WfProcessDefinition def) {
        String permType = def.getStartPermissionType();
        String permValue = def.getStartPermissionValue();
        
        // 默认 ALL 或空值表示所有人可启动
        if (!StringUtils.hasText(permType) || "ALL".equals(permType)) {
            return;
        }
        
        // 管理员跳过权限检查
        if (permissionService.isAdmin(userId)) {
            return;
        }
        
        if (!StringUtils.hasText(permValue)) {
            return; // 没有配置权限值，默认允许
        }
        
        try {
            List<String> allowedValues = objectMapper.readValue(permValue, List.class);
            
            switch (permType) {
                case "USER":
                    if (!allowedValues.contains(String.valueOf(userId))) {
                        throw new com.cloudflow.workflow.exception.PermissionDeniedException("您没有权限启动此流程");
                    }
                    break;
                case "ROLE":
                    // 查询用户角色
                    List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                        new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getUserId, userId));
                    boolean hasRole = userRoles.stream()
                        .anyMatch(ur -> allowedValues.contains(String.valueOf(ur.getRoleId())));
                    if (!hasRole) {
                        throw new com.cloudflow.workflow.exception.PermissionDeniedException("您的角色没有权限启动此流程");
                    }
                    break;
                case "DEPT":
                    SysUser user = sysUserMapper.selectById(userId);
                    if (user == null || !allowedValues.contains(String.valueOf(user.getDeptId()))) {
                        throw new com.cloudflow.workflow.exception.PermissionDeniedException("您的部门没有权限启动此流程");
                    }
                    break;
                default:
                    break;
            }
        } catch (com.cloudflow.workflow.exception.PermissionDeniedException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[checkStartPermission] 解析启动权限配置失败: {}", e.getMessage());
        }
    }
    
    private R<?> startLegacyProcess(WfProcessInstance instance, Map<String, Object> variables) {
        WfTask task = new WfTask();
        task.setTaskId(UUID.randomUUID().toString());
        task.setInstanceId(instance.getInstanceId());
        task.setNodeName("审批节点");
        task.setNodeKey("node_1");
        if (variables.containsKey("assignee")) {
             task.setAssignee(Long.valueOf(variables.get("assignee").toString()));
        } else {
             task.setAssignee(1L);
        }
        task.setStatus(WfTaskStatus.TODO.getCode());
        task.setCreateTime(new Date());
        taskMapper.insert(task);
        return R.ok(instance.getInstanceId());
    }

    // 递归/链式方法执行节点
    // 增加了深度检查以防止循环流程中的堆栈溢出
    // 4.K: 增加 rootNode 参数，避免每次递归都重新查询数据库
    private void runNode(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables, int depth, WfNodeConfig rootNode) {
        if (depth > 500) {
            throw new RuntimeException("流程深度超出限制（可能检测到循环）");
        }
        
        if (node == null) {
            // 流程结束
            completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
            return;
        }

        // 4.K: 使用传入的 rootNode 参数，不再重复查询数据库
        try {
            if (rootNode != null) {
                 WfNodeConfig gateway = findParentGateway(rootNode, node.getId());
                 
                 if (gateway != null) {
                     // 此节点是 'gateway' 的汇聚节点
                     String joinKey = "sys:wf:join:" + instance.getInstanceId() + ":" + gateway.getId();
                     RLock joinLock = redissonClient.getLock("lock:join:" + gateway.getId());
                     
                     try {
                         if (joinLock.tryLock(5, 10, TimeUnit.SECONDS)) {
                             long count = redisCache.increment(joinKey);
                             // 设置过期时间以避免垃圾数据（仅在第一次时设置）
                             if (count == 1) {
                                 redisCache.expire(joinKey, 1, TimeUnit.HOURS);
                             }
                             
                             int totalBranches = gateway.getBranches() != null ? gateway.getBranches().size() : 0;
                             
                             if (count < totalBranches) {
                                 // 等待其他分支
                                 return;
                             }
                             // 所有分支已到达，继续（并清除 key）
                             redisCache.deleteObject(joinKey);
                         } else {
                             throw new RuntimeException("获取并行网关锁超时");
                         }
                     } catch (InterruptedException e) {
                         Thread.currentThread().interrupt();
                         throw new RuntimeException("并行网关处理被中断");
                     } finally {
                         if (joinLock.isHeldByCurrentThread()) {
                             joinLock.unlock();
                         }
                     }
                 }
            }
        } catch (Exception e) {
            log.warn("[runNode] 并行汇聚检查异常: {}", e.getMessage());
        }

        if ("APPROVAL".equals(node.getType())) {
            // 5.I: 检查是否为会签节点
            String signType = node.getSignType(); // ALL / ANY / PERCENT
            if (signType != null && !signType.isEmpty()) {
                // 会签模式：为多个审批人创建会签任务
                List<Long> assigneeIds = resolveMultipleAssignees(node, instance);
                if (assigneeIds == null || assigneeIds.isEmpty()) {
                    // 回退到单人审批
                    assigneeIds = new ArrayList<>();
                    Long singleAssignee = resolveAssignee(node, instance);
                    assigneeIds.add(singleAssignee != null ? singleAssignee : 1L);
                }
                
                Integer passPercent = node.getPassPercent();
                countersignService.createCountersignTask(
                    instance.getInstanceId(),
                    node.getId(),
                    node.getTitle(),
                    signType,
                    passPercent,
                    assigneeIds
                );
                
                // 为每个参与人发送通知
                for (Long assigneeId : assigneeIds) {
                    sysNoticeService.sendNotice(
                        assigneeId,
                        "会签任务通知",
                        "您有一个新的会签任务: " + node.getTitle() + " (流程: " + instance.getTitle() + ")",
                        "1",
                        UserContext.getUserId(),
                        UserContext.getUserName()
                    );
                }
                
                log.info("[runNode] 会签任务已创建, nodeKey={}, signType={}, assignees={}", 
                    node.getId(), signType, assigneeIds.size());
                return;
            }
            
            // 普通审批模式：创建单个用户任务
            WfTask task = new WfTask();
            task.setTaskId(UUID.randomUUID().toString());
            task.setInstanceId(instance.getInstanceId());
            task.setNodeName(node.getTitle());
            task.setNodeKey(node.getId()); // 使用节点 ID 作为 Key
            
            // 确定处理人
            Long assigneeId = resolveAssignee(node, instance);
            if (assigneeId != null) {
                task.setAssignee(assigneeId);
            } else {
                // 如果无法解析处理人，回退到管理员或保留未分配（任务池）
                // 对于本项目，默认为管理员
                task.setAssignee(1L);
            }
            
            task.setStatus(WfTaskStatus.TODO.getCode());
            task.setCreateTime(new Date());
            taskMapper.insert(task);
            
            // Send Notification
            sysNoticeService.sendNotice(
                task.getAssignee(), 
                "待办任务通知", 
                "您有一个新的待办任务: " + node.getTitle() + " (流程: " + instance.getTitle() + ")", 
                "1",
                UserContext.getUserId(),
                UserContext.getUserName()
            );
            
            // SLA 超时注册
            if (node.getSlaHours() != null && node.getSlaHours() > 0) {
                long expireTime = System.currentTimeMillis() + node.getSlaHours() * 3600 * 1000L;
                redisCache.setCacheZSet("sys:task:timeouts", task.getTaskId(), (double) expireTime);
            }
            
            // 停止在此处，等待用户操作
            return;

        } else if ("CONDITION".equals(node.getType()) || "GATEWAY".equals(node.getType())) {
            // 排他网关（条件）
            // 检查分支
            List<WfNodeConfig> branches = node.getBranches();
            boolean branchTaken = false;
            if (branches != null && !branches.isEmpty()) {
                for (WfNodeConfig branch : branches) {
                    if (evaluateCondition(branch.getCondition(), variables)) {
                        runNode(instance, branch, variables, depth + 1, rootNode);
                        branchTaken = true;
                        return; // 只走一条路径
                    }
                }
            }
            // 如果没有分支匹配，如果有 next 则继续，或者报错？
            // 惯例：如果没有条件匹配，查找“默认”流或继续 next
            if (!branchTaken) {
                runNode(instance, node.getNext(), variables, depth + 1, rootNode);
            }
            
        } else if ("PARALLEL".equals(node.getType())) {
            // 并行网关
            // 分叉所有分支
             List<WfNodeConfig> branches = node.getBranches();
             if (branches != null) {
                 for (WfNodeConfig branch : branches) {
                     // 为简单起见在同一线程中分叉，但递归执行
                     // 注意：这个简单的引擎尚未正确处理“汇聚”
                     runNode(instance, branch, variables, depth + 1, rootNode);
                 }
             }
             // 并行通常不会立即继续 'next'，它等待汇聚
             // 简化版：不做其他操作
             
        } else if ("END".equals(node.getType())) {
             completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
        } else {
            // 未知或开始节点，直接继续
            runNode(instance, node.getNext(), variables, depth + 1, rootNode);
        }
    }

    private Long resolveAssignee(WfNodeConfig node, WfProcessInstance instance) {
        String type = node.getApproverType();
        String value = node.getApproverValue();
        
        if ("USER".equals(type)) {
            try {
                return Long.valueOf(value);
            } catch (Exception e) { return null; }
        } else if ("ROLE".equals(type)) {
            // Find user by role key
            // 1. Find role id by key
            SysRole role = sysRoleMapper.selectOne(new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, value));
            if (role != null) {
                // 2. Find users with this role
                List<SysUserRole> userRoles = sysUserRoleMapper.selectList(new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, role.getRoleId()));
                if (userRoles != null && !userRoles.isEmpty()) {
                    // Return first one for now, or logic for pool
                    return userRoles.get(0).getUserId();
                }
            }
        } else if ("DEPT_MANAGER".equals(type) || "DIRECT_LEADER".equals(type)) {
             // Find start user's department
             Long startUserId = instance.getStartUserId();
             SysUser startUser = sysUserMapper.selectById(startUserId);
             if (startUser != null && startUser.getDeptId() != null) {
                 SysDept dept = sysDeptMapper.selectById(startUser.getDeptId());
                 if (dept != null) {
                     // In our mock data, leader is 'admin' or 'zhang_san' (username)
                     // Real system should store ID. Let's try to find user by username = leader
                     String leaderUsername = dept.getLeader();
                     if (StringUtils.hasText(leaderUsername)) {
                         SysUser leader = sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getUserName, leaderUsername));
                         if (leader != null) {
                             return leader.getUserId();
                         }
                     }
                 }
             }
        }
        
        return null;
    }

    private boolean evaluateCondition(String condition, Map<String, Object> variables) {
        if (!StringUtils.hasText(condition)) {
            return true; // No condition means always true (or default path)
        }
        try {
            // 4.N: 条件表达式安全性验证
            securityUtils.validateSpelExpression(condition);
            
            // Use SimpleEvaluationContext to prevent SpEL injection attacks
            SimpleEvaluationContext context = SimpleEvaluationContext.forReadOnlyDataBinding().build();
            
            // Add variables to context
            if (variables != null) {
                variables.forEach(context::setVariable);
            }
            
            // Support simple expressions like "#amount > 5000"
            Boolean result = parser.parseExpression(condition).getValue(context, Boolean.class);
            return result != null && result;
        } catch (Exception e) {
            log.warn("[evaluateCondition] 条件表达式求值失败: condition={}, error={}", condition, e.getMessage());
            return false;
        }
    }

    private void completeInstance(WfProcessInstance instance, String status) {
        instance.setStatus(status);
        instance.setEndTime(new Date());
        processInstanceMapper.updateById(instance);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> completeTask(String taskId, String action, String comment, Map<String, Object> variables) {
        Long currentUserId = UserContext.getUserId();
        log.info("[completeTask] 开始处理任务, taskId={}, action={}, userId={}", taskId, action, currentUserId);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (!StringUtils.hasText(action)) {
            throw WorkflowException.validationError("操作类型不能为空");
        }
        
        // P0-5: 限流检查
        rateLimiterService.checkCompleteTaskLimit(currentUserId != null ? currentUserId : 0L);
        
        RLock lock = redissonClient.getLock("lock:task:" + taskId);
        try {
            if (lock.tryLock(5, 10, TimeUnit.SECONDS)) {
                // 1. 查询当前任务
                WfTask task = taskMapper.selectById(taskId);
                if (task == null) {
                    throw WorkflowException.taskNotFound(taskId);
                }
                
                // P0-2: 使用权限服务校验
                permissionService.checkTaskPermission(task);

                // S.6: XSS 过滤审批意见
                if (StringUtils.hasText(comment)) {
                    comment = securityUtils.sanitizeXss(comment);
                }
                
                // 5.I: 会签任务处理
                if (countersignService.isCountersignTask(task)) {
                    return handleCountersignVote(task, taskId, action, comment, variables);
                }
                
                // 2. 保存历史记录
                WfTaskHistory history = new WfTaskHistory();
                history.setHistoryId(UUID.randomUUID().toString());
                history.setTaskId(task.getTaskId());
                history.setInstanceId(task.getInstanceId());
                history.setNodeName(task.getNodeName());
                history.setNodeKey(task.getNodeKey());
                history.setOperatorId(currentUserId);
                history.setOperatorName(UserContext.getUserName());
                history.setComment(comment);
                history.setAction(action);
                history.setCreateTime(new Date());
                
                // 5.H: 计算审批耗时
                if (task.getCreateTime() != null) {
                    long durationSeconds = (System.currentTimeMillis() - task.getCreateTime().getTime()) / 1000;
                    history.setDurationSeconds((int) durationSeconds);
                }
                
                taskHistoryMapper.insert(history);

                // 3. 删除当前任务
                taskMapper.deleteById(taskId);
                log.info("[completeTask] 任务已完成, taskId={}, action={}", taskId, action);
                
                // 15.D: 清理已读数据
                cleanupTaskReadData(taskId);

                // 4. 流程流转
                WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
                
                // 9.C: 保存实例快照
                saveProcessSnapshot(instance, task.getNodeKey(), task.getNodeName());
                
                if ("REJECT".equalsIgnoreCase(action)) {
                    completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                    log.info("[completeTask] 流程被拒绝, instanceId={}", instance.getInstanceId());
                    // 5.F: 通知发起人流程被拒绝
                    notifyInitiator(instance, task.getNodeName(), action, comment);
                    return R.ok();
                }
                
                // 5.G: 变量合并逻辑 - 将审批时传入的变量与实例变量合并
                Map<String, Object> mergedVariables = mergeVariables(instance, variables);
                
                // 记录变量变更到历史
                if (variables != null && !variables.isEmpty()) {
                    try {
                        history.setVariablesChanged(objectMapper.writeValueAsString(variables));
                        taskHistoryMapper.updateById(history);
                    } catch (Exception e) {
                        log.warn("[completeTask] 记录变量变更失败: {}", e.getMessage());
                    }
                }

                // 查找流程定义和当前节点
                WfProcessDefinition def = processDefinitionMapper.selectOne(
                    new LambdaQueryWrapper<WfProcessDefinition>()
                        .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                        .orderByDesc(WfProcessDefinition::getVersion)
                        .last("LIMIT 1")
                );

                try {
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
                        WfNodeConfig nextNode = findNextNode(root, task.getNodeKey());
                        
                        if (nextNode != null) {
                            // 5.G: 使用合并后的变量继续流转
                            // 4.K: 传递 rootNode 参数
                            runNode(instance, nextNode, mergedVariables, 0, root);
                        } else {
                            completeInstance(instance, WfProcessStatus.COMPLETED.getCode()); 
                        }
                    } else {
                         completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
                    }
                } catch (WorkflowException e) {
                    throw e;
                } catch (Exception e) {
                    log.error("[completeTask] 流程流转失败, taskId={}, error={}", taskId, e.getMessage(), e);
                    throw new WorkflowException("TASK_FLOW_FAILED", "流程流转失败: " + e.getMessage(), e);
                }
                
                // 5.F: 通知发起人审批进度
                notifyInitiator(instance, task.getNodeName(), action, comment);
                
                auditService.log(WorkflowAuditService.AuditAction.TASK_COMPLETE, taskId,
                    "action=" + action + ", nodeName=" + task.getNodeName());

                return R.ok();
            } else {
                throw WorkflowException.invalidState("任务处理中，请勿重复提交");
            }
        } catch (WorkflowException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    /**
     * Find the next node to execute after the current node completes.
     * Traverses up the tree to find the nearest "next" node (Join or Sequence).
     */
    private WfNodeConfig findNextNode(WfNodeConfig root, String currentNodeId) {
        java.util.LinkedList<WfNodeConfig> path = new java.util.LinkedList<>();
        if (findPath(root, currentNodeId, path)) {
            // Path found. Iterate from the end (current node) upwards.
            // We are looking for the first node in the ancestry chain (including self) that has a 'next'.
            // Note: In this model, a 'Branch' node itself might not have a 'next', but its parent (Gateway) does.
            // When the last node of a branch finishes, we should look at the Gateway's next.
            
            // path contains: [Root, Node1, Gateway, BranchNode, TaskNode]
            // We iterate in reverse: TaskNode -> BranchNode -> Gateway -> Node1 -> Root
            
            while (!path.isEmpty()) {
                WfNodeConfig node = path.removeLast();
                if (node.getNext() != null) {
                    return node.getNext();
                }
                // If node.next is null, continue to parent (loop again)
            }
        }
        return null;
    }

    private boolean findPath(WfNodeConfig current, String targetId, java.util.LinkedList<WfNodeConfig> path) {
        if (current == null) return false;
        
        path.add(current);
        if (targetId.equals(current.getId())) {
            return true;
        }
        
        // Check next
        if (findPath(current.getNext(), targetId, path)) {
            return true;
        }
        
        // Check branches
        if (current.getBranches() != null) {
            for (WfNodeConfig branch : current.getBranches()) {
                if (findPath(branch, targetId, path)) {
                    return true;
                }
            }
        }
        
        // Not found in this subtree, backtrack
        path.removeLast();
        return false;
    }

    private WfNodeConfig findParentGateway(WfNodeConfig root, String targetNodeId) {
        if (root == null) return null;
        
        // Check if root is a parallel gateway and its next is target
        if ("PARALLEL".equals(root.getType()) && root.getNext() != null && targetNodeId.equals(root.getNext().getId())) {
            return root;
        }
        
        // Recursive check in next
        WfNodeConfig found = findParentGateway(root.getNext(), targetNodeId);
        if (found != null) return found;
        
        // Recursive check in branches
        if (root.getBranches() != null) {
            for (WfNodeConfig branch : root.getBranches()) {
                found = findParentGateway(branch, targetNodeId);
                if (found != null) return found;
            }
        }
        
        return null;
    }

    private WfNodeConfig findNode(WfNodeConfig root, String nodeId) {
        if (root == null) return null;
        if (nodeId.equals(root.getId())) return root;
        
        WfNodeConfig found = findNode(root.getNext(), nodeId);
        if (found != null) return found;
        
        if (root.getBranches() != null) {
            for (WfNodeConfig branch : root.getBranches()) {
                found = findNode(branch, nodeId);
                if (found != null) return found;
            }
        }
        return null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> rejectTask(String taskId, String targetNodeKey, String comment) {
        log.info("[rejectTask] 开始驳回任务, taskId={}, targetNodeKey={}", taskId, targetNodeKey);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        if (!StringUtils.hasText(targetNodeKey)) {
            throw WorkflowException.validationError("目标节点Key不能为空");
        }
        
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        
        // P0-2: 权限校验
        permissionService.checkRejectPermission(task);
        
        // 6.B: 目标节点合法性校验 - 只允许驳回到之前的审批节点
        validateRejectTarget(task.getInstanceId(), task.getNodeKey(), targetNodeKey);
        
        // 1. Save History
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTaskId(task.getTaskId());
        history.setInstanceId(task.getInstanceId());
        history.setNodeName(task.getNodeName());
        history.setNodeKey(task.getNodeKey());
        history.setOperatorId(UserContext.getUserId());
        history.setOperatorName(UserContext.getUserName());
        history.setComment(comment);
        history.setAction("REJECT_TO_" + targetNodeKey);
        history.setCreateTime(new Date());
        taskHistoryMapper.insert(history);
        
        // 2. Delete current task
        taskMapper.deleteById(taskId);
        
        // 3. Create new task at target node
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) {
            throw WorkflowException.instanceNotFound(task.getInstanceId());
        }
        
        WfProcessDefinition def = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );
        
        try {
            WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
            WfNodeConfig targetNode = findNode(root, targetNodeKey);
            if (targetNode == null) {
                throw WorkflowException.validationError("目标节点不存在: " + targetNodeKey);
            }
            
            // 4.K: 传递 rootNode 参数
            runNode(instance, targetNode, null, 0, root);
            
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[rejectTask] 驳回失败, taskId={}, error={}", taskId, e.getMessage(), e);
            throw new WorkflowException("REJECT_FAILED", "驳回失败: " + e.getMessage(), e);
        }
        
        log.info("[rejectTask] 驳回成功, taskId={}, targetNodeKey={}", taskId, targetNodeKey);
        auditService.log(WorkflowAuditService.AuditAction.TASK_REJECT, taskId,
            "targetNodeKey=" + targetNodeKey);
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> recallProcess(String instanceId) {
        log.info("[recallProcess] 开始撤回流程, instanceId={}", instanceId);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(instanceId)) {
            throw WorkflowException.validationError("流程实例ID不能为空");
        }
        
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        
        if (!WfProcessStatus.RUNNING.getCode().equals(instance.getStatus())) {
            throw WorkflowException.invalidState("流程已结束，无法撤回");
        }
        
        // P0-2: 使用权限服务校验
        permissionService.checkRecallPermission(instance);
        
        // Delete all active tasks
        LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
        taskWrapper.eq(WfTask::getInstanceId, instanceId);
        taskMapper.delete(taskWrapper);
        
        // P0-4: 清理 Redis 中的相关数据（SLA 超时等）
        try {
            redisCache.deleteObject("sys:wf:join:" + instanceId + ":*");
        } catch (Exception e) {
            log.warn("[recallProcess] 清理 Redis 数据失败: {}", e.getMessage());
        }
        
        // Update instance status
        instance.setStatus(WfProcessStatus.REVOKED.getCode());
        instance.setEndTime(new Date());
        processInstanceMapper.updateById(instance);
        
        log.info("[recallProcess] 流程撤回成功, instanceId={}", instanceId);
        auditService.log(WorkflowAuditService.AuditAction.PROCESS_RECALL, instanceId);
        return R.ok();
    }

    @Override
    public PageResult<WfTask> getTodoTasks(Long userId, PageQuery pageQuery) {
        log.info("[getTodoTasks] 查询待办任务, userId={}, pageNum={}, pageSize={}", userId, pageQuery.getPageNum(), pageQuery.getPageSize());
        
        Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTask> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfTask::getAssignee, userId);
        queryWrapper.orderByDesc(WfTask::getCreateTime);
        
        Page<WfTask> resultPage = taskMapper.selectPage(page, queryWrapper);
        List<WfTask> tasks = resultPage.getRecords();

        if (tasks != null && !tasks.isEmpty()) {
            // P0-1: 批量查询优化 - 收集所有 instanceId
            List<String> instanceIds = tasks.stream()
                .map(WfTask::getInstanceId)
                .distinct()
                .collect(java.util.stream.Collectors.toList());
            
            // P0-1: 批量查询流程实例
            List<WfProcessInstance> instances = processInstanceMapper.selectBatchIds(instanceIds);
            Map<String, WfProcessInstance> instanceMap = instances.stream()
                .collect(java.util.stream.Collectors.toMap(WfProcessInstance::getInstanceId, inst -> inst));
            
            // P0-1: 收集所有 processDefKey
            List<String> processKeys = instances.stream()
                .map(WfProcessInstance::getProcessDefKey)
                .distinct()
                .collect(java.util.stream.Collectors.toList());
            
            // P0-1: 批量查询流程定义
            List<WfProcessDefinition> definitions = processDefinitionMapper.selectList(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .in(WfProcessDefinition::getProcessKey, processKeys)
                    .orderByDesc(WfProcessDefinition::getVersion)
            );
            
            // P0-1: 为每个 processKey 保留最新版本
            Map<String, WfProcessDefinition> defMap = new java.util.HashMap<>();
            for (WfProcessDefinition def : definitions) {
                defMap.putIfAbsent(def.getProcessKey(), def);
            }
            
            // 8.C: 批量查询已读状态
            List<String> taskIds = tasks.stream()
                .map(WfTask::getTaskId)
                .collect(java.util.stream.Collectors.toList());
            
            List<com.cloudflow.workflow.domain.WfTaskRead> readRecords = taskReadMapper.selectList(
                new LambdaQueryWrapper<com.cloudflow.workflow.domain.WfTaskRead>()
                    .in(com.cloudflow.workflow.domain.WfTaskRead::getTaskId, taskIds)
                    .eq(com.cloudflow.workflow.domain.WfTaskRead::getUserId, userId)
            );
            
            Map<String, com.cloudflow.workflow.domain.WfTaskRead> readMap = readRecords.stream()
                .collect(java.util.stream.Collectors.toMap(
                    com.cloudflow.workflow.domain.WfTaskRead::getTaskId, 
                    r -> r
                ));
            
            // P0-1: 填充任务数据
            for (WfTask task : tasks) {
                WfProcessInstance instance = instanceMap.get(task.getInstanceId());
                if (instance != null) {
                    task.setProcessDefKey(instance.getProcessDefKey());
                    task.setStartUserId(String.valueOf(instance.getStartUserId()));
                    task.setStartUserName(instance.getStartUserName());
                    task.setInstanceTitle(instance.getTitle());
                    
                    WfProcessDefinition def = defMap.get(instance.getProcessDefKey());
                    if (def != null) {
                        task.setProcessName(def.getProcessName());
                        task.setFormId(def.getFormId());
                    }
                    
                    if (StringUtils.hasText(instance.getVariables())) {
                        try {
                            Map<String, Object> vars = objectMapper.readValue(instance.getVariables(), Map.class);
                            task.setVariables(vars);
                        } catch (Exception e) {
                            log.warn("[getTodoTasks] 变量反序列化失败: {}", e.getMessage());
                        }
                    }
                }
                
                // 8.C: 设置已读状态
                com.cloudflow.workflow.domain.WfTaskRead readRecord = readMap.get(task.getTaskId());
                if (readRecord != null) {
                    task.setIsRead(true);
                    task.setReadTime(readRecord.getReadTime());
                } else {
                    task.setIsRead(false);
                }
            }
        }
        
        log.info("[getTodoTasks] 查询完成, 返回 {} 条任务", tasks != null ? tasks.size() : 0);
        return new PageResult<>(tasks, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    /**
     * 5.G: 合并审批变量与实例变量
     */
    private Map<String, Object> mergeVariables(WfProcessInstance instance, Map<String, Object> newVariables) {
        Map<String, Object> instanceVars = new HashMap<>();
        if (StringUtils.hasText(instance.getVariables())) {
            try {
                instanceVars = objectMapper.readValue(instance.getVariables(), Map.class);
            } catch (Exception e) {
                log.warn("[mergeVariables] 反序列化实例变量失败: {}", e.getMessage());
            }
        }
        
        if (newVariables != null && !newVariables.isEmpty()) {
            // 过滤掉内部变量（以_开头的）
            newVariables.entrySet().stream()
                .filter(entry -> !entry.getKey().startsWith("_"))
                .forEach(entry -> instanceVars.put(entry.getKey(), entry.getValue()));
            
            // 更新实例变量
            try {
                instance.setVariables(objectMapper.writeValueAsString(instanceVars));
                processInstanceMapper.updateById(instance);
                log.info("[mergeVariables] 变量合并成功, instanceId={}, 新增/更新 {} 个变量", 
                    instance.getInstanceId(), newVariables.size());
            } catch (Exception e) {
                log.warn("[mergeVariables] 更新实例变量失败: {}", e.getMessage());
            }
        }
        
        return instanceVars;
    }
    
    /**
     * 5.F: 通知发起人审批进度
     */
    private void notifyInitiator(WfProcessInstance instance, String nodeName, String action, String comment) {
        try {
            Long initiatorId = instance.getStartUserId();
            Long currentUserId = UserContext.getUserId();
            
            // 不通知自己
            if (initiatorId != null && !initiatorId.equals(currentUserId)) {
                String actionText;
                switch (action != null ? action.toUpperCase() : "") {
                    case "APPROVE": actionText = "已通过"; break;
                    case "REJECT": actionText = "已拒绝"; break;
                    case "DELEGATE": actionText = "已转办"; break;
                    default: actionText = "已处理"; break;
                }
                
                String content = String.format("您发起的流程「%s」在节点「%s」%s", 
                    instance.getTitle(), nodeName, actionText);
                if (StringUtils.hasText(comment)) {
                    content += "，意见：" + comment;
                }
                
                sysNoticeService.sendNotice(
                    initiatorId,
                    "审批进度通知",
                    content,
                    "1",
                    currentUserId,
                    UserContext.getUserName()
                );
            }
        } catch (Exception e) {
            log.warn("[notifyInitiator] 通知发起人失败: {}", e.getMessage());
        }
    }
    
    /**
     * 6.B: 校验驳回目标节点合法性
     * 只允许驳回到当前节点之前已经执行过的审批节点
     */
    private void validateRejectTarget(String instanceId, String currentNodeKey, String targetNodeKey) {
        // 查询历史记录，获取当前节点之前的所有已执行节点
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(
            new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getInstanceId, instanceId)
                .orderByAsc(WfTaskHistory::getCreateTime)
        );
        
        List<String> previousNodeKeys = new ArrayList<>();
        for (WfTaskHistory h : histories) {
            String nodeKey = h.getNodeKey();
            if (nodeKey != null && nodeKey.equals(currentNodeKey)) {
                break; // 到达当前节点，停止收集
            }
            if (nodeKey != null && !previousNodeKeys.contains(nodeKey)) {
                previousNodeKeys.add(nodeKey);
            }
        }
        
        if (!previousNodeKeys.contains(targetNodeKey)) {
            log.warn("[validateRejectTarget] 非法驳回目标: targetNodeKey={}, 允许的节点={}", 
                targetNodeKey, previousNodeKeys);
            throw WorkflowException.validationError(
                "只能驳回到之前已执行过的节点，允许的目标节点: " + String.join(", ", previousNodeKeys));
        }
        
        log.info("[validateRejectTarget] 驳回目标校验通过, targetNodeKey={}", targetNodeKey);
    }

    @Override
    @Retryable(value = Exception.class, maxAttempts = 3, backoff = @Backoff(delay = 500))
    public WfProcessInstance getProcessInstance(String instanceId) {
        log.info("[getProcessInstance] 查询流程实例, instanceId={}", instanceId);
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            log.warn("[getProcessInstance] 流程实例不存在, instanceId={}", instanceId);
            return null;
        }
        
        // 9.A: 查看实例权限控制
        Long currentUserId = UserContext.getUserId();
        if (currentUserId != null && !permissionService.isAdmin(currentUserId)) {
            // 检查是否为发起人
            boolean isInitiator = currentUserId.equals(instance.getStartUserId());
            // 检查是否为当前处理人
            boolean isAssignee = false;
            if (!isInitiator) {
                Long count = taskMapper.selectCount(
                    new LambdaQueryWrapper<WfTask>()
                        .eq(WfTask::getInstanceId, instanceId)
                        .eq(WfTask::getAssignee, currentUserId)
                );
                isAssignee = count != null && count > 0;
            }
            // 检查是否为历史参与人
            boolean isParticipant = false;
            if (!isInitiator && !isAssignee) {
                Long histCount = taskHistoryMapper.selectCount(
                    new LambdaQueryWrapper<WfTaskHistory>()
                        .eq(WfTaskHistory::getInstanceId, instanceId)
                        .eq(WfTaskHistory::getOperatorId, currentUserId)
                );
                isParticipant = histCount != null && histCount > 0;
            }
            
        if (!isInitiator && !isAssignee && !isParticipant) {
                log.warn("[getProcessInstance] 用户无权查看此实例, userId={}, instanceId={}", currentUserId, instanceId);
                throw new com.cloudflow.workflow.exception.PermissionDeniedException("您没有权限查看此流程实例");
            }
        }
        
        // 9.B/S.2: 敏感信息脱敏
        if (StringUtils.hasText(instance.getVariables())) {
            try {
                Map<String, Object> vars = objectMapper.readValue(instance.getVariables(), Map.class);
                vars = securityUtils.maskSensitiveData(vars);
                instance.setVariables(objectMapper.writeValueAsString(vars));
            } catch (Exception e) {
                log.warn("[getProcessInstance] 变量脱敏失败: {}", e.getMessage());
            }
        }
        
        // 9.D: 返回数据完整性 - 增加关联信息
        enrichInstanceData(instance);
        
        // 11.C: 当前节点信息
        enrichCurrentNodeInfo(instance);
        
        return instance;
    }

    @Override
    public Map<String, Object> getProcessTrace(String instanceId) {
        log.info("[getProcessTrace] 查询流程轨迹, instanceId={}", instanceId);
        
        // 10.C: 流程轨迹权限控制 - 只有发起人、参与人、管理员可查看
        WfProcessInstance traceInstance = processInstanceMapper.selectById(instanceId);
        if (traceInstance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }
        Long currentUserId = UserContext.getUserId();
        if (currentUserId != null && !permissionService.isAdmin(currentUserId)) {
            boolean isInitiator = currentUserId.equals(traceInstance.getStartUserId());
            boolean isParticipant = false;
            if (!isInitiator) {
                // 检查是否为当前处理人
                Long taskCount = taskMapper.selectCount(
                    new LambdaQueryWrapper<WfTask>()
                        .eq(WfTask::getInstanceId, instanceId)
                        .eq(WfTask::getAssignee, currentUserId)
                );
                if (taskCount != null && taskCount > 0) {
                    isParticipant = true;
                }
            }
            if (!isInitiator && !isParticipant) {
                // 检查是否为历史参与人
                Long histCount = taskHistoryMapper.selectCount(
                    new LambdaQueryWrapper<WfTaskHistory>()
                        .eq(WfTaskHistory::getInstanceId, instanceId)
                        .eq(WfTaskHistory::getOperatorId, currentUserId)
                );
                if (histCount == null || histCount == 0) {
                    log.warn("[getProcessTrace] 用户无权查看流程轨迹, userId={}, instanceId={}", currentUserId, instanceId);
                    throw new com.cloudflow.workflow.exception.PermissionDeniedException("您没有权限查看此流程轨迹");
                }
            }
        }
        
        // 10.A: 返回完整的历史记录（包含处理人、时间、意见等详细信息）
        LambdaQueryWrapper<WfTaskHistory> historyWrapper = new LambdaQueryWrapper<>();
        historyWrapper.eq(WfTaskHistory::getInstanceId, instanceId);
        historyWrapper.orderByAsc(WfTaskHistory::getCreateTime);
        List<WfTaskHistory> histories = taskHistoryMapper.selectList(historyWrapper);
        
        List<String> finished = histories.stream()
                .map(WfTaskHistory::getNodeKey)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        
        // 10.A: 构建详细的历史记录列表
        List<Map<String, Object>> historyDetails = new ArrayList<>();
        for (WfTaskHistory h : histories) {
            Map<String, Object> detail = new HashMap<>();
            detail.put("historyId", h.getHistoryId());
            detail.put("taskId", h.getTaskId());
            detail.put("nodeKey", h.getNodeKey());
            detail.put("nodeName", h.getNodeName());
            detail.put("operatorId", h.getOperatorId());
            detail.put("operatorName", h.getOperatorName());
            detail.put("action", h.getAction());
            detail.put("comment", h.getComment());
            detail.put("createTime", h.getCreateTime());
            historyDetails.add(detail);
        }

        // Active nodes from tasks
        LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
        taskWrapper.eq(WfTask::getInstanceId, instanceId);
        List<WfTask> tasks = taskMapper.selectList(taskWrapper);
        
        List<String> active = tasks.stream()
                .map(WfTask::getNodeKey)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        
        // 10.A: 构建活动任务详情
        List<Map<String, Object>> activeDetails = new ArrayList<>();
        for (WfTask t : tasks) {
            Map<String, Object> detail = new HashMap<>();
            detail.put("taskId", t.getTaskId());
            detail.put("nodeKey", t.getNodeKey());
            detail.put("nodeName", t.getNodeName());
            detail.put("assignee", t.getAssignee());
            detail.put("status", t.getStatus());
            detail.put("createTime", t.getCreateTime());
            // 查询处理人名称
            if (t.getAssignee() != null) {
                SysUser assigneeUser = sysUserMapper.selectById(t.getAssignee());
                if (assigneeUser != null) {
                    detail.put("assigneeName", assigneeUser.getNickName() != null ? assigneeUser.getNickName() : assigneeUser.getUserName());
                }
            }
            activeDetails.add(detail);
        }

        // 10.B: 并行分支展示 - 解析流程定义，标识并行分支节点
        List<Map<String, Object>> parallelBranches = new ArrayList<>();
        try {
            WfProcessDefinition traceDef = processDefinitionMapper.selectOne(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .eq(WfProcessDefinition::getProcessKey, traceInstance.getProcessDefKey())
                    .orderByDesc(WfProcessDefinition::getVersion)
                    .last("LIMIT 1")
            );
            if (traceDef != null && StringUtils.hasText(traceDef.getModelJson())) {
                WfNodeConfig traceRoot = objectMapper.readValue(traceDef.getModelJson(), WfNodeConfig.class);
                collectParallelBranches(traceRoot, parallelBranches);
            }
        } catch (Exception e) {
            log.warn("[getProcessTrace] 解析并行分支失败: {}", e.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("finished", finished);
        result.put("active", active);
        result.put("historyDetails", historyDetails);  // 10.A: 完整历史记录
        result.put("activeDetails", activeDetails);      // 10.A: 活动任务详情
        result.put("parallelBranches", parallelBranches); // 10.B: 并行分支信息
        log.info("[getProcessTrace] 查询完成, finished={}, active={}, historyDetails={}, parallelBranches={}", 
            finished.size(), active.size(), historyDetails.size(), parallelBranches.size());
        return result;
    }

    @Override
    public PageResult<WfProcessInstance> getMyInstances(Long userId, PageQuery pageQuery) {
        log.info("[getMyInstances] 查询我的流程实例, userId={}, pageNum={}, pageSize={}", userId, pageQuery.getPageNum(), pageQuery.getPageSize());
        
        Page<WfProcessInstance> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfProcessInstance> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfProcessInstance::getStartUserId, userId);
        
        // 11.D: 筛选条件 - 支持按状态、流程类型、时间范围筛选
        String status = (String) pageQuery.getParams().get("status");
        if (StringUtils.hasText(status)) {
            queryWrapper.eq(WfProcessInstance::getStatus, status);
        }
        
        String processDefKey = (String) pageQuery.getParams().get("processDefKey");
        if (StringUtils.hasText(processDefKey)) {
            queryWrapper.eq(WfProcessInstance::getProcessDefKey, processDefKey);
        }
        
        String startTimeFrom = (String) pageQuery.getParams().get("startTimeFrom");
        if (StringUtils.hasText(startTimeFrom)) {
            try {
                Date fromDate = new java.text.SimpleDateFormat("yyyy-MM-dd").parse(startTimeFrom);
                queryWrapper.ge(WfProcessInstance::getStartTime, fromDate);
            } catch (Exception e) {
                log.warn("[getMyInstances] 解析开始时间失败: {}", e.getMessage());
            }
        }
        
        String startTimeTo = (String) pageQuery.getParams().get("startTimeTo");
        if (StringUtils.hasText(startTimeTo)) {
            try {
                Date toDate = new java.text.SimpleDateFormat("yyyy-MM-dd").parse(startTimeTo);
                queryWrapper.le(WfProcessInstance::getStartTime, toDate);
            } catch (Exception e) {
                log.warn("[getMyInstances] 解析结束时间失败: {}", e.getMessage());
            }
        }
        
        queryWrapper.orderByDesc(WfProcessInstance::getStartTime);
        
        Page<WfProcessInstance> resultPage = processInstanceMapper.selectPage(page, queryWrapper);
        List<WfProcessInstance> list = resultPage.getRecords();

        if (list != null && !list.isEmpty()) {
            // P0-1: 批量查询优化 - 收集所有 processDefKey
            List<String> processKeys = list.stream()
                .map(WfProcessInstance::getProcessDefKey)
                .distinct()
                .collect(java.util.stream.Collectors.toList());
            
            // P0-1: 批量查询流程定义
            List<WfProcessDefinition> definitions = processDefinitionMapper.selectList(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .in(WfProcessDefinition::getProcessKey, processKeys)
                    .orderByDesc(WfProcessDefinition::getVersion)
            );
            
            // P0-1: 为每个 processKey 保留最新版本
            Map<String, WfProcessDefinition> defMap = new java.util.HashMap<>();
            for (WfProcessDefinition def : definitions) {
                defMap.putIfAbsent(def.getProcessKey(), def);
            }
            
            // P0-1: 填充实例数据
            for (WfProcessInstance instance : list) {
                WfProcessDefinition def = defMap.get(instance.getProcessDefKey());
                if (def != null) {
                    instance.setFormId(def.getFormId());
                }
            }
        }
        
        log.info("[getMyInstances] 查询完成, 返回 {} 条实例", list != null ? list.size() : 0);
        return new PageResult<>(list, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public PageResult<WfProcessDefinition> listProcessDefinitions(PageQuery pageQuery) {
        log.info("[listProcessDefinitions] 查询流程定义列表, pageNum={}, pageSize={}", pageQuery.getPageNum(), pageQuery.getPageSize());
        
        Page<WfProcessDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfProcessDefinition> queryWrapper = new LambdaQueryWrapper<>();
        
        // 12.B: 筛选条件 - 支持按状态筛选
        String status = (String) pageQuery.getParams().get("status");
        if (StringUtils.hasText(status)) {
            queryWrapper.eq(WfProcessDefinition::getStatus, status);
        }
        
        // 12.C: 搜索功能 - 支持按流程名称和Key模糊搜索
        String keyword = (String) pageQuery.getParams().get("keyword");
        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(w -> w
                .like(WfProcessDefinition::getProcessName, keyword)
                .or()
                .like(WfProcessDefinition::getProcessKey, keyword)
            );
        }
        
        queryWrapper.orderByDesc(WfProcessDefinition::getCreateTime);
        
        Page<WfProcessDefinition> resultPage = processDefinitionMapper.selectPage(page, queryWrapper);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Cacheable(value = "formDefinition", key = "#formId", unless = "#result == null")
    public WfFormDefinition getFormDefinition(String formId) {
        log.info("[getFormDefinition] 查询表单定义(缓存未命中), formId={}", formId);
        
        // 13.D: 表单权限控制 - 验证用户是否有权访问
        Long currentUserId = UserContext.getUserId();
        if (currentUserId != null && !permissionService.isAdmin(currentUserId)) {
            // 检查用户是否有关联的流程实例使用了此表单
            // 查找使用此表单的流程定义
            List<WfProcessDefinition> relatedDefs = processDefinitionMapper.selectList(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .eq(WfProcessDefinition::getFormId, formId)
            );
            
            if (relatedDefs != null && !relatedDefs.isEmpty()) {
                List<String> processKeys = relatedDefs.stream()
                    .map(WfProcessDefinition::getProcessKey)
                    .distinct()
                    .collect(Collectors.toList());
                
                // 检查用户是否参与过这些流程
                Long instanceCount = processInstanceMapper.selectCount(
                    new LambdaQueryWrapper<WfProcessInstance>()
                        .in(WfProcessInstance::getProcessDefKey, processKeys)
                        .and(w -> w
                            .eq(WfProcessInstance::getStartUserId, currentUserId)
                        )
                );
                
                Long taskCount = taskMapper.selectCount(
                    new LambdaQueryWrapper<WfTask>()
                        .eq(WfTask::getAssignee, currentUserId)
                );
                
                if ((instanceCount == null || instanceCount == 0) && (taskCount == null || taskCount == 0)) {
                    log.warn("[getFormDefinition] 用户无权访问此表单, userId={}, formId={}", currentUserId, formId);
                    throw new com.cloudflow.workflow.exception.PermissionDeniedException("您没有权限访问此表单定义");
                }
            }
            // 如果表单未关联任何流程定义，允许访问（公共表单）
        }
        
        // 13.C: 表单不存在友好提示
        WfFormDefinition form = formDefinitionMapper.selectById(formId);
        if (form == null) {
            throw WorkflowException.validationError("表单定义不存在: " + formId);
        }
        return form;
    }

    @Override
    public PageResult<WfFormDefinition> listFormDefinitions(PageQuery pageQuery) {
        log.info("[listFormDefinitions] 查询表单定义列表, pageNum={}, pageSize={}", pageQuery.getPageNum(), pageQuery.getPageSize());
        
        Page<WfFormDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfFormDefinition> queryWrapper = new LambdaQueryWrapper<>();
        
        // 14.A: 筛选条件 - 支持按状态筛选
        String status = (String) pageQuery.getParams().get("status");
        if (StringUtils.hasText(status)) {
            queryWrapper.eq(WfFormDefinition::getStatus, status);
        }
        
        // 14.B: 搜索功能 - 支持按表单名称模糊搜索
        String keyword = (String) pageQuery.getParams().get("keyword");
        if (StringUtils.hasText(keyword)) {
            queryWrapper.like(WfFormDefinition::getFormName, keyword);
        }
        
        queryWrapper.orderByDesc(WfFormDefinition::getCreateTime);
        
        Page<WfFormDefinition> resultPage = formDefinitionMapper.selectPage(page, queryWrapper);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void readTask(String taskId, Long userId) {
        log.info("[readTask] 标记任务已读, taskId={}, userId={}", taskId, userId);
        // Check duplication
        Long count = taskReadMapper.selectCount(new LambdaQueryWrapper<com.cloudflow.workflow.domain.WfTaskRead>()
                .eq(com.cloudflow.workflow.domain.WfTaskRead::getTaskId, taskId)
                .eq(com.cloudflow.workflow.domain.WfTaskRead::getUserId, userId));
        if (count == 0) {
            com.cloudflow.workflow.domain.WfTaskRead read = new com.cloudflow.workflow.domain.WfTaskRead();
            read.setTaskId(taskId);
            read.setUserId(userId);
            read.setReadTime(new Date());
            taskReadMapper.insert(read);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> urgeTask(String taskId, String reason) {
        Long currentUserId = UserContext.getUserId();
        log.info("[urgeTask] 开始催办任务, taskId={}, userId={}", taskId, currentUserId);
        
        // P0-4: 参数校验
        if (!StringUtils.hasText(taskId)) {
            throw WorkflowException.validationError("任务ID不能为空");
        }
        
        // P0-5: 限流检查
        rateLimiterService.checkUrgeTaskLimit(currentUserId != null ? currentUserId : 0L);
        
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }
        
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        if (instance == null) {
            throw WorkflowException.instanceNotFound(task.getInstanceId());
        }
        
        // P0-2: 使用权限服务校验
        permissionService.checkUrgePermission(instance);
        
        // Save urge record
        com.cloudflow.workflow.domain.WfTaskUrge urge = new com.cloudflow.workflow.domain.WfTaskUrge();
        urge.setTaskId(taskId);
        urge.setSenderId(currentUserId);
        urge.setRecipientId(task.getAssignee());
        urge.setReason(reason);
        urge.setCreateTime(new Date());
        taskUrgeMapper.insert(urge);
        
        // Send Notification
        sysNoticeService.sendNotice(
            task.getAssignee(), 
            "任务催办提醒", 
            "发起人催办了任务: " + task.getNodeName() + "，原因: " + (StringUtils.hasText(reason) ? reason : "无"), 
            "2",
            currentUserId,
            UserContext.getUserName()
        );
        
        log.info("[urgeTask] 催办成功, taskId={}, recipientId={}", taskId, task.getAssignee());
        return R.ok();
    }
    
    /**
     * 5.I: 处理会签投票
     * 使用分布式锁保证并发安全
     */
    private R<?> handleCountersignVote(WfTask task, String taskId, String action, String comment, Map<String, Object> variables) {
        Long currentUserId = UserContext.getUserId();
        String userName = UserContext.getUserName();
        
        // 将 action 转换为投票结果
        String voteResult;
        if ("APPROVE".equalsIgnoreCase(action)) {
            voteResult = "APPROVE";
        } else if ("REJECT".equalsIgnoreCase(action)) {
            voteResult = "REJECT";
        } else {
            voteResult = "APPROVE"; // 默认同意
        }
        
        // 执行投票（内部使用分布式锁保证并发安全）
        String countersignResult = countersignService.vote(taskId, currentUserId, userName, voteResult, comment);
        
        // 保存历史记录
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTaskId(taskId);
        history.setInstanceId(task.getInstanceId());
        history.setNodeName(task.getNodeName());
        history.setNodeKey(task.getNodeKey());
        history.setOperatorId(currentUserId);
        history.setOperatorName(userName);
        history.setComment(comment);
        history.setAction("COUNTERSIGN_" + voteResult);
        history.setCreateTime(new Date());
        
        // 5.H: 计算审批耗时
        if (task.getCreateTime() != null) {
            long durationSeconds = (System.currentTimeMillis() - task.getCreateTime().getTime()) / 1000;
            history.setDurationSeconds((int) durationSeconds);
        }
        taskHistoryMapper.insert(history);
        
        log.info("[handleCountersignVote] 会签投票完成, taskId={}, voteResult={}, countersignResult={}", 
            taskId, voteResult, countersignResult);
        
        // 如果会签已结束，继续流程流转
        if ("PASSED".equals(countersignResult) || "REJECTED".equals(countersignResult)) {
            WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
            
            // 9.C: 保存实例快照
            saveProcessSnapshot(instance, task.getNodeKey(), task.getNodeName());
            
            if ("REJECTED".equals(countersignResult)) {
                completeInstance(instance, WfProcessStatus.REJECTED.getCode());
                log.info("[handleCountersignVote] 会签被拒绝, instanceId={}", instance.getInstanceId());
                notifyInitiator(instance, task.getNodeName(), "REJECT", "会签未通过");
            } else {
                // 会签通过，继续流转到下一个节点
                Map<String, Object> mergedVariables = mergeVariables(instance, variables);
                
                WfProcessDefinition def = processDefinitionMapper.selectOne(
                    new LambdaQueryWrapper<WfProcessDefinition>()
                        .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                        .orderByDesc(WfProcessDefinition::getVersion)
                        .last("LIMIT 1")
                );
                
                try {
                    if (def != null && StringUtils.hasText(def.getModelJson())) {
                        WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
                        WfNodeConfig nextNode = findNextNode(root, task.getNodeKey());
                        
                        if (nextNode != null) {
                            runNode(instance, nextNode, mergedVariables, 0, root);
                        } else {
                            completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
                        }
                    } else {
                        completeInstance(instance, WfProcessStatus.COMPLETED.getCode());
                    }
                } catch (Exception e) {
                    log.error("[handleCountersignVote] 流程流转失败: {}", e.getMessage(), e);
                    throw new WorkflowException("COUNTERSIGN_FLOW_FAILED", "会签后流程流转失败: " + e.getMessage(), e);
                }
                
                notifyInitiator(instance, task.getNodeName(), "APPROVE", "会签已通过");
            }
            
            auditService.log(WorkflowAuditService.AuditAction.TASK_COMPLETE, taskId,
                "countersign_" + countersignResult + ", nodeName=" + task.getNodeName());
        }
        
        return R.ok(countersignResult);
    }
    
    /**
     * 5.I: 解析多个审批人（用于会签场景）
     * 支持 ROLE 类型返回该角色下的所有用户
     */
    private List<Long> resolveMultipleAssignees(WfNodeConfig node, WfProcessInstance instance) {
        String type = node.getApproverType();
        String value = node.getApproverValue();
        List<Long> assigneeIds = new ArrayList<>();
        
        if ("USERS".equals(type) || "USER_LIST".equals(type)) {
            // 直接指定多个用户ID，逗号分隔
            if (StringUtils.hasText(value)) {
                String[] ids = value.split(",");
                for (String id : ids) {
                    try {
                        assigneeIds.add(Long.valueOf(id.trim()));
                    } catch (NumberFormatException e) {
                        log.warn("[resolveMultipleAssignees] 无效的用户ID: {}", id);
                    }
                }
            }
        } else if ("ROLE".equals(type)) {
            // 查找该角色下的所有用户
            SysRole role = sysRoleMapper.selectOne(
                new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, value));
            if (role != null) {
                List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                    new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, role.getRoleId()));
                if (userRoles != null) {
                    for (SysUserRole ur : userRoles) {
                        assigneeIds.add(ur.getUserId());
                    }
                }
            }
        } else if ("DEPT".equals(type)) {
            // 查找该部门下的所有用户
            if (StringUtils.hasText(value)) {
                List<SysUser> deptUsers = sysUserMapper.selectList(
                    new LambdaQueryWrapper<SysUser>().eq(SysUser::getDeptId, Long.valueOf(value)));
                if (deptUsers != null) {
                    for (SysUser u : deptUsers) {
                        assigneeIds.add(u.getUserId());
                    }
                }
            }
        }
        
        return assigneeIds;
    }

    /**
     * 10.B: 递归收集并行分支信息
     * 遍历流程定义树，找到所有 PARALLEL 类型的网关节点，提取分支信息
     */
    private void collectParallelBranches(WfNodeConfig node, List<Map<String, Object>> parallelBranches) {
        if (node == null) return;
        
        if ("PARALLEL".equals(node.getType())) {
            Map<String, Object> gateway = new HashMap<>();
            gateway.put("gatewayId", node.getId());
            gateway.put("gatewayName", node.getTitle());
            gateway.put("type", "PARALLEL");
            
            List<Map<String, Object>> branches = new ArrayList<>();
            if (node.getBranches() != null) {
                for (int i = 0; i < node.getBranches().size(); i++) {
                    WfNodeConfig branch = node.getBranches().get(i);
                    Map<String, Object> branchInfo = new HashMap<>();
                    branchInfo.put("branchIndex", i);
                    branchInfo.put("branchId", branch.getId());
                    branchInfo.put("branchName", branch.getTitle() != null ? branch.getTitle() : "分支 " + (i + 1));
                    
                    // 收集分支中的所有节点Key
                    List<String> branchNodeKeys = new ArrayList<>();
                    collectBranchNodeKeys(branch, branchNodeKeys);
                    branchInfo.put("nodeKeys", branchNodeKeys);
                    
                    branches.add(branchInfo);
                    
                    // 递归检查分支内部是否有嵌套的并行网关
                    collectParallelBranches(branch, parallelBranches);
                }
            }
            gateway.put("branches", branches);
            gateway.put("branchCount", branches.size());
            
            // 汇聚节点
            if (node.getNext() != null) {
                gateway.put("joinNodeId", node.getNext().getId());
                gateway.put("joinNodeName", node.getNext().getTitle());
            }
            
            parallelBranches.add(gateway);
        }
        
        // 递归检查 next 节点
        collectParallelBranches(node.getNext(), parallelBranches);
        
        // 递归检查条件分支
        if (node.getBranches() != null && !"PARALLEL".equals(node.getType())) {
            for (WfNodeConfig branch : node.getBranches()) {
                collectParallelBranches(branch, parallelBranches);
            }
        }
    }
    
    /**
     * 10.B: 收集分支中所有节点的Key
     */
    private void collectBranchNodeKeys(WfNodeConfig node, List<String> nodeKeys) {
        if (node == null) return;
        if (node.getId() != null) {
            nodeKeys.add(node.getId());
        }
        collectBranchNodeKeys(node.getNext(), nodeKeys);
        if (node.getBranches() != null) {
            for (WfNodeConfig branch : node.getBranches()) {
                collectBranchNodeKeys(branch, nodeKeys);
            }
        }
    }

    /**
     * 9.C: 保存流程实例快照
     */
    private void saveProcessSnapshot(WfProcessInstance instance, String nodeKey, String nodeName) {
        try {
            WfProcessSnapshot snapshot = new WfProcessSnapshot();
            snapshot.setSnapshotId(UUID.randomUUID().toString());
            snapshot.setInstanceId(instance.getInstanceId());
            snapshot.setNodeKey(nodeKey);
            snapshot.setNodeName(nodeName);
            snapshot.setStatus(instance.getStatus());
            snapshot.setVariables(instance.getVariables());
            
            // 获取当前活动任务
            List<WfTask> activeTasks = taskMapper.selectList(
                new LambdaQueryWrapper<WfTask>().eq(WfTask::getInstanceId, instance.getInstanceId())
            );
            snapshot.setActiveTasks(objectMapper.writeValueAsString(activeTasks));
            snapshot.setCreateTime(new Date());
            
            snapshotMapper.insert(snapshot);
            log.debug("[saveProcessSnapshot] 快照保存成功, instanceId={}, nodeKey={}", instance.getInstanceId(), nodeKey);
        } catch (Exception e) {
            log.warn("[saveProcessSnapshot] 快照保存失败: {}", e.getMessage());
        }
    }
    
    /**
     * 15.D: 清理已读数据
     */
    private void cleanupTaskReadData(String taskId) {
        try {
            taskReadMapper.delete(
                new LambdaQueryWrapper<com.cloudflow.workflow.domain.WfTaskRead>()
                    .eq(com.cloudflow.workflow.domain.WfTaskRead::getTaskId, taskId)
            );
            log.debug("[cleanupTaskReadData] 已读数据清理成功, taskId={}", taskId);
        } catch (Exception e) {
            log.warn("[cleanupTaskReadData] 已读数据清理失败: {}", e.getMessage());
        }
    }
    
    /**
     * 9.D: 返回数据完整性 - 增加关联信息
     */
    private void enrichInstanceData(WfProcessInstance instance) {
        try {
            // 查询流程定义信息
            WfProcessDefinition def = processDefinitionMapper.selectOne(
                new LambdaQueryWrapper<WfProcessDefinition>()
                    .eq(WfProcessDefinition::getProcessKey, instance.getProcessDefKey())
                    .orderByDesc(WfProcessDefinition::getVersion)
                    .last("LIMIT 1")
            );
            if (def != null) {
                instance.setFormId(def.getFormId());
            }
        } catch (Exception e) {
            log.warn("[enrichInstanceData] 数据增强失败: {}", e.getMessage());
        }
    }
    
    /**
     * 11.C: 当前节点信息
     */
    private void enrichCurrentNodeInfo(WfProcessInstance instance) {
        try {
            // 查询当前活动任务
            List<WfTask> activeTasks = taskMapper.selectList(
                new LambdaQueryWrapper<WfTask>()
                    .eq(WfTask::getInstanceId, instance.getInstanceId())
                    .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
            );
            
            if (activeTasks != null && !activeTasks.isEmpty()) {
                // 将当前节点信息添加到实例的扩展字段中
                List<Map<String, Object>> currentNodes = new ArrayList<>();
                for (WfTask task : activeTasks) {
                    Map<String, Object> nodeInfo = new HashMap<>();
                    nodeInfo.put("nodeKey", task.getNodeKey());
                    nodeInfo.put("nodeName", task.getNodeName());
                    nodeInfo.put("assignee", task.getAssignee());
                    nodeInfo.put("createTime", task.getCreateTime());
                    
                    // 查询处理人名称
                    if (task.getAssignee() != null) {
                        SysUser assigneeUser = sysUserMapper.selectById(task.getAssignee());
                        if (assigneeUser != null) {
                            nodeInfo.put("assigneeName", assigneeUser.getNickName() != null ? 
                                assigneeUser.getNickName() : assigneeUser.getUserName());
                        }
                    }
                    currentNodes.add(nodeInfo);
                }
                
                // 将当前节点信息序列化后存储（或通过其他方式返回）
                // 这里简化处理，实际可以添加到实例的扩展字段中
                log.debug("[enrichCurrentNodeInfo] 当前节点信息: {}", currentNodes);
            }
        } catch (Exception e) {
            log.warn("[enrichCurrentNodeInfo] 当前节点信息获取失败: {}", e.getMessage());
        }
    }
}
