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
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfDeployRecordMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfProcessVersionSnapshotMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
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
    private WfProcessVersionSnapshotMapper versionSnapshotMapper;
    @Autowired
    private WorkflowPermissionService permissionService;
    @Autowired
    private WorkflowAuditService auditService;
    @Autowired
    private JsonSchemaValidator jsonSchemaValidator;
    @Autowired
    private WorkflowSecurityUtils securityUtils;

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

        // JSON 结构校验
        if (StringUtils.hasText(definition.getModelJson())) {
            jsonSchemaValidator.validateProcessDefinitionJson(definition.getModelJson());
            validateModelIntegrity(definition.getModelJson());
        }

        // 权限校验
        permissionService.checkDefinitionPermission("保存");

        // 查找当前Key的最大版本
        WfProcessDefinition lastDef = processDefinitionMapper.selectOne(
            new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, definition.getProcessKey())
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1")
        );

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
        auditService.log(WorkflowAuditService.AuditAction.DEFINITION_CREATE, definition.getDefinitionId(),
            "processKey=" + definition.getProcessKey() + ", version=" + version);
        return R.ok(definition.getDefinitionId());
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
        if ("PUBLISHED".equals(def.getStatus())) {
            throw WorkflowException.invalidState("流程定义已发布，无需重复发布");
        }
        if (!StringUtils.hasText(def.getModelJson())) {
            throw WorkflowException.validationError("流程定义模型为空，无法发布");
        }

        // 发布前完整性检查
        jsonSchemaValidator.validateProcessDefinitionJson(def.getModelJson());

        // 更新状态
        def.setStatus("PUBLISHED");
        def.setVersionLock(def.getVersionLock() != null ? def.getVersionLock() + 1 : 1);
        processDefinitionMapper.updateById(def);

        // 旧版本归档
        processDefinitionMapper.update(null,
            new LambdaUpdateWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, def.getProcessKey())
                .ne(WfProcessDefinition::getDefinitionId, definitionId)
                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                .set(WfProcessDefinition::getStatus, "ARCHIVED")
        );

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

        // 检查运行中的实例
        Long runningCount = processInstanceMapper.selectCount(
            new LambdaQueryWrapper<WfProcessInstance>()
                .eq(WfProcessInstance::getProcessDefKey, def.getProcessKey())
                .eq(WfProcessInstance::getStatus, WfProcessStatus.RUNNING.getCode())
        );
        if (runningCount != null && runningCount > 0) {
            throw WorkflowException.invalidState("该流程定义有 " + runningCount + " 个运行中的实例，无法删除");
        }

        // 检查历史实例
        Long totalCount = processInstanceMapper.selectCount(
            new LambdaQueryWrapper<WfProcessInstance>()
                .eq(WfProcessInstance::getProcessDefKey, def.getProcessKey())
        );
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
        return def;
    }

    @Override
    public PageResult<WfProcessDefinition> listProcessDefinitions(PageQuery pageQuery) {
        Page<WfProcessDefinition> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfProcessDefinition> queryWrapper = new LambdaQueryWrapper<>();

        String status = (String) pageQuery.getParams().get("status");
        if (StringUtils.hasText(status)) {
            queryWrapper.eq(WfProcessDefinition::getStatus, status);
        }

        String keyword = (String) pageQuery.getParams().get("keyword");
        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(w -> w
                .like(WfProcessDefinition::getProcessName, keyword)
                .or()
                .like(WfProcessDefinition::getProcessKey, keyword)
            );
        }

        String showLatestOnly = (String) pageQuery.getParams().get("latestOnly");
        if (!"false".equals(showLatestOnly)) {
            queryWrapper.eq(WfProcessDefinition::getIsLatest, 1);
        }

        String category = (String) pageQuery.getParams().get("category");
        if (StringUtils.hasText(category)) {
            queryWrapper.eq(WfProcessDefinition::getCategory, category);
        }

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

    // ==================== 私有方法 ====================

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
        validateNodeConnections(node.getNext(), visited, depth + 1);
        if (node.getBranches() != null) {
            for (WfNodeConfig branch : node.getBranches()) {
                validateNodeConnections(branch, visited, depth + 1);
            }
        }
    }
}
