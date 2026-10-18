package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.SerializationFeature;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Collection;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.security.MessageDigest;
import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class WorkflowHParticipantPolicy {
    private static final Set<String> BUSINESS_TYPES = Set.of(
            "HR_OVERTIME", "HR_SHIFT_REQUEST", "HR_REFERRAL", "HR_ADVANCE", "HR_SETTLEMENT", "OFFER", "OA_CONSUMABLE_REQUEST", "OA_MEETING_BOOKING", "crm_refund");
    private static final String EXCLUDED_USERS = "_hExcludedUserIds";
    private static final String FROZEN_DEFINITION = "_hDefinition";
    private static final String CORRECTION_APPROVERS = "hCorrectionApproverIds";
    private static final Set<String> OFFER_FIELDS = Set.of("candidateId", "candidateName", "positionId", "positionName", "salary", "expectedOnboardDate", "offerTermsDigest");
    private static final Set<String> PROTECTED_VARIABLES = Set.of(
            "businessType", "businessId", "businessKey", "businessNo", "callbackStreamKey",
            "tenantId", "startUserId", "startUserName", "applicantUserId", "applicantId",
            "employeeId", "deptId", "requestId", "requestNo", "requestMode", "swapEmployeeId",
            "swapUserId", "peerUserId", "approverIds", "responsibleApproverIds", "hrApproverIds",
            "nodeAssignees", "_nodeAssignees", "processKey", "processDefKey", "definitionId",
            "definitionVersion", "modelDigest", "approvalRequired", "approvalMode", "correctionId",
            "overtimeRequestId", "originalSlipId", "roomId", "meetingTitle", "startTime", "endTime", "scheduleVersion", "oaRequestToken",
            "refundApproval", "customerOwnerApproverIds", "financeReviewerIds", "approvalId", "approvalNo",
            "businessRefType", "businessRefId", "businessRefName", "actionType", "referralId", "beneficiaryUserId", "offerApproverIds", "advanceId", "financeApproverIds",
            "settlementId", "settlementRevision", "settlementEmployeeUserId", CORRECTION_APPROVERS, EXCLUDED_USERS, FROZEN_DEFINITION);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final WfProcessInstanceMapper instanceMapper;
    private final SysUserMapper userMapper;
    private final WorkflowNodePolicy nodePolicy;
    private final WfProcessDefinitionMapper definitionMapper;
    private final SysRoleMapper roleMapper;
    private final SysUserRoleMapper userRoleMapper;
    private final WfTaskHistoryMapper historyMapper;

    public void assertStart(Long tenantId, Long startUserId, Map<String, Object> variables,
                            Map<String, List<Long>> nodeAssignees) {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setTenantId(tenantId);
        instance.setStartUserId(startUserId);
        Context context = contract(instance, variables);
        if (context == null) return;
        if (nodeAssignees != null && !nodeAssignees.isEmpty()
                || variables.containsKey("nodeAssignees") || variables.containsKey("_nodeAssignees")) {
            throw failure("H_ASSIGNEE_OVERRIDE_FORBIDDEN", "H 审批人必须来自服务端冻结变量，不能由发起人选择");
        }
        if (settlement(context)) {
            assertActive(tenantId, List.of(startUserId));
            Long employeeUser = stringId(variables.get("settlementEmployeeUserId"));
            List<SysUser> existing = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getTenantId, tenantId).eq(SysUser::getDeleted, 0).eq(SysUser::getUserId, employeeUser));
            if (existing.size() != 1 || !Objects.equals(existing.get(0).getUserId(), employeeUser)) throw failure("H_EXCLUSIONS_INVALID", "离职本人须为本租户真实账号，停用账号仍须回避");
        } else assertActive(tenantId, context.excluded());
    }

    public Map<String, Object> freezeStartDefinition(Long tenantId, Long startUserId,
                                                    Map<String, Object> variables, WfProcessDefinition definition) {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setTenantId(tenantId);
        instance.setStartUserId(startUserId);
        Context context = contract(instance, variables);
        if (context == null) return variables;
        if (variables.containsKey(FROZEN_DEFINITION)) {
            throw failure("H_IDENTITY_OVERRIDE_FORBIDDEN", "模型冻结标识只能由工作流服务写入");
        }
        if (definition == null || !Objects.equals(tenantId, definition.getTenantId())
                || !StringUtils.hasText(definition.getDefinitionId()) || definition.getVersion() == null
                || definition.getVersion() < 1 || !StringUtils.hasText(definition.getProcessKey())) {
            throw failure("H_MODEL_INVALID", "H 审批缺少本租户有效流程定义");
        }
        String digest = modelDigest(definition);
        if (context.hr() || context.correction() || offer(context) || refund(context) || variables.containsKey("modelDigest")) {
            if (!Objects.equals(variables.get("definitionId"), definition.getDefinitionId())
                    || !Objects.equals(String.valueOf(variables.get("definitionVersion")), definition.getVersion().toString())
                    || !Objects.equals(variables.get("modelDigest"), digest)) {
                throw failure("H_MODEL_SNAPSHOT_CONFLICT", "实际启动模型与业务冻结快照不一致，请重新核实审批依据");
            }
        }
        validateGraph(context, definition);
        Map<String, Object> frozen = new LinkedHashMap<>(variables);
        frozen.put(FROZEN_DEFINITION, Map.of("definitionId", definition.getDefinitionId(),
                "definitionVersion", definition.getVersion().toString(), "processKey", definition.getProcessKey(), "modelDigest", digest));
        return frozen;
    }

    public List<Long> resolveFrozenAssignees(WfProcessInstance instance, WfNodeConfig node) {
        if (instance == null || !StringUtils.hasText(instance.getInstanceId())) return null;
        Context context = persisted(instance);
        if (context == null || !context.correction() && !offer(context) && !refund(context)) return null;
        return assignmentList(context, node);
    }

    public void assertTaskVariables(WfProcessInstance instance, Map<String, Object> submitted) {
        Context context = persisted(instance);
        if (context != null) assertSubmittedVariables(context, submitted);
    }

    public void assertRuntimeVariables(WfProcessInstance instance, Map<String, Object> variables) {
        Context context = persisted(instance);
        if (context == null) return;
        assertFrozen(context, variables);
        assertFrozen(context, readVariables(instance));
    }

    public void assertNodeExecution(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
        Context context = persisted(instance);
        if (context == null) return;
        assertFrozen(context, variables);
        assertFrozen(context, readVariables(instance));
        if (node == null) return;
        WfNodeConfig persistedNode = nodePolicy.resolveNode(context.instance(), node.getId());
        if (!StringUtils.hasText(context.instance().getDefinitionId()) || persistedNode == null
                || !Objects.equals(node.getType(), persistedNode.getType())) {
            throw failure("H_NODE_UNSAFE", "运行节点与冻结的流程定义不一致");
        }
        if ("APPROVAL".equals(node.getType())) {
            expectedApprovers(context, node);
        } else if ("END".equals(node.getType()) && (context.hr() || context.correction() || offer(context) || meeting(context) || refund(context))) {
            assertCompletedStages(context);
        } else if ("MANUAL".equals(node.getType()) || (context.hr() || context.correction() || offer(context) || meeting(context) || refund(context))
                && !"START".equals(node.getType()) && !"END".equals(node.getType())) {
            throw failure("H_NODE_UNSAFE", "业务审批只允许已确认的开始、审批和结束节点");
        }
    }

    public void assertAssignees(WfProcessInstance instance, WfNodeConfig node, Collection<Long> assignees) {
        Context context = persisted(instance);
        if (context == null) return;
        assertFrozen(context, readVariables(instance));
        List<Long> expected = assignmentList(context, node);
        if (assignees == null || assignees.isEmpty() || assignees.size() != new LinkedHashSet<>(assignees).size()
                || !new LinkedHashSet<>(assignees).equals(new LinkedHashSet<>(expected))) {
            throw failure("H_APPROVER_INVALID", "节点审批人必须完整匹配服务端冻结名单，不能为空、替换或自动跳过");
        }
        assertActive(context.instance().getTenantId(), assignees);
    }

    public void assertTaskAssignment(WfTask task, Long assigneeId) {
        Context context = taskContext(task);
        if (context == null) return;
        assertTarget(context, task.getNodeKey(), assigneeId);
    }

    public void assertTaskAction(WfTask task, Long operatorId, Map<String, Object> submitted) {
        Context context = taskContext(task);
        if (context == null) return;
        assertSubmittedVariables(context, submitted);
        assertHuman(context, operatorId);
        assertTarget(context, task.getNodeKey(), task.getAssignee());
        assertTarget(context, task.getNodeKey(), operatorId);
    }

    public void assertParticipantChange(WfTask task, Collection<Long> targetUserIds) {
        Context context = taskContext(task);
        if (context == null) return;
        if (context.hr() || context.correction() || offer(context) || meeting(context) || refund(context)) {
            throw failure("H_PARTICIPANT_CHANGE_FORBIDDEN", "业务审批名单已冻结，禁止转办、委派、代理和自动改派");
        }
        if (targetUserIds == null || targetUserIds.isEmpty()) {
            throw failure("H_APPROVER_MISSING", "H 任务不能移交给空审批人");
        }
        for (Long userId : targetUserIds) assertTarget(context, task.getNodeKey(), userId);
    }

    public String refundDecision(WfTask task, String action) {
        Context context = taskContext(task);
        if (context == null || !refund(context)) return null;
        WfNodeConfig node = nodePolicy.resolveNode(context.instance(), task.getNodeKey());
        if (node == null || !"financeReviewerIds".equals(node.getApproverValue()) || !Set.of("APPROVE", "REJECT").contains(action))
            throw failure("H_TASK_ROUTE_UNSAFE", "退款复核只能由独立财务实际同意或拒绝");
        assertTaskAction(task, UserContext.getUserId(), null);
        return "APPROVE".equals(action) ? "PASSED" : "REJECTED";
    }

    public void assertFrozenParticipants(String instanceId) {
        if (persisted(instanceId) != null) {
            throw failure("H_PARTICIPANT_CHANGE_FORBIDDEN", "H 审批名单已冻结，禁止加减签或候选人替代");
        }
    }

    public void assertNoDirectCompletion(WfTask task) {
        if (taskContext(task) != null) {
            throw failure("H_TASK_ROUTE_UNSAFE", "H 审批必须经标准任务办理入口，不能绕过流程推进及业务回调");
        }
    }

    public void assertNoAutomaticSkip(WfProcessInstance instance) {
        if (persisted(instance) != null) {
            throw failure("H_AUTOMATIC_APPROVAL_FORBIDDEN", "H 审批必须由独立审批人实际办理，不能自动跳过");
        }
    }

    public void assertCompletion(WfProcessInstance instance, String status) {
        Context context = persisted(instance);
        if (context == null) return;
        assertFrozen(context, readVariables(instance));
        if (!Set.of("PASSED", "AUTO_PASSED", "REJECTED").contains(status)) return;
        Long operatorId = UserContext.getUserId();
        assertHuman(context, operatorId);
        Collection<Long> allowed = !"REJECTED".equals(status) && (context.hr() || refund(context))
                ? context.approvers().get(context.hr() ? advance(context) || settlement(context) ? "financeApproverIds" : "hrApproverIds" : "financeReviewerIds") : allApprovers(context);
        if (!allowed.contains(operatorId) || "AUTO_PASSED".equals(status)) {
            throw failure("H_APPROVER_INVALID", "H 终审必须由冻结名单中的真实终审人完成");
        }
        if ("PASSED".equals(status) && (context.hr() || context.correction() || offer(context) || meeting(context) || refund(context))) {
            assertCompletedStages(context);
        }
    }

    private Context taskContext(WfTask task) {
        if (task == null) throw failure("H_TASK_MISSING", "无法核实任务身份");
        Context context = persisted(task.getInstanceId());
        if (context != null && !Objects.equals(context.instance().getTenantId(), task.getTenantId())) {
            throw failure("H_TENANT_MISMATCH", "任务与流程实例的租户不一致");
        }
        return context;
    }

    private Context persisted(WfProcessInstance instance) {
        if (instance == null) throw failure("H_INSTANCE_MISSING", "无法核实流程实例身份");
        Context context = persisted(instance.getInstanceId());
        if (context != null && (!Objects.equals(instance.getTenantId(), context.instance().getTenantId())
                || !Objects.equals(instance.getStartUserId(), context.instance().getStartUserId())
                || !Objects.equals(instance.getDefinitionId(), context.instance().getDefinitionId()))) {
            throw failure("H_IDENTITY_MISMATCH", "流程身份与持久化记录不一致");
        }
        return context;
    }

    private Context persisted(String instanceId) {
        WfProcessInstance instance = StringUtils.hasText(instanceId) ? instanceMapper.selectById(instanceId) : null;
        if (instance == null) throw WorkflowException.instanceNotFound(instanceId);
        Context context = contract(instance, readVariables(instance));
        if (context != null) assertDefinition(context);
        return context;
    }

    private Context contract(WfProcessInstance instance, Map<String, Object> variables) {
        if (variables == null) return null;
        Object businessType = variables.get("businessType");
        boolean correction = "HR_PAYROLL_CORRECTION".equals(businessType)
                && (variables.containsKey(EXCLUDED_USERS) || variables.containsKey(CORRECTION_APPROVERS) || variables.containsKey(FROZEN_DEFINITION));
        if (!(businessType instanceof String type) || !BUSINESS_TYPES.contains(type) && !correction) {
            if (variables.containsKey(EXCLUDED_USERS) || variables.containsKey(CORRECTION_APPROVERS) || variables.containsKey(FROZEN_DEFINITION)) {
                throw failure("H_IDENTITY_MISSING", "H 实例缺少合法业务类型");
            }
            return null;
        }
        Long tenantId = instance.getTenantId();
        Long startUserId = instance.getStartUserId();
        if (tenantId == null || tenantId <= 0 || startUserId == null || startUserId <= 0) {
            throw failure("H_IDENTITY_MISSING", "H 实例缺少有效租户或原申请人");
        }
        List<Long> excluded = stringIds(variables.get(EXCLUDED_USERS));
        int participantCount = 1;
        if ("HR_SHIFT_REQUEST".equals(type)) {
            Object mode = variables.get("requestMode");
            if (!"SINGLE".equals(mode) && !"SWAP".equals(mode)) {
                throw failure("H_IDENTITY_MISSING", "调班流程必须携带服务端确认的 requestMode");
            }
            participantCount = "SWAP".equals(mode) ? 2 : 1;
        }
        boolean settlement = "HR_SETTLEMENT".equals(type);
        boolean hr = "HR_OVERTIME".equals(type) || "HR_SHIFT_REQUEST".equals(type) || "HR_REFERRAL".equals(type) || "HR_ADVANCE".equals(type) || settlement;
        if (settlement) {
            Long employeeUser = stringId(variables.get("settlementEmployeeUserId"));
            Long settlementId = stringId(variables.get("settlementId")); stringId(variables.get("employeeId"));
            Long revision = stringId(variables.get("settlementRevision"));
            if (revision > Integer.MAX_VALUE || !Objects.equals(String.valueOf(variables.get("businessId")), settlementId.toString())
                    || employeeUser.equals(startUserId) || !excluded.contains(employeeUser)) throw failure("H_EXCLUSIONS_INVALID", "结算须绑定真实单据和轮次，并排除提交人与离职本人");
            String expectedKey = "HR_SETTLEMENT:" + settlementId + ":R" + revision;
            if (StringUtils.hasText(instance.getBusinessKey()) && !expectedKey.equals(instance.getBusinessKey())) throw failure("H_IDENTITY_INVALID", "结算审批业务键与轮次不一致");
            participantCount = 2;
        }
        if ("HR_ADVANCE".equals(type)) { stringId(variables.get("advanceId")); stringId(variables.get("employeeId")); }
        if ("HR_REFERRAL".equals(type)) {
            Long beneficiary = stringId(variables.get("beneficiaryUserId"));
            participantCount = Objects.equals(beneficiary, startUserId) ? 1 : 2;
            if (!excluded.contains(beneficiary)) throw failure("H_EXCLUSIONS_INVALID", "内推奖金审批须排除推荐人");
            stringId(variables.get("referralId"));
        }
        boolean refund = "crm_refund".equals(type);
        Long applicant = stringId(variables.get(hr || correction || "OFFER".equals(type) ? "applicantUserId" : "applicantId"));
        if (!Objects.equals(applicant, startUserId) || excluded.size() != participantCount || !excluded.contains(startUserId)) {
            throw failure("H_EXCLUSIONS_INVALID", "排除名单必须包含原申请人，互换调班还必须包含对方登录用户");
        }
        Map<String, List<Long>> approvers = new LinkedHashMap<>();
        for (String field : settlement ? List.of("financeApproverIds") : hr ? List.of("responsibleApproverIds", "HR_ADVANCE".equals(type) ? "financeApproverIds" : "hrApproverIds")
                : refund ? List.of("customerOwnerApproverIds", "financeReviewerIds")
                : List.of(correction ? CORRECTION_APPROVERS : "OFFER".equals(type) ? "offerApproverIds" : "approverIds")) {
            List<Long> users = stringIds(variables.get(field));
            if (hr && !"financeApproverIds".equals(field) && users.size() != 1) throw failure("H_APPROVER_INVALID", "HR 首审节点必须配置一位独立审批人");
            if (refund && "customerOwnerApproverIds".equals(field) && users.size() != 1)
                throw failure("H_APPROVER_INVALID", "退款首审必须是唯一的客户业务负责人");
            approvers.put(field, users);
        }
        Set<Long> uniqueApprovers = new LinkedHashSet<>();
        for (List<Long> users : approvers.values()) {
            for (Long userId : users) {
                if (!uniqueApprovers.add(userId) || excluded.contains(userId)) {
                    throw failure("H_SELF_APPROVAL_FORBIDDEN", "审批人必须互不重复，并排除原申请人及互换对方");
                }
            }
        }
        assertActive(tenantId, uniqueApprovers);
        if (correction) assertFinance(tenantId, uniqueApprovers);
        if ("OFFER".equals(type)) assertRole(tenantId, uniqueApprovers, "admin");
        if (refund) assertFinance(tenantId, new LinkedHashSet<>(approvers.get("financeReviewerIds")));
        if ("HR_ADVANCE".equals(type) || settlement) assertFinance(tenantId, new LinkedHashSet<>(approvers.get("financeApproverIds")));
        return new Context(instance, variables, hr, correction, new LinkedHashSet<>(excluded), approvers);
    }

    private List<Long> expectedApprovers(Context context, WfNodeConfig suppliedNode) {
        if (!StringUtils.hasText(context.instance().getDefinitionId()) || suppliedNode == null) {
            throw failure("H_NODE_UNSAFE", "H 审批缺少冻结的流程定义或审批节点");
        }
        WfNodeConfig node = nodePolicy.resolveNode(context.instance(), suppliedNode.getId());
        boolean financeRole = node != null && "ROLE".equals(node.getApproverType())
                && (context.correction() && "finance".equals(node.getApproverValue()) || offer(context) && "admin".equals(node.getApproverValue()));
        if (node == null || !"APPROVAL".equals(node.getType()) || !financeRole && !"VARIABLE_USER".equals(node.getApproverType())
                || !Objects.equals(node.getApproverType(), suppliedNode.getApproverType())
                || !Objects.equals(node.getApproverValue(), suppliedNode.getApproverValue())
                || !Objects.equals(node.getSignType(), suppliedNode.getSignType())
                || !Objects.equals(node.getPassPercent(), suppliedNode.getPassPercent())
                || !Objects.equals(node.getPassWeight(), suppliedNode.getPassWeight())
                || !financeRole && !context.approvers().containsKey(node.getApproverValue()) || "AUTO_SKIP".equals(node.getApproveSelf())) {
            throw failure("H_NODE_UNSAFE", "H 审批节点必须使用冻结的服务端审批人变量，禁止自动跳过");
        }
        if ((context.hr() || meeting(context) || refund(context)) && (!explicitlyDisabled(node, "allowDelegate", node.getAllowDelegate())
                || !explicitlyDisabled(node, "allowAddSign", node.getAllowAddSign()))) {
            throw failure("H_NODE_UNSAFE", "业务审批模型必须明确禁止转办和加签");
        }
        if (refund(context) && ("financeReviewerIds".equals(node.getApproverValue())
                ? !"ANY".equals(node.getSignType()) : StringUtils.hasText(node.getSignType())))
            throw failure("H_NODE_UNSAFE", "退款须由唯一客户负责人首审，再由另一名财务实际复核");
        if (context.hr() || context.correction() || offer(context) || meeting(context) || refund(context)) {
            Map<String, String> previousStages = new LinkedHashMap<>();
            for (Map.Entry<String, String> stage : validateGraph(context, assertDefinition(context)).entrySet()) {
                if (Objects.equals(stage.getValue(), node.getId())) break;
                previousStages.put(stage.getKey(), stage.getValue());
            }
            assertStagesApproved(context, previousStages);
        }
        return context.approvers().get(financeRole ? offer(context) ? "offerApproverIds" : CORRECTION_APPROVERS : node.getApproverValue());
    }

    private List<Long> assignmentList(Context context, WfNodeConfig node) {
        List<Long> expected = expectedApprovers(context, node);
        return (context.correction() || offer(context)) && !StringUtils.hasText(node.getSignType()) ? List.of(expected.get(0)) : expected;
    }

    private boolean offer(Context context) { return "OFFER".equals(context.variables().get("businessType")); }

    private void assertFinance(Long tenantId, Set<Long> userIds) { assertRole(tenantId, userIds, "finance"); }

    private void assertRole(Long tenantId, Set<Long> userIds, String roleKey) {
        List<SysRole> roles = roleMapper.selectList(new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getTenantId, tenantId).eq(SysRole::getRoleKey, roleKey)
                .eq(SysRole::getStatus, "0").eq(SysRole::getDeleted, 0));
        if (roles.size() != 1) throw failure("H_FINANCE_UNAVAILABLE", "当前租户没有唯一有效的所需审批角色");
        List<SysUserRole> members = userRoleMapper.selectList(new LambdaQueryWrapper<SysUserRole>()
                .eq(SysUserRole::getTenantId, tenantId).eq(SysUserRole::getRoleId, roles.get(0).getRoleId())
                .in(SysUserRole::getUserId, userIds));
        Set<Long> qualified = new LinkedHashSet<>();
        members.forEach(member -> qualified.add(member.getUserId()));
        if (!qualified.equals(userIds)) throw failure("H_FINANCE_UNAVAILABLE", "冻结审批人已失去本租户所需审批资格");
    }

    private WfProcessDefinition assertDefinition(Context context) {
        Object value = context.variables().get(FROZEN_DEFINITION);
        if (!(value instanceof Map<?, ?> snapshot) || snapshot.size() != 4) {
            throw failure("H_MODEL_UNFROZEN", "H 实例缺少工作流服务冻结的模型依据");
        }
        WfProcessDefinition definition = definitionMapper.selectById(context.instance().getDefinitionId());
        if (definition == null || !Objects.equals(context.instance().getTenantId(), definition.getTenantId())
                || !Objects.equals(snapshot.get("definitionId"), definition.getDefinitionId())
                || !Objects.equals(snapshot.get("definitionVersion"), String.valueOf(definition.getVersion()))
                || !Objects.equals(snapshot.get("processKey"), definition.getProcessKey())
                || !Objects.equals(snapshot.get("modelDigest"), modelDigest(definition))) {
            throw failure("H_MODEL_DRIFT", "审批模型已发布变更、迁移或被修改，已阻止跳过冻结审批阶段");
        }
        return definition;
    }

    private Map<String, String> validateGraph(Context context, WfProcessDefinition definition) {
        JsonNode model = readModel(definition);
        if (!context.hr() && !context.correction() && !offer(context) && !meeting(context) && !refund(context)) return Map.of();
        JsonNode nodes = model.path("nodes");
        JsonNode edges = model.path("edges");
        int count = context.hr() && !settlement(context) || refund(context) ? 4 : 3;
        if (!nodes.isArray() || nodes.size() != count || !edges.isArray() || edges.size() != count - 1) {
            throw failure("H_MODEL_UNSAFE", "H 审批必须包含完整且唯一的顺序审批链");
        }
        Map<String, String> stages = new LinkedHashMap<>();
        Set<String> nodeIds = new LinkedHashSet<>();
        for (JsonNode node : nodes) {
            String nodeId = node.path("id").asText();
            if (!StringUtils.hasText(nodeId) || !nodeIds.add(nodeId)) throw failure("H_MODEL_UNSAFE", "H 模型节点标识缺失或重复");
            assertManualModel(node);
            String type = node.path("type").asText();
            String stage = type;
            if ("APPROVAL".equals(type)) {
                String approverType = node.path("approverType").asText();
                String approverValue = node.path("approverValue").asText();
                if (context.hr() || refund(context)) {
                    if (!"VARIABLE_USER".equals(approverType) || !context.approvers().containsKey(approverValue)
                            || !disabledModelFlag(node, "allowDelegate") || !disabledModelFlag(node, "allowAddSign")) {
                        throw failure("H_MODEL_UNSAFE", "业务模型必须使用两段冻结审批且禁止转办和加签");
                    }
                    if (refund(context) && ("financeReviewerIds".equals(approverValue)
                            ? !"ANY".equals(node.path("signType").asText()) : StringUtils.hasText(node.path("signType").asText(""))))
                        throw failure("H_MODEL_UNSAFE", "退款模型须为客户负责人单人首审及其他财务任一人复核");
                    if (refund(context)) assertRefundModel(node, approverValue);
                    if (advance(context)) assertAdvanceModel(node, approverValue);
                    if (settlement(context)) assertAdvanceModel(node, "financeApproverIds");
                    stage = approverValue;
                } else if (offer(context)) {
                    if (!"ROLE".equals(approverType) || !"admin".equals(approverValue))
                        throw failure("H_MODEL_UNSAFE", "录用须由冻结管理员名单实际审批");
                    stage = "offerApproverIds";
                } else if (meeting(context)) {
                    if (!"VARIABLE_USER".equals(approverType) || !"approverIds".equals(approverValue)
                            || !disabledModelFlag(node, "allowDelegate") || !disabledModelFlag(node, "allowAddSign")) {
                        throw failure("H_MODEL_UNSAFE", "会议室审批须由冻结审批人办理且禁止转办加签");
                    }
                    stage = "approverIds";
                } else {
                    if (!("ROLE".equals(approverType) && "finance".equals(approverValue))
                            && !("VARIABLE_USER".equals(approverType) && CORRECTION_APPROVERS.equals(approverValue))) {
                        throw failure("H_MODEL_UNSAFE", "H 工资补正必须经过冻结财务名单审批");
                    }
                    stage = CORRECTION_APPROVERS;
                }
            } else if (!Set.of("START", "END").contains(type)) throw failure("H_MODEL_UNSAFE", "H 模型含未确认的审批路径");
            if (stages.put(stage, nodeId) != null) throw failure("H_MODEL_UNSAFE", "H 模型审批阶段重复");
        }
        List<String> order = settlement(context) ? List.of("START", "financeApproverIds", "END")
                : context.hr() ? List.of("START", "responsibleApproverIds", advance(context) ? "financeApproverIds" : "hrApproverIds", "END")
                : refund(context) ? List.of("START", "customerOwnerApproverIds", "financeReviewerIds", "END")
                : List.of("START", meeting(context) ? "approverIds" : offer(context) ? "offerApproverIds" : CORRECTION_APPROVERS, "END");
        if (!stages.keySet().equals(new LinkedHashSet<>(order))) throw failure("H_MODEL_UNSAFE", "H 模型缺少必经审批阶段");
        Set<String> expectedEdges = new LinkedHashSet<>();
        for (int index = 0; index < order.size() - 1; index++) expectedEdges.add(stages.get(order.get(index)) + ":" + stages.get(order.get(index + 1)));
        Set<String> actualEdges = new LinkedHashSet<>();
        for (JsonNode edge : edges) {
            assertUnconditional(edge);
            actualEdges.add(edge.path("source").asText() + ":" + edge.path("target").asText());
        }
        if (!actualEdges.equals(expectedEdges)) throw failure("H_MODEL_UNSAFE", "H 模型存在跳过或重排必经审批阶段的连线");
        Map<String, String> orderedStages = new LinkedHashMap<>();
        for (String stage : order) {
            if (context.approvers().containsKey(stage)) orderedStages.put(stage, stages.get(stage));
        }
        return orderedStages;
    }

    private boolean disabledModelFlag(JsonNode node, String field) {
        JsonNode value = node.has(field) ? node.path(field) : node.path("props").path(field);
        return value.isBoolean() && !value.booleanValue();
    }

    private boolean meeting(Context context) { return "OA_MEETING_BOOKING".equals(context.variables().get("businessType")); }

    private boolean refund(Context context) { return "crm_refund".equals(context.variables().get("businessType")); }

    private boolean advance(Context context) { return "HR_ADVANCE".equals(context.variables().get("businessType")); }

    private boolean settlement(Context context) { return "HR_SETTLEMENT".equals(context.variables().get("businessType")); }

    private void assertAdvanceModel(JsonNode node, String stage) {
        if ("financeApproverIds".equals(stage) ? !"ANY".equals(node.path("signType").asText())
                : StringUtils.hasText(node.path("signType").asText(""))) throw failure("H_MODEL_UNSAFE", "借款须部门负责人单人首审，独立财务任一人复核");
        for (JsonNode value : node.findValues("signType")) {
            if ("financeApproverIds".equals(stage) ? !"ANY".equals(value.asText()) : !value.isNull() && !value.asText().isBlank())
                throw failure("H_MODEL_UNSAFE", "借款审批方式不能由嵌套配置覆盖");
        }
        for (String field : List.of("allowDelegate", "allowAddSign", "allowAgent")) for (JsonNode value : node.findValues(field)) {
            if (!value.isNull() && (!value.isBoolean() || value.booleanValue())) throw failure("H_MODEL_UNSAFE", "借款禁止转办、加签或代理");
        }
    }

    private void assertRefundModel(JsonNode node, String stage) {
        for (JsonNode value : node.findValues("signType")) {
            if ("financeReviewerIds".equals(stage) ? !"ANY".equals(value.asText()) : !value.isNull() && !value.asText().isBlank())
                throw failure("H_MODEL_UNSAFE", "退款审批方式不能被嵌套配置覆盖");
        }
        for (String field : List.of("allowDelegate", "allowAddSign", "allowAgent")) {
            for (JsonNode value : node.findValues(field)) {
                if (!value.isNull() && (!value.isBoolean() || value.booleanValue()))
                    throw failure("H_MODEL_UNSAFE", "退款审批禁止转办、加签或代理");
            }
        }
    }

    private void assertUnconditional(JsonNode source) {
        for (String field : List.of("condition", "conditionExpression", "expression", "conditions")) {
            for (JsonNode value : source.findValues(field)) {
                if (!value.isNull() && !(value.isTextual() && value.asText().isBlank()) && !(value.isArray() && value.isEmpty())) {
                    throw failure("H_MODEL_UNSAFE", "H 模型不允许条件跳过必经审批");
                }
            }
        }
    }

    private void assertManualModel(JsonNode node) {
        assertUnconditional(node);
        for (JsonNode value : node.findValues("approveSelf")) {
            if ("AUTO_SKIP".equals(value.asText())) throw failure("H_MODEL_UNSAFE", "H 模型不允许自动跳过审批");
        }
        for (String field : List.of("allowSelection", "allowEdit", "allowRollback", "allowReduceSign")) {
            for (JsonNode value : node.findValues(field)) {
                if (!value.isNull() && (!value.isBoolean() || value.booleanValue())) throw failure("H_MODEL_UNSAFE", "H 模型不允许动态选人、改写依据或回退减签");
            }
        }
        for (String field : List.of("slaHours", "slaAction", "inputs", "outputs", "triggers", "retry")) {
            for (JsonNode value : node.findValues(field)) {
                if (!value.isNull() && !(value.isTextual() && value.asText().isBlank())
                        && !(value.isContainerNode() && value.isEmpty()) && !(value.isIntegralNumber() && value.longValue() == 0)) {
                    throw failure("H_MODEL_UNSAFE", "H 模型不允许自动审批或变量改写执行配置");
                }
            }
        }
    }

    private void assertCompletedStages(Context context) {
        assertStagesApproved(context, validateGraph(context, assertDefinition(context)));
    }

    private void assertStagesApproved(Context context, Map<String, String> stages) {
        if (stages.isEmpty()) return;
        List<WfTaskHistory> histories = historyMapper.selectList(new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getTenantId, context.instance().getTenantId())
                .eq(WfTaskHistory::getInstanceId, context.instance().getInstanceId())
                .in(WfTaskHistory::getAction, "APPROVE", "COUNTERSIGN_APPROVE"));
        if (refund(context) || advance(context) || settlement(context)) {
            assertRefundStagesApproved(context, stages, histories);
            return;
        }
        for (Map.Entry<String, String> stage : stages.entrySet()) {
            boolean approved = histories.stream().anyMatch(history -> Objects.equals(stage.getValue(), history.getNodeKey())
                    && Set.of("APPROVE", "COUNTERSIGN_APPROVE").contains(history.getAction())
                    && context.approvers().get(stage.getKey()).contains(history.getOperatorId())
                    && (history.getTaskType() == null || !history.getTaskType().startsWith("AUTO_"))
                    && (!refund(context) || history.getOnBehalfOfUserId() == null));
            if (!approved) throw failure("H_STAGE_INCOMPLETE", "缺少冻结审批节点的真实同意记录，不能跳阶段创建待办、办理或终审");
        }
    }

    private void assertRefundStagesApproved(Context context, Map<String, String> stages, List<WfTaskHistory> histories) {
        WfTaskHistory previous = null;
        for (Map.Entry<String, String> stage : stages.entrySet()) {
            WfTaskHistory first = previous;
            previous = histories.stream().filter(history -> Objects.equals(context.instance().getTenantId(), history.getTenantId())
                    && Objects.equals(context.instance().getInstanceId(), history.getInstanceId())
                    && Objects.equals(stage.getValue(), history.getNodeKey())
                    && Set.of("APPROVE", "COUNTERSIGN_APPROVE").contains(history.getAction())
                    && context.approvers().get(stage.getKey()).contains(history.getOperatorId())
                    && history.getOnBehalfOfUserId() == null && history.getCreateTime() != null
                    && (!settlement(context) || "COUNTERSIGN_APPROVE".equals(history.getAction()) && "OR_SIGN".equals(history.getTaskType()))
                    && StringUtils.hasText(history.getTaskId()) && StringUtils.hasText(history.getTaskType())
                    && !history.getTaskType().startsWith("AUTO_")
                    && (first == null || !Objects.equals(first.getTaskId(), history.getTaskId())
                        && !history.getCreateTime().isBefore(first.getCreateTime())))
                    .min(Comparator.comparing(WfTaskHistory::getCreateTime))
                    .orElseThrow(() -> failure("H_STAGE_INCOMPLETE", "缺少按顺序实际办理的负责人首审或独立财务复核记录"));
        }
    }

    private JsonNode readModel(WfProcessDefinition definition) {
        try {
            JsonNode model = JSON.readTree(definition.getModelJson());
            if (model == null || !model.isObject()) throw failure("H_MODEL_INVALID", "流程模型无效");
            return model;
        } catch (Exception failure) { throw failure("H_MODEL_INVALID", "流程模型无法安全读取"); }
    }

    private String modelDigest(WfProcessDefinition definition) {
        try {
            byte[] bytes = JSON.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true).writeValueAsBytes(readModel(definition));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception failure) { throw failure("H_MODEL_INVALID", "流程模型摘要无法生成"); }
    }

    private boolean explicitlyDisabled(WfNodeConfig node, String field, Boolean configured) {
        Object value = configured != null ? configured : node.getProps() == null ? null : node.getProps().get(field);
        return Boolean.FALSE.equals(value);
    }

    private void assertTarget(Context context, String nodeKey, Long userId) {
        WfNodeConfig node = nodePolicy.resolveNode(context.instance(), nodeKey);
        List<Long> expected = expectedApprovers(context, node);
        if (userId == null || context.excluded().contains(userId) || !expected.contains(userId)) {
            throw failure("H_APPROVER_INVALID", "办理人不在本节点冻结名单内，或属于必须排除的申请参与人");
        }
        assertActive(context.instance().getTenantId(), List.of(userId));
    }

    private void assertHuman(Context context, Long operatorId) {
        if (WorkflowCompletionContext.isAutomatic() || operatorId == null || !Objects.equals(operatorId, UserContext.getUserId())
                || !Objects.equals(context.instance().getTenantId(), UserContext.getTenantId())
                || context.excluded().contains(operatorId) || !allApprovers(context).contains(operatorId)) {
            throw failure("H_SELF_APPROVAL_FORBIDDEN", "H 审批必须由同租户、排除申请双方的真实审批人办理");
        }
    }

    private Set<Long> allApprovers(Context context) {
        Set<Long> users = new LinkedHashSet<>();
        context.approvers().values().forEach(users::addAll);
        return users;
    }

    private void assertActive(Long tenantId, Collection<Long> userIds) {
        List<SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getTenantId, tenantId).eq(SysUser::getStatus, "0").eq(SysUser::getDeleted, 0)
                .in(SysUser::getUserId, userIds));
        Set<Long> found = new LinkedHashSet<>();
        for (SysUser user : users) found.add(user.getUserId());
        if (!found.equals(new LinkedHashSet<>(userIds))) throw failure("H_APPROVER_UNAVAILABLE", "审批参与人不存在、已停用或不属于当前租户");
    }

    private void assertSubmittedVariables(Context context, Map<String, Object> submitted) {
        if (submitted == null) return;
        for (String key : submitted.keySet()) {
            if (key != null && (key.startsWith("_") || PROTECTED_VARIABLES.contains(key) || offer(context) && OFFER_FIELDS.contains(key))) {
                throw failure("H_IDENTITY_OVERRIDE_FORBIDDEN", "任务变量不得提交或覆盖服务端身份、审批人及业务绑定字段");
            }
        }
    }

    private void assertFrozen(Context context, Map<String, Object> variables) {
        Set<String> protectedFields = new LinkedHashSet<>(PROTECTED_VARIABLES);
        if (offer(context)) protectedFields.addAll(OFFER_FIELDS);
        for (String key : protectedFields) {
            if (variables == null || variables.containsKey(key) != context.variables().containsKey(key)
                    || !sameProtectedValue(context, key, variables.get(key), context.variables().get(key))) {
                throw failure("H_IDENTITY_OVERRIDE_FORBIDDEN", "运行时身份与持久化实例不一致，已阻止流程继续");
            }
        }
    }

    private boolean sameProtectedValue(Context context, String key, Object actual, Object expected) {
        if (Objects.equals(actual, expected)) return true;
        if (!offer(context) || !"salary".equals(key) || actual == null || expected == null) return false;
        try {
            return new BigDecimal(actual.toString()).compareTo(new BigDecimal(expected.toString())) == 0;
        } catch (NumberFormatException invalidAmount) { return false; }
    }

    private List<Long> stringIds(Object value) {
        if (!(value instanceof List<?> values) || values.isEmpty()) throw failure("H_APPROVER_MISSING", "H 参与人信息必须是非空字符串用户 ID 列表");
        List<Long> ids = values.stream().map(this::stringId).toList();
        if (ids.size() != new LinkedHashSet<>(ids).size()) throw failure("H_APPROVER_INVALID", "H 参与人列表不能重复");
        return ids;
    }

    private Long stringId(Object value) {
        if (!(value instanceof String text) || !text.matches("[1-9][0-9]{0,18}")) throw failure("H_IDENTITY_INVALID", "H 用户 ID 必须为正整数字符串");
        try { return Long.valueOf(text); }
        catch (NumberFormatException failure) { throw failure("H_IDENTITY_INVALID", "H 用户 ID 超出有效范围"); }
    }

    private Map<String, Object> readVariables(WfProcessInstance instance) {
        String source = instance.getVariables();
        if (!StringUtils.hasText(source)) return Map.of();
        try { return JSON.readValue(source, new TypeReference<Map<String, Object>>() {}); }
        catch (Exception failure) {
            if (source.contains("\"" + EXCLUDED_USERS + "\"")
                    || source.contains("\"" + CORRECTION_APPROVERS + "\"")
                    || source.contains("\"" + FROZEN_DEFINITION + "\"")
                    || BUSINESS_TYPES.stream().anyMatch(type -> source.contains("\"" + type + "\""))) {
                throw failure("H_IDENTITY_INVALID", "H 实例身份变量无法安全读取");
            }
            return Map.of();
        }
    }

    private WorkflowException failure(String code, String message) {
        return new WorkflowException(code, message);
    }

    private record Context(WfProcessInstance instance, Map<String, Object> variables, boolean hr, boolean correction,
                           Set<Long> excluded, Map<String, List<Long>> approvers) {}
}
