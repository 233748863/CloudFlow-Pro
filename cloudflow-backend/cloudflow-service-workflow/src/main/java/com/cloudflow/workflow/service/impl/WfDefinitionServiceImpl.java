package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
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
import com.cloudflow.workflow.model.WorkflowModelBridge;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.service.IWfDefinitionService;
import com.cloudflow.workflow.service.WorkflowAuditService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
    private WorkflowSecurityUtils securityUtils;
    @Autowired
    private IVersionService versionService;
    @Autowired
    private WorkflowModelBridge workflowModelBridge;

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
            if (!workflowModelBridge.validateGraphModel(definition.getModelJson())) {
                throw WorkflowException.validationError("流程定义图模型校验失败");
            }
            validateModelIntegrity(definition.getModelJson());
            // P0-5: 对 modelJson 内部节点字段做 XSS 过滤
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

        if (!workflowModelBridge.validateGraphModel(def.getModelJson())) {
            throw WorkflowException.validationError("流程定义图模型校验失败");
        }

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
            JsonNode graphRoot = objectMapper.readTree(def.getModelJson());
            if (!workflowModelBridge.isGraphModel(graphRoot)) {
                throw WorkflowException.validationError("仅支持 nodes+edges 图模型");
            }

            JsonNode modelNodes = graphRoot.path("nodes");
            JsonNode modelEdges = graphRoot.path("edges");
            int idx = 0;
            for (JsonNode node : modelNodes) {
                String nodeId = jsonText(node, "id");
                if (!StringUtils.hasText(nodeId)) {
                    continue;
                }

                Map<String, Object> nodeData = new HashMap<>();
                nodeData.put("id", nodeId);
                nodeData.put("type", jsonText(node, "type"));
                nodeData.put("label", firstNotBlank(jsonText(node, "title"), jsonText(node, "label"), "未命名节点"));
                nodeData.put("x", node.hasNonNull("x") ? node.get("x").asInt() : 250);
                nodeData.put("y", node.hasNonNull("y") ? node.get("y").asInt() : (idx * 120 + 60));

                String icon = firstNotBlank(jsonText(node, "icon"), jsonText(node.path("props"), "icon"));
                if (StringUtils.hasText(icon)) {
                    nodeData.put("icon", icon);
                }
                if (StringUtils.hasText(jsonText(node, "approverType"))) {
                    nodeData.put("approverType", jsonText(node, "approverType"));
                }
                if (StringUtils.hasText(jsonText(node, "approverValue"))) {
                    nodeData.put("approverValue", jsonText(node, "approverValue"));
                }
                if (StringUtils.hasText(jsonText(node, "condition"))) {
                    nodeData.put("condition", jsonText(node, "condition"));
                }
                nodes.add(nodeData);
                idx++;
            }

            for (JsonNode edge : modelEdges) {
                String source = firstNotBlank(jsonText(edge, "source"), jsonText(edge, "from"));
                String target = firstNotBlank(jsonText(edge, "target"), jsonText(edge, "to"));
                if (!StringUtils.hasText(source) || !StringUtils.hasText(target)) {
                    continue;
                }
                Map<String, Object> edgeData = new HashMap<>();
                edgeData.put("id", firstNotBlank(jsonText(edge, "id"), source + "->" + target));
                edgeData.put("source", source);
                edgeData.put("target", target);
                String condition = firstNotBlank(
                    jsonText(edge, "condition"),
                    jsonText(edge, "expression"),
                    jsonText(edge, "expr"),
                    jsonText(edge, "label")
                );
                if (StringUtils.hasText(condition)) {
                    edgeData.put("label", condition);
                }
                edges.add(edgeData);
            }
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

    // ==================== P0-5: modelJson XSS 过滤 ====================

    /**
     * 递归清理 modelJson 中所有节点的文本字段，防止存储型 XSS
     * 清理范围：title、condition、description 以及 props 中的所有字符串值
     */
    private String sanitizeModelJson(String modelJson) {
        try {
            JsonNode root = objectMapper.readTree(modelJson);
            JsonNode sanitized = sanitizeJsonNode(root);
            return objectMapper.writeValueAsString(sanitized);
        } catch (Exception e) {
            log.warn("[sanitizeModelJson] XSS过滤失败，保留原始JSON: {}", e.getMessage());
            return modelJson;
        }
    }

    private JsonNode sanitizeJsonNode(JsonNode node) {
        if (node == null || node.isNull()) {
            return node;
        }
        if (node.isTextual()) {
            return objectMapper.getNodeFactory().textNode(securityUtils.sanitizeXss(node.asText()));
        }
        if (node.isArray()) {
            ArrayNode arrayNode = objectMapper.createArrayNode();
            for (JsonNode child : node) {
                arrayNode.add(sanitizeJsonNode(child));
            }
            return arrayNode;
        }
        if (node.isObject()) {
            ObjectNode objectNode = objectMapper.createObjectNode();
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                objectNode.set(entry.getKey(), sanitizeJsonNode(entry.getValue()));
            }
            return objectNode;
        }
        return node;
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
            JsonNode graphRoot = objectMapper.readTree(modelJson);
            if (!workflowModelBridge.isGraphModel(graphRoot)) {
                throw WorkflowException.validationError("仅支持 nodes+edges 图模型");
            }

            JsonNode nodesNode = graphRoot.path("nodes");
            JsonNode edgesNode = graphRoot.path("edges");
            if (!nodesNode.isArray() || nodesNode.isEmpty()) {
                throw WorkflowException.validationError("流程图节点不能为空");
            }
            if (!edgesNode.isArray()) {
                throw WorkflowException.validationError("流程图边结构无效");
            }

            Map<String, JsonNode> nodeMap = new LinkedHashMap<>();
            Map<String, Integer> outgoingCount = new HashMap<>();
            for (JsonNode node : nodesNode) {
                String nodeId = jsonText(node, "id");
                if (!StringUtils.hasText(nodeId)) {
                    throw WorkflowException.validationError("存在未配置 id 的流程节点");
                }
                if (nodeMap.containsKey(nodeId)) {
                    throw WorkflowException.validationError("检测到重复节点ID: " + nodeId);
                }
                nodeMap.put(nodeId, node);
                outgoingCount.put(nodeId, 0);
                validateNodeModel(node);
            }

            for (JsonNode edge : edgesNode) {
                String source = firstNotBlank(jsonText(edge, "source"), jsonText(edge, "from"));
                String target = firstNotBlank(jsonText(edge, "target"), jsonText(edge, "to"));
                if (!StringUtils.hasText(source) || !StringUtils.hasText(target)) {
                    throw WorkflowException.validationError("存在 source/target 缺失的连线");
                }
                if (!nodeMap.containsKey(source) || !nodeMap.containsKey(target)) {
                    throw WorkflowException.validationError("流程图连线引用了不存在的节点: " + source + " -> " + target);
                }
                outgoingCount.put(source, outgoingCount.getOrDefault(source, 0) + 1);
            }

            // P0-3: PARALLEL 节点会签模式与分支互斥校验（图模型：分支 = 多条外连线）
            for (Map.Entry<String, JsonNode> entry : nodeMap.entrySet()) {
                JsonNode node = entry.getValue();
                if (!"PARALLEL".equalsIgnoreCase(jsonText(node, "type"))) {
                    continue;
                }
                String signType = jsonText(node, "signType");
                boolean hasSignType = StringUtils.hasText(signType)
                    && ("ALL".equals(signType) || "ANY".equals(signType)
                    || "PERCENT".equals(signType) || "SEQUENTIAL".equals(signType));
                int branchCount = outgoingCount.getOrDefault(entry.getKey(), 0);
                if (hasSignType && branchCount > 1) {
                    throw WorkflowException.validationError(
                        "并行节点 [" + firstNotBlank(jsonText(node, "title"), jsonText(node, "label"), entry.getKey())
                        + "] 同时配置了会签模式(" + signType
                        + ")和分支(" + branchCount + "个)，两者互斥，请移除分支或取消会签配置");
                }
            }
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            throw WorkflowException.validationError("流程模型解析失败: " + e.getMessage());
        }
    }

    private void validateNodeModel(JsonNode node) {
        String nodeType = jsonText(node, "type");
        String nodeTitle = firstNotBlank(jsonText(node, "title"), jsonText(node, "label"), jsonText(node, "id"), "未命名节点");
        String approverType = jsonText(node, "approverType");
        String approverValue = jsonText(node, "approverValue");

        if ("APPROVAL".equalsIgnoreCase(nodeType) && !StringUtils.hasText(approverType)) {
            throw WorkflowException.validationError("审批节点 [" + nodeTitle + "] 未配置审批人");
        }
        if ("MANUAL".equalsIgnoreCase(nodeType) && !StringUtils.hasText(approverType)) {
            throw WorkflowException.validationError("人工任务节点 [" + nodeTitle + "] 未配置处理人");
        }

        // P1-5: COPY（抄送）节点校验 — 必须配置抄送人
        if ("COPY".equalsIgnoreCase(nodeType)) {
            boolean hasApproverType = StringUtils.hasText(approverType);
            boolean requiresApproverValue = hasApproverType
                    && !"DIRECT_LEADER".equals(approverType)
                    && !"DEPT_MANAGER".equals(approverType);
            boolean hasApproverValue = StringUtils.hasText(approverValue);

            // 兼容历史模型字段（copyUserIds/copyRoleKey/copyDeptId）
            JsonNode propsNode = node.path("props");
            JsonNode legacyUserIds = propsNode.get("copyUserIds");
            boolean hasLegacyUserIds = false;
            if (legacyUserIds != null && !legacyUserIds.isNull()) {
                if (legacyUserIds.isTextual()) {
                    hasLegacyUserIds = StringUtils.hasText(legacyUserIds.asText());
                } else if (legacyUserIds.isArray()) {
                    hasLegacyUserIds = legacyUserIds.size() > 0;
                }
            }
            JsonNode legacyRoleKey = propsNode.get("copyRoleKey");
            JsonNode legacyDeptId = propsNode.get("copyDeptId");
            boolean hasLegacyCopyConfig = propsNode != null && !propsNode.isMissingNode() && (
                    hasLegacyUserIds
                            || (legacyRoleKey != null && legacyRoleKey.isTextual() && StringUtils.hasText(legacyRoleKey.asText()))
                            || (legacyDeptId != null && ((legacyDeptId.isTextual() && StringUtils.hasText(legacyDeptId.asText())) || legacyDeptId.isNumber()))
            );

            boolean validByApprover = hasApproverType && (!requiresApproverValue || hasApproverValue);
            if (!validByApprover && !hasLegacyCopyConfig) {
                throw WorkflowException.validationError(
                        "抄送节点 [" + nodeTitle + "] 未配置抄送人（请设置 approverType，且在需要时设置 approverValue）");
            }
        }

        // P1-6: NOTIFICATION（通知）节点校验 — 必须配置通知标题或内容
        if ("NOTIFICATION".equalsIgnoreCase(nodeType)) {
            JsonNode propsNode = node.path("props");
            boolean hasTitle = StringUtils.hasText(jsonText(propsNode, "notificationTitle"));
            boolean hasContent = StringUtils.hasText(jsonText(propsNode, "notificationContent"));
            if (!hasTitle && !hasContent) {
                throw WorkflowException.validationError("通知节点 [" + nodeTitle + "] 未配置通知标题或内容");
            }
        }
    }

    private String jsonText(JsonNode node, String field) {
        if (node == null || node.isNull() || node.isMissingNode() || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        String value = node.get(field).asText();
        return StringUtils.hasText(value) ? value : null;
    }

    private String firstNotBlank(String... values) {
        if (values == null || values.length == 0) {
            return null;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }
}
