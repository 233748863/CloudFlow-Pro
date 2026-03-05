package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfDeployRecordMapper;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfProcessVersionSnapshotMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.service.IWfDefinitionService;
import com.cloudflow.workflow.service.WorkflowAuditService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.*;

/**
 * 流程定义管理服务实现
 * 从 WorkflowServiceImpl 拆分而来，负责流程定义的 CRUD 和发布
 *
 * @author CloudFlow
 */
@Service
public class WfDefinitionServiceImpl implements IWfDefinitionService {

    private static final Logger log = LoggerFactory.getLogger(WfDefinitionServiceImpl.class);

    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;
    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;
    @Autowired
    private WfDeployRecordMapper deployRecordMapper;
    @Autowired
    private WfFormDefinitionMapper formDefinitionMapper;
    @Autowired
    private WfProcessVersionSnapshotMapper versionSnapshotMapper;
    @Autowired
    private WorkflowPermissionService permissionService;
    @Autowired
    private WorkflowAuditService auditService;
    @Autowired
    private JsonSchemaValidator jsonSchemaValidator;
    @Autowired
    private WorkflowSecurityUtils securityUtils;
    @Autowired
    private IVersionService versionService;

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "processDefinition", allEntries = true)
    public R<?> saveProcessDefinition(WfProcessDefinition definition) {
        log.info("[saveProcessDefinition] 开始保存流程定义, processKey={}", definition.getProcessKey());

        // 参数校验
        if (!StringUtils.hasText(definition.getProcessKey())) {
            throw WorkflowException.validationError("流程Key不能为空");
        }
        if (!StringUtils.hasText(definition.getProcessName())) {
            throw WorkflowException.validationError("流程名称不能为空");
        }

        // XSS 防护
        definition.setProcessName(securityUtils.sanitizeXss(definition.getProcessName()));

        // JSON 结构校验 + P0-5: 递归 XSS 过滤 modelJson 内所有节点文本字段
        if (StringUtils.hasText(definition.getModelJson())) {
            jsonSchemaValidator.validateProcessDefinitionJson(definition.getModelJson());
            validateModelIntegrity(definition.getModelJson());
            // P0-5: 对 modelJson 内部节点的 title/condition/props 等字段做 XSS 过滤
            definition.setModelJson(sanitizeModelJson(definition.getModelJson()));
        }

        // 权限校验
        permissionService.checkDefinitionPermission("保存");
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            if (definition.getTenantId() == null) {
                definition.setTenantId(currentTenantId);
            } else if (!currentTenantId.equals(definition.getTenantId())) {
                throw new PermissionDeniedException("无权保存其他租户流程定义");
            }
        }
        validateBoundFormTenant(definition.getFormId(), definition.getTenantId(), "保存");

        // 查找当前Key的最大版本
        LambdaQueryWrapper<WfProcessDefinition> lastDefQuery = new LambdaQueryWrapper<WfProcessDefinition>()
            .eq(WfProcessDefinition::getProcessKey, definition.getProcessKey())
            .orderByDesc(WfProcessDefinition::getVersion)
            .last("LIMIT 1");
        if (definition.getTenantId() != null) {
            lastDefQuery.eq(WfProcessDefinition::getTenantId, definition.getTenantId());
        }
        WfProcessDefinition lastDef = processDefinitionMapper.selectOne(lastDefQuery);

        // 乐观锁冲突检测
        if (lastDef != null && definition.getVersionLock() != null) {
            if (!definition.getVersionLock().equals(lastDef.getVersionLock())) {
                throw WorkflowException.invalidState("流程定义已被其他用户修改，请刷新后重试");
            }
        }

        int version = 1;
        if (lastDef != null) {
            version = lastDef.getVersion() + 1;
            lastDef.setIsLatest(0);
            processDefinitionMapper.updateById(lastDef);
        }

        definition.setDefinitionId(UUID.randomUUID().toString());
        definition.setVersion(version);
        definition.setVersionLock(0);
        definition.setIsLatest(1);
        definition.setStatus("DRAFT");
        definition.setCreateTime(LocalDateTime.now());

        processDefinitionMapper.insert(definition);
        log.info("[saveProcessDefinition] 流程定义保存成功, definitionId={}, version={}", definition.getDefinitionId(), version);
        
        // 自动创建版本记录（强一致性：失败则回滚，不再静默吞异常）
        String currentUserId = UserContext.getUserId() != null ? UserContext.getUserId().toString() : "system";
        String changeLog = "保存流程定义，版本 " + version;
        versionService.createVersion(
            definition.getDefinitionId(),
            definition.getModelJson(),
            changeLog,
            currentUserId
        );
        log.info("[saveProcessDefinition] 版本记录创建成功");
        
        auditService.log(WorkflowAuditService.AuditAction.DEFINITION_CREATE, definition.getDefinitionId(),
            "processKey=" + definition.getProcessKey() + ", version=" + version);
        // P1-13: 返回结构化对象，前端通过 .id 获取 definitionId
        Map<String, Object> result = new HashMap<>();
        result.put("id", definition.getDefinitionId());
        result.put("version", version);
        result.put("processKey", definition.getProcessKey());
        return R.ok(result);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "processDefinition", allEntries = true)
    public R<?> deployProcessDefinition(String definitionId) {
        log.info("[deployProcessDefinition] 开始发布流程定义, definitionId={}", definitionId);

        permissionService.checkDefinitionPermission("发布");

        WfProcessDefinition def = processDefinitionMapper.selectById(definitionId);
        if (def == null) {
            throw WorkflowException.processNotFound(definitionId);
        }
        ensureDefinitionTenantAccess(def.getTenantId(), "发布");
        if ("PUBLISHED".equals(def.getStatus())) {
            throw WorkflowException.invalidState("流程定义已发布，无需重复发布");
        }
        if (!StringUtils.hasText(def.getModelJson())) {
            throw WorkflowException.validationError("流程定义模型为空，无法发布");
        }
        validateBoundFormTenant(def.getFormId(), def.getTenantId(), "发布");

        // 发布前完整性检查
        jsonSchemaValidator.validateProcessDefinitionJson(def.getModelJson());

        // 更新状态
        def.setStatus("PUBLISHED");
        def.setVersionLock(def.getVersionLock() != null ? def.getVersionLock() + 1 : 1);
        processDefinitionMapper.updateById(def);

        // 旧版本归档
        LambdaUpdateWrapper<WfProcessDefinition> archiveOldVersions = new LambdaUpdateWrapper<WfProcessDefinition>()
            .eq(WfProcessDefinition::getProcessKey, def.getProcessKey())
            .ne(WfProcessDefinition::getDefinitionId, definitionId)
            .eq(WfProcessDefinition::getStatus, "PUBLISHED")
            .set(WfProcessDefinition::getStatus, "ARCHIVED");
        if (def.getTenantId() != null) {
            archiveOldVersions.eq(WfProcessDefinition::getTenantId, def.getTenantId());
        }
        processDefinitionMapper.update(null, archiveOldVersions);

        // 创建发布记录
        Long userId = UserContext.getUserId();
        com.cloudflow.workflow.domain.WfDeployRecord deployRecord = new com.cloudflow.workflow.domain.WfDeployRecord();
        deployRecord.setProcessDefId(definitionId);
        deployRecord.setVersion(def.getVersion() != null ? def.getVersion() : 1);
        deployRecord.setDeployStatus("SUCCESS");
        deployRecord.setDeployBy(userId != null ? userId : 1L);
        deployRecord.setDeployTime(java.time.LocalDateTime.now());
        deployRecord.setCanRollback(true);
        deployRecordMapper.insert(deployRecord);

        // 创建版本快照
        try {
            com.cloudflow.workflow.domain.WfProcessVersionSnapshot snapshot = new com.cloudflow.workflow.domain.WfProcessVersionSnapshot();
            snapshot.setProcessDefId(definitionId);
            snapshot.setVersion(def.getVersion() != null ? def.getVersion() : 1);
            snapshot.setDeployId(deployRecord.getId());
            snapshot.setSnapshotData(def.getModelJson());
            snapshot.setFormConfig(def.getFormId());
            snapshot.setCreatedBy(userId != null ? userId : 1L);
            snapshot.setCreatedTime(java.time.LocalDateTime.now());
            versionSnapshotMapper.insert(snapshot);
        } catch (Exception e) {
            log.error("[deployProcessDefinition] 创建版本快照失败: {}", e.getMessage(), e);
        }

        log.info("[deployProcessDefinition] 流程定义发布成功, definitionId={}", definitionId);
        auditService.log(WorkflowAuditService.AuditAction.DEFINITION_DEPLOY, definitionId,
            "processKey=" + def.getProcessKey());
        return R.ok();
    }

    @Override
    public R<?> deleteProcessDefinition(String definitionId) {
        log.info("[deleteProcessDefinition] 开始删除流程定义, definitionId={}", definitionId);

        permissionService.checkDefinitionPermission("删除");

        WfProcessDefinition def = processDefinitionMapper.selectById(definitionId);
        if (def == null) {
            throw WorkflowException.processNotFound(definitionId);
        }
        ensureDefinitionTenantAccess(def.getTenantId(), "删除");

        // 检查运行中的实例
        LambdaQueryWrapper<WfProcessInstance> runningQuery = new LambdaQueryWrapper<WfProcessInstance>()
            .eq(WfProcessInstance::getProcessDefKey, def.getProcessKey())
            .eq(WfProcessInstance::getStatus, WfProcessStatus.RUNNING.getCode());
        if (def.getTenantId() != null) {
            runningQuery.eq(WfProcessInstance::getTenantId, def.getTenantId());
        }
        Long runningCount = processInstanceMapper.selectCount(runningQuery);
        if (runningCount != null && runningCount > 0) {
            throw WorkflowException.invalidState("该流程定义有 " + runningCount + " 个运行中的实例，无法删除");
        }

        // 检查历史实例
        LambdaQueryWrapper<WfProcessInstance> totalQuery = new LambdaQueryWrapper<WfProcessInstance>()
            .eq(WfProcessInstance::getProcessDefKey, def.getProcessKey());
        if (def.getTenantId() != null) {
            totalQuery.eq(WfProcessInstance::getTenantId, def.getTenantId());
        }
        Long totalCount = processInstanceMapper.selectCount(totalQuery);
        if (totalCount != null && totalCount > 0) {
            def.setStatus("ARCHIVED");
            processDefinitionMapper.updateById(def);
            return R.ok("流程定义已归档（存在历史实例，无法物理删除）");
        }

        processDefinitionMapper.deleteById(definitionId);
        auditService.log(WorkflowAuditService.AuditAction.DEFINITION_CREATE, definitionId, "DELETE");
        return R.ok();
    }

    @Override
    public WfProcessDefinition getProcessDefinition(String definitionId) {
        WfProcessDefinition def = processDefinitionMapper.selectById(definitionId);
        if (def == null) {
            throw new WorkflowException("DEFINITION_NOT_FOUND", "流程定义不存在: " + definitionId);
        }
        checkDefinitionReadPermission(def);
        return def;
    }

    @Override
    public PageResult<WfProcessDefinition> listProcessDefinitions(PageQuery pageQuery) {
        Page<WfProcessDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfProcessDefinition> queryWrapper = new LambdaQueryWrapper<>();
        Map<String, Object> params = pageQuery.getParams() != null ? pageQuery.getParams() : Collections.emptyMap();

        String status = Objects.toString(params.get("status"), null);
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();
        boolean isAdmin = permissionService.isAdmin(currentUserId);

        // 租户隔离：同租户内可见（管理员/普通用户一致）
        if (currentTenantId != null) {
            queryWrapper.eq(WfProcessDefinition::getTenantId, currentTenantId);
        }

        // 非管理员仅可见已发布流程，避免草稿定义信息泄露
        if (!isAdmin) {
            queryWrapper.eq(WfProcessDefinition::getStatus, "PUBLISHED");
        } else if (StringUtils.hasText(status)) {
            queryWrapper.eq(WfProcessDefinition::getStatus, status);
        }

        String keyword = Objects.toString(params.get("keyword"), null);
        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(w -> w
                .like(WfProcessDefinition::getProcessName, keyword)
                .or()
                .like(WfProcessDefinition::getProcessKey, keyword)
            );
        }

        String showLatestOnly = Objects.toString(params.get("latestOnly"), null);
        if (!"false".equalsIgnoreCase(showLatestOnly)) {
            queryWrapper.eq(WfProcessDefinition::getIsLatest, 1);
        }

        String category = Objects.toString(params.get("category"), null);
        if (StringUtils.hasText(category)) {
            queryWrapper.eq(WfProcessDefinition::getCategory, category);
        }

        queryWrapper.and(w -> w
            .isNull(WfProcessDefinition::getIsArchived)
            .or()
            .eq(WfProcessDefinition::getIsArchived, 0));

        queryWrapper.orderByDesc(WfProcessDefinition::getCreateTime);

        Page<WfProcessDefinition> resultPage = processDefinitionMapper.selectPage(page, queryWrapper);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    // ==================== P1-6: 流程图结构（定义级别） ====================

    @Override
    public Map<String, Object> getFlowchartStructure(String definitionId) {
        log.info("[getFlowchartStructure] 获取流程定义流程图结构, definitionId={}", definitionId);

        WfProcessDefinition def = processDefinitionMapper.selectById(definitionId);
        if (def == null) {
            throw new WorkflowException("DEFINITION_NOT_FOUND", "流程定义不存在: " + definitionId);
        }
        checkDefinitionReadPermission(def);
        if (!StringUtils.hasText(def.getModelJson())) {
            throw WorkflowException.validationError("流程定义模型为空");
        }

        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();

        try {
            WfNodeConfig root = objectMapper.readValue(def.getModelJson(), WfNodeConfig.class);
            int[] position = {0};
            buildStructureNodes(root, nodes, edges, position, null);
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[getFlowchartStructure] 解析流程模型失败: {}", e.getMessage(), e);
            throw new WorkflowException("PARSE_FAILED", "解析流程模型失败", e);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("definitionId", definitionId);
        result.put("processKey", def.getProcessKey());
        result.put("processName", def.getProcessName());
        result.put("version", def.getVersion());
        result.put("nodes", nodes);
        result.put("edges", edges);
        return result;
    }

    /**
     * 递归构建流程图结构节点和连线（仅定义级别，不含运行时状态）
     */
    private void buildStructureNodes(WfNodeConfig node, List<Map<String, Object>> nodes,
                                     List<Map<String, Object>> edges, int[] position, String parentId) {
        if (node == null) return;

        String nodeId = node.getId();

        // 构建节点数据
        Map<String, Object> nodeData = new HashMap<>();
        nodeData.put("id", nodeId);
        nodeData.put("type", node.getType());
        nodeData.put("label", node.getTitle());
        nodeData.put("x", 250);
        nodeData.put("y", position[0] * 120 + 60);
        // icon 存储在 props Map 中
        if (node.getProps() != null && node.getProps().get("icon") != null) {
            nodeData.put("icon", node.getProps().get("icon"));
        }
        if (node.getApproverType() != null) {
            nodeData.put("approverType", node.getApproverType());
        }
        if (node.getApproverValue() != null) {
            nodeData.put("approverValue", node.getApproverValue());
        }
        if (node.getCondition() != null) {
            nodeData.put("condition", node.getCondition());
        }
        nodes.add(nodeData);
        position[0]++;

        // 生成连线
        if (parentId != null) {
            Map<String, Object> edge = new HashMap<>();
            edge.put("id", parentId + "->" + nodeId);
            edge.put("source", parentId);
            edge.put("target", nodeId);
            if (node.getCondition() != null) {
                edge.put("label", node.getCondition()); // 条件分支显示条件表达式
            }
            edges.add(edge);
        }

        // 处理分支
        if (node.getBranches() != null && !node.getBranches().isEmpty()) {
            for (WfNodeConfig branch : node.getBranches()) {
                buildStructureNodes(branch, nodes, edges, position, nodeId);
            }
        }

        // 处理下一个节点
        if (node.getNext() != null) {
            buildStructureNodes(node.getNext(), nodes, edges, position, nodeId);
        }
    }

    // ==================== P0-5: modelJson XSS 过滤 ====================

    /**
     * 递归清理 modelJson 中所有节点的文本字段，防止存储型 XSS
     * 清理范围：title、condition、description 以及 props 中的所有字符串值
     */
    private String sanitizeModelJson(String modelJson) {
        try {
            WfNodeConfig root = objectMapper.readValue(modelJson, WfNodeConfig.class);
            sanitizeNodeRecursive(root);
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.warn("[sanitizeModelJson] XSS过滤失败，保留原始JSON: {}", e.getMessage());
            return modelJson;
        }
    }

    /**
     * 递归清理单个节点及其子节点的文本字段
     */
    private void sanitizeNodeRecursive(WfNodeConfig node) {
        if (node == null) return;

        // 清理节点标题
        if (StringUtils.hasText(node.getTitle())) {
            node.setTitle(securityUtils.sanitizeXss(node.getTitle()));
        }
        // 清理条件表达式（仅过滤 HTML 标签，保留表达式语法）
        if (StringUtils.hasText(node.getCondition())) {
            node.setCondition(securityUtils.sanitizeXss(node.getCondition()));
        }
        // 清理描述
        if (StringUtils.hasText(node.getDescription())) {
            node.setDescription(securityUtils.sanitizeXss(node.getDescription()));
        }
        // 清理 props 中的所有字符串值
        if (node.getProps() != null) {
            Map<String, Object> sanitizedProps = new HashMap<>();
            for (Map.Entry<String, Object> entry : node.getProps().entrySet()) {
                if (entry.getValue() instanceof String) {
                    sanitizedProps.put(entry.getKey(), securityUtils.sanitizeXss((String) entry.getValue()));
                } else {
                    sanitizedProps.put(entry.getKey(), entry.getValue());
                }
            }
            node.setProps(sanitizedProps);
        }

        // 递归处理 next 节点
        sanitizeNodeRecursive(node.getNext());
        // 递归处理分支节点
        if (node.getBranches() != null) {
            for (WfNodeConfig branch : node.getBranches()) {
                sanitizeNodeRecursive(branch);
            }
        }
    }

    // ==================== 私有方法 ====================

    private void validateBoundFormTenant(String formId, Long definitionTenantId, String operation) {
        if (!StringUtils.hasText(formId)) {
            return;
        }
        WfFormDefinition boundForm = formDefinitionMapper.selectById(formId);
        if (boundForm == null) {
            throw WorkflowException.validationError("绑定表单不存在: " + formId);
        }
        if (definitionTenantId != null && !Objects.equals(definitionTenantId, boundForm.getTenantId())) {
            throw WorkflowException.validationError("绑定表单不属于当前租户，无法" + operation + "流程定义");
        }
    }

    /**
     * 读取流程定义时的最小权限校验：
     * 1) 必须同租户；
     * 2) 非管理员不可读取草稿定义。
     */
    private void checkDefinitionReadPermission(WfProcessDefinition def) {
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        if (currentTenantId != null && !Objects.equals(currentTenantId, def.getTenantId())) {
            throw new PermissionDeniedException("无权访问该租户流程定义");
        }
        if (!permissionService.isAdmin(currentUserId) && "DRAFT".equalsIgnoreCase(def.getStatus())) {
            throw new PermissionDeniedException("无权访问草稿流程定义");
        }
    }

    private void ensureDefinitionTenantAccess(Long definitionTenantId, String operation) {
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, definitionTenantId)) {
            throw new PermissionDeniedException("无权" + operation + "其他租户流程定义");
        }
    }

    /**
     * 流程模型合法性验证
     */
    private void validateModelIntegrity(String modelJson) {
        try {
            WfNodeConfig root = objectMapper.readValue(modelJson, WfNodeConfig.class);
            if (root == null) {
                throw WorkflowException.validationError("流程模型为空");
            }
            Set<String> visitedNodes = new HashSet<>();
            validateNodeConnections(root, visitedNodes, 0);
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("流程模型解析失败: " + e.getMessage());
        }
    }

    private void validateNodeConnections(WfNodeConfig node, Set<String> visited, int depth) {
        if (node == null) return;
        if (depth > 200) {
            throw WorkflowException.validationError("流程模型深度超限，可能存在循环引用");
        }
        if (node.getId() != null) {
            if (visited.contains(node.getId())) {
                throw WorkflowException.validationError("检测到循环引用，节点ID: " + node.getId());
            }
            visited.add(node.getId());
        }
        if ("APPROVAL".equals(node.getType()) && !StringUtils.hasText(node.getApproverType())) {
            throw WorkflowException.validationError("审批节点 [" + node.getTitle() + "] 未配置审批人");
        }
        if ("MANUAL".equals(node.getType()) && !StringUtils.hasText(node.getApproverType())) {
            throw WorkflowException.validationError("人工任务节点 [" + node.getTitle() + "] 未配置处理人");
        }
        // P1-5: COPY（抄送）节点校验 — 必须配置抄送人
        if ("COPY".equals(node.getType())) {
            boolean hasApproverType = StringUtils.hasText(node.getApproverType());
            boolean requiresApproverValue = hasApproverType
                    && !"DIRECT_LEADER".equals(node.getApproverType())
                    && !"DEPT_MANAGER".equals(node.getApproverType());
            boolean hasApproverValue = StringUtils.hasText(node.getApproverValue());

            // 兼容历史模型字段（copyUserIds/copyRoleKey/copyDeptId）
            Map<String, Object> nodeProps = node.getProps();
            Object legacyUserIds = nodeProps != null ? nodeProps.get("copyUserIds") : null;
            boolean hasLegacyUserIds = false;
            if (legacyUserIds instanceof String) {
                hasLegacyUserIds = StringUtils.hasText((String) legacyUserIds);
            } else if (legacyUserIds instanceof Collection) {
                hasLegacyUserIds = !((Collection<?>) legacyUserIds).isEmpty();
            }
            Object legacyRoleKey = nodeProps != null ? nodeProps.get("copyRoleKey") : null;
            Object legacyDeptId = nodeProps != null ? nodeProps.get("copyDeptId") : null;
            boolean hasLegacyCopyConfig = nodeProps != null && (
                    hasLegacyUserIds
                            || (legacyRoleKey instanceof String && StringUtils.hasText((String) legacyRoleKey))
                            || (legacyDeptId instanceof String && StringUtils.hasText((String) legacyDeptId))
                            || (legacyDeptId instanceof Number)
            );

            boolean validByApprover = hasApproverType && (!requiresApproverValue || hasApproverValue);
            if (!validByApprover && !hasLegacyCopyConfig) {
                throw WorkflowException.validationError(
                        "抄送节点 [" + node.getTitle() + "] 未配置抄送人（请设置 approverType，且在需要时设置 approverValue）");
            }
        }
        // P1-6: NOTIFICATION（通知）节点校验 — 必须配置通知标题或内容
        if ("NOTIFICATION".equals(node.getType())) {
            Map<String, Object> nodeProps = node.getProps();
            boolean hasTitle = nodeProps != null && StringUtils.hasText((String) nodeProps.get("notificationTitle"));
            boolean hasContent = nodeProps != null && StringUtils.hasText((String) nodeProps.get("notificationContent"));
            if (!hasTitle && !hasContent) {
                throw WorkflowException.validationError("通知节点 [" + node.getTitle() + "] 未配置通知标题或内容");
            }
        }
        // P0-3: PARALLEL 节点会签模式与分支互斥校验
        // 防止攻击者绕过前端直接提交同时包含 signType 和 branches 的 PARALLEL 节点
        if ("PARALLEL".equals(node.getType())) {
            String signType = node.getSignType();
            boolean hasSignType = StringUtils.hasText(signType)
                    && ("ALL".equals(signType) || "ANY".equals(signType)
                        || "PERCENT".equals(signType) || "SEQUENTIAL".equals(signType));
            boolean hasBranches = node.getBranches() != null && !node.getBranches().isEmpty();
            if (hasSignType && hasBranches) {
                throw WorkflowException.validationError(
                    "并行节点 [" + node.getTitle() + "] 同时配置了会签模式(" + signType
                    + ")和分支(" + node.getBranches().size() + "个)，两者互斥，请移除分支或取消会签配置");
            }
        }
        validateNodeConnections(node.getNext(), visited, depth + 1);
        if (node.getBranches() != null) {
            for (WfNodeConfig branch : node.getBranches()) {
                validateNodeConnections(branch, visited, depth + 1);
            }
        }
    }
}
