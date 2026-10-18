package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrOvertimeRequest;
import com.cloudflow.hr.domain.entity.HrScheduleAssignment;
import com.cloudflow.hr.domain.entity.HrShiftRequest;
import com.cloudflow.hr.mapper.HrHMapper;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrHConfigurationGuard {
    private final HrHMapper mapper;
    private final HrHSupport helper;

    public void assertMutable(String kind, Long id) {
        if (id == null) return;
        String field = switch (kind) { case "shift" -> "shiftId"; case "rule" -> "ruleId"; case "schedule" -> "assignmentId"; default -> throw new IllegalArgumentException(); };
        for (HrScheduleAssignment source : mapper.sourceAssignments(tenantId(), null)) {
            Long referenced = switch (kind) { case "shift" -> source.getShiftId(); case "rule" -> source.getRuleId(); default -> source.getId(); };
            if (Objects.equals(referenced, id)) throw conflict("H_SCHEDULE_IMMUTABLE", "已由调班申请生成的排班及配套配置须通过新的业务申请变更");
        }
        for (HrShiftRequest request : mapper.protectedShifts(tenantId())) {
            if (contains(helper.tree(request.getScheduleSnapshot()).path("plan"), field, id)) throw conflict("H_CONFIGURATION_RESERVED", "待执行调班已经冻结此配置");
        }
        for (HrOvertimeRequest request : mapper.protectedOvertimes(tenantId())) {
            if (contains(helper.tree(request.getCalculationSnapshot()).path("source"), field, id)) throw conflict("H_CONFIGURATION_RESERVED", "待核定或待审批加班已经冻结此配置");
        }
    }

    public void assertAssignmentSnapshots() {
        for (HrShiftRequest request : mapper.protectedShifts(tenantId())) {
            JsonNode plan = helper.tree(request.getScheduleSnapshot()).path("plan");
            for (String field : List.of("before", "neighbors")) for (JsonNode source : plan.path(field)) checkSlot(source);
        }
        for (HrOvertimeRequest request : mapper.protectedOvertimes(tenantId())) checkSlot(helper.tree(request.getCalculationSnapshot()).path("source"));
        for (HrScheduleAssignment source : mapper.sourceAssignments(tenantId(), null)) {
            Map<String, Object> current = mapper.assignment(tenantId(), source.getTargetId(), source.getScheduleDate());
            if (current == null || current.get("sourceShiftRequestId") == null) throw conflict("H_SCHEDULE_IMMUTABLE", "普通排班不能覆盖已通过调班形成的单日排班");
        }
    }

    private void checkSlot(JsonNode source) {
        JsonNode slot = source.path("slot");
        if (slot.isMissingNode()) throw conflict("H_SNAPSHOT_INVALID", "已占用配置的来源快照不完整");
        HrHSupport.Slot actual = helper.slot(HrHSupport.number(slot.path("employeeId").asText()), LocalDate.parse(slot.path("attendanceDate").asText()));
        if (!source.equals(helper.convert(helper.slotSnapshot(actual), JsonNode.class))) throw conflict("H_CONFIGURATION_RESERVED", "此修改会改变已冻结申请的实际排班依据");
    }

    private boolean contains(JsonNode snapshot, String field, Long id) {
        return snapshot.findValues(field).stream().anyMatch(value -> id.toString().equals(value.asText()));
    }
}
