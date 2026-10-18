package com.cloudflow.hr.service;

import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.mapper.HrAdvanceApplicationMapper;
import com.cloudflow.hr.mapper.HrHMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrAdvanceApprovalSupport {
    private final HrAdvanceApplicationMapper applications;
    private final HrHMapper lookups;
    private final HrHSupport access;
    private final RuntimeSysConfigService settings;

    public Map<String, Object> snapshot(HrEmployee employee) {
        Long applicant = access.linkedUser(employee);
        List<Long> leaders = applications.departmentLeaders(tenantId(), employee.getDeptId());
        List<Long> qualified = lookups.permissionUsers(tenantId(), "workflow:task:complete", employee.getDeptId());
        if (leaders.size() != 1 || applicant.equals(leaders.get(0)) || !qualified.contains(leaders.get(0))) {
            throw conflict("ADVANCE_LEADER_MISSING", "员工部门须设置唯一且可办理审批的独立负责人");
        }
        Long leader = leaders.get(0);
        List<String> finance = lookups.roleUsers(tenantId(), "finance").stream().filter(qualified::contains)
                .filter(userId -> !applicant.equals(userId) && !leader.equals(userId)).map(String::valueOf).toList();
        if (finance.isEmpty()) throw conflict("ADVANCE_FINANCE_MISSING", "缺少排除申请人和部门负责人后的有效财务复核人");
        String processKey = settings.getString("sys.hr.advance.processKey", "");
        Map<String, Object> definition = processKey == null || processKey.isBlank() ? null : lookups.definition(tenantId(), processKey);
        if (definition == null) throw conflict("WORKFLOW_NOT_CONFIGURED", "借款审批流程尚未发布");
        ObjectNode model = access.tree(String.valueOf(definition.get("modelJson")));
        access.validateAdvanceModel(model);
        Map<String, Object> result = new TreeMap<>();
        result.put("applicantUserId", applicant.toString()); result.put(HrHSupport.EXCLUDED_USERS, List.of(applicant.toString()));
        result.put("responsibleApproverIds", List.of(leader.toString())); result.put("financeApproverIds", finance);
        result.put("processKey", processKey); result.put("definitionId", definition.get("definitionId"));
        result.put("definitionVersion", definition.get("version")); result.put("modelDigest", access.digest(model));
        return result;
    }

    public void verifyCurrent(HrEmployee employee, ObjectNode snapshot) {
        if (!access.convert(snapshot(employee), JsonNode.class).equals(snapshot)) {
            throw conflict("ADVANCE_APPROVAL_CHANGED", "部门负责人、财务或借款流程依据已变化，请核对申请");
        }
    }

    public void verifyActor(ObjectNode snapshot, Long approver, String result) {
        verifyRecordedActor(snapshot, approver, result);
        if (lookups.activeUser(tenantId(), approver) == null) throw forbidden();
        for (JsonNode user : snapshot.path("financeApproverIds")) {
            if (approver.toString().equals(user.asText()) && !lookups.roleUsers(tenantId(), "finance").contains(approver)) throw forbidden();
        }
    }

    /** 已完成的人工审批由冻结名单和真实办理历史核验，后续撤权不撤销既成审批事实。 */
    public void verifyRecordedActor(ObjectNode snapshot, Long approver, String result) {
        if (approver == null || Objects.equals(approver.toString(), snapshot.path("applicantUserId").asText())) throw forbidden();
        boolean finance = false;
        for (JsonNode user : snapshot.path("financeApproverIds")) finance |= approver.toString().equals(user.asText());
        if (finance) return;
        if ("REJECTED".equals(result)) for (JsonNode user : snapshot.path("responsibleApproverIds")) {
            if (approver.toString().equals(user.asText())) return;
        }
        throw forbidden();
    }
}
