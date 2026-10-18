package com.cloudflow.hr.service;

import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.mapper.HrHMapper;
import com.cloudflow.hr.mapper.HrSettlementApprovalMapper;
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
public class HrSettlementApprovalSupport {
    private final HrSettlementApprovalMapper settlements;
    private final HrHMapper lookups;
    private final HrHSupport access;
    private final RuntimeSysConfigService settings;

    public Map<String, Object> snapshot(HrEmployee employee, Long submitter) {
        if (employee == null || !Objects.equals(employee.getTenantId(), tenantId()) || employee.getDeptId() == null
                || submitter == null || lookups.activeUser(tenantId(), submitter) == null) throw forbidden();
        Long employeeUser = settlements.employeeUser(tenantId(), employee.getId());
        if (employeeUser == null || !employeeUser.equals(employee.getUserId())) throw conflict("SETTLEMENT_EMPLOYEE_LINK_INVALID", "离职员工须关联本租户唯一真实账号，停用账号仍可结算");
        if (employeeUser.equals(submitter)) throw forbidden();
        List<Long> handlers = lookups.permissionUsers(tenantId(), "workflow:task:complete", employee.getDeptId());
        List<Long> readers = lookups.permissionUsers(tenantId(), "hr:settlement:list", employee.getDeptId());
        List<String> finance = lookups.roleUsers(tenantId(), "finance").stream().filter(handlers::contains).filter(readers::contains)
                .filter(user -> !submitter.equals(user) && !employeeUser.equals(user)).map(String::valueOf).toList();
        if (finance.isEmpty()) throw conflict("SETTLEMENT_FINANCE_MISSING", "缺少可读取本员工结算并办理审批的独立财务，提交人与离职本人须回避");
        String processKey = settings.getString("sys.hr.settlement.processKey", "");
        Map<String, Object> definition = processKey == null || processKey.isBlank() ? null : lookups.definition(tenantId(), processKey);
        if (definition == null) throw conflict("WORKFLOW_NOT_CONFIGURED", "离职结算独立财务复核流程尚未发布");
        ObjectNode model = access.tree(String.valueOf(definition.get("modelJson"))); access.validateSettlementModel(model);
        Map<String, Object> result = new TreeMap<>();
        result.put("applicantUserId", submitter.toString()); result.put("settlementEmployeeUserId", employeeUser.toString());
        result.put(HrHSupport.EXCLUDED_USERS, List.of(submitter.toString(), employeeUser.toString())); result.put("financeApproverIds", finance);
        result.put("processKey", processKey); result.put("definitionId", definition.get("definitionId"));
        result.put("definitionVersion", definition.get("version")); result.put("modelDigest", access.digest(model));
        for (JsonNode node : model.path("nodes")) if ("APPROVAL".equals(node.path("type").asText())) result.put("financeNodeId", node.path("id").asText());
        return result;
    }

    public void verifyCurrent(HrEmployee employee, ObjectNode snapshot) {
        Long submitter = HrHSupport.number(snapshot.path("applicantUserId").asText());
        if (!access.convert(snapshot(employee, submitter), JsonNode.class).equals(snapshot)) throw conflict("SETTLEMENT_APPROVAL_CHANGED", "提交人、员工关联、财务资格或审批流程已变化，请核对后重新提交");
    }

    /** A recorded decision remains evidence after a later role revocation. */
    public void verifyRecordedActor(ObjectNode snapshot, Long actor) {
        if (actor == null) throw forbidden();
        for (JsonNode excluded : snapshot.path(HrHSupport.EXCLUDED_USERS)) if (actor.toString().equals(excluded.asText())) throw forbidden();
        for (JsonNode user : snapshot.path("financeApproverIds")) if (actor.toString().equals(user.asText())) return;
        throw forbidden();
    }
}
