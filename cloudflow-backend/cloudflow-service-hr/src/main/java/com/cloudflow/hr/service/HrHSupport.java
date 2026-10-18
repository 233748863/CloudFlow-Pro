package com.cloudflow.hr.service;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.hr.domain.dto.HrHRequests.PageQuery;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.domain.vo.attendance.HrHViews.*;
import com.cloudflow.hr.mapper.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrHSupport {
    public static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    public static final String EXCLUDED_USERS = "_hExcludedUserIds";
    private final HrRuleSupport support;
    private final HrHMapper mapper;
    private final HrEmployeeMapper employees;
    private final HrShiftMapper shifts;
    private final HrAttendanceRuleMapper rules;
    private final HrLeaveTypeMapper leaveTypes;
    private final HrLeaveDayCalculator leaveDays;
    private final HolidayCalendarService calendars;
    private final RuntimeSysConfigService settings;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    public static LocalDateTime now() { return LocalDateTime.now(BUSINESS_ZONE); }
    public static LocalDate today() { return LocalDate.now(BUSINESS_ZONE); }

    public static void runAsTenant(Long tenant, Runnable action) {
        if (tenant == null || tenant <= 0) throw invalid("业务事件缺少有效租户");
        com.cloudflow.common.tenant.TenantBroker.runAs(tenant, trusted -> {
            Long previousTenant = UserContext.getTenantId(); Long previousUser = UserContext.getUserId();
            String previousName = UserContext.getUserName(); String previousToken = UserContext.getAuthToken(); Integer previousScope = UserContext.getDsType();
            try {
                UserContext.setTenantId(trusted); UserContext.setUserId(null); UserContext.setUserName("system"); UserContext.setAuthToken(null); UserContext.setDsType(null); action.run();
            } finally {
                UserContext.setTenantId(previousTenant); UserContext.setUserId(previousUser); UserContext.setUserName(previousName); UserContext.setAuthToken(previousToken); UserContext.setDsType(previousScope);
            }
        });
    }

    public void validate(Object input) {
        if (input == null || !validator.validate(input).isEmpty()) throw invalid("请求字段缺失、格式或精度不符合要求");
    }

    public Long user() {
        Long userId = UserContext.getUserId();
        if (userId == null || !Objects.equals(UserContext.getTenantId(), tenantId()) || mapper.activeUser(tenantId(), userId) == null) throw forbidden();
        return userId;
    }

    public boolean permitted(String permission) {
        return UserContext.getUserId() != null && StpUtil.hasPermission(permission);
    }

    public void permission(String permission) { user(); if (!permitted(permission)) throw forbidden(); }

    public HrEmployee employee(Long employeeId) {
        HrEmployee employee = employeeId == null ? null : employees.selectById(employeeId);
        if (employee == null || !Objects.equals(employee.getTenantId(), tenantId()) || Integer.valueOf(1).equals(employee.getDeleted())) {
            throw new HrHException("EMPLOYEE_NOT_FOUND", "员工不存在", 404);
        }
        return employee;
    }

    public HrEmployee activeEmployee(Long employeeId, LocalDate date) {
        HrEmployee employee = employee(employeeId);
        if (employee.getEmployeeStatus() == null || !List.of("ACTIVE", "REGULAR", "PROBATION", "INTERN", "ON_LEAVE", "TRANSFERRED").contains(employee.getEmployeeStatus())
                || employee.getHireDate() == null || employee.getHireDate().isAfter(date)
                || employee.getResignDate() != null && !employee.getResignDate().isAfter(date) || employee.getDeptId() == null) {
            throw conflict("EMPLOYEE_INACTIVE", "员工尚未入职、已经离职或部门无效");
        }
        return employee;
    }

    public Long linkedUser(HrEmployee employee) {
        if (employee.getUserId() == null || mapper.activeUser(tenantId(), employee.getUserId()) == null) {
            throw conflict("APPLICANT_USER_INVALID", "员工未关联本租户的有效登录用户");
        }
        long count = employees.selectCount(new LambdaQueryWrapper<HrEmployee>().eq(HrEmployee::getTenantId, tenantId())
                .eq(HrEmployee::getDeleted, 0).eq(HrEmployee::getUserId, employee.getUserId()));
        if (count != 1) throw conflict("APPLICANT_USER_INVALID", "登录用户与员工的关联不唯一");
        return employee.getUserId();
    }

    public HrEmployee mine() {
        Long userId = user();
        List<HrEmployee> matches = employees.selectList(new LambdaQueryWrapper<HrEmployee>().eq(HrEmployee::getTenantId, tenantId())
                .eq(HrEmployee::getDeleted, 0).eq(HrEmployee::getUserId, userId));
        if (matches.size() != 1) throw conflict("EMPLOYEE_LINK_REQUIRED", "当前用户须关联唯一员工档案");
        activeEmployee(matches.get(0).getId(), today());
        return matches.get(0);
    }

    public boolean owner(Long employeeId) { return Objects.equals(employee(employeeId).getUserId(), user()); }
    public void own(Long employeeId) { if (!owner(employeeId)) throw forbidden(); }

    public void scope(Long employeeId) {
        user();
        if (UserContext.getDsType() == null) throw forbidden();
        support.assertEmployeeScope(employeeId);
    }

    public void operator(Long employeeId, String permission) {
        permission(permission);
        scope(employeeId);
        if (owner(employeeId)) throw forbidden();
    }

    public List<Long> scopedEmployees(PageQuery query, boolean mine) {
        validate(query);
        if (mine) return List.of(mine().getId());
        user();
        if (UserContext.getDsType() == null) throw forbidden();
        return support.employees(query.getEmployeeId() == null ? null : List.of(query.getEmployeeId()),
                query.getDeptId() == null ? null : List.of(query.getDeptId())).stream().map(HrEmployee::getId).toList();
    }

    public static void version(Integer expected, Integer actual) {
        if (expected == null || expected < 0 || !expected.equals(actual)) throw conflict("VERSION_CONFLICT", "记录已变化，请刷新后重试");
    }

    public static String text(String value, int maximum) {
        if (value == null || value.trim().isEmpty() || value.trim().length() > maximum) throw invalid("说明不能为空或超过允许长度");
        return value.trim();
    }

    public static String key(String value) {
        if (value == null || !value.matches("[\\x21-\\x7E]{1,64}")) throw invalid("Idempotency-Key须为1至64个可见ASCII字符");
        return value;
    }

    public static void dateRange(LocalDate from, LocalDate to) {
        if ((from == null) != (to == null) || from != null && from.isAfter(to)) throw invalid("起止日期须成对提供且顺序正确");
    }

    public String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (Exception failure) { throw conflict("SNAPSHOT_INVALID", "业务依据无法保存"); }
    }

    public ObjectNode tree(String value) {
        if (value == null || value.isBlank()) return objectMapper.createObjectNode();
        try {
            JsonNode node = objectMapper.readTree(value);
            if (node instanceof ObjectNode object) return object;
        } catch (Exception ignored) { }
        throw conflict("SNAPSHOT_INVALID", "业务依据无法读取");
    }

    public boolean matchesSnapshot(Object value, JsonNode snapshot) {
        return tree(json(value)).equals(snapshot);
    }

    public String digest(Object value) {
        try {
            byte[] bytes = objectMapper.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true).writeValueAsBytes(value);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception failure) { throw conflict("SNAPSHOT_INVALID", "业务摘要无法生成"); }
    }

    public <T> T convert(Object value, Class<T> type) { return objectMapper.convertValue(value, type); }
    public <T> T view(Object source, T target) { BeanUtils.copyProperties(source, target); return target; }

    public <T> T locked(List<String> resources, Supplier<T> action) {
        List<String> distinct = resources.stream().filter(Objects::nonNull).distinct().toList();
        return lockAt(distinct, 0, action);
    }

    private <T> T lockAt(List<String> resources, int index, Supplier<T> action) {
        return index == resources.size() ? support.transaction(action) : support.locked(resources.get(index), () -> lockAt(resources, index + 1, action));
    }

    public List<String> overtimeLocks(HrOvertimeRequest request) {
        List<String> keys = new ArrayList<>();
        keys.add("attendance-config");
        keys.add("overtime:" + request.getEmployeeId() + ":" + YearMonth.from(request.getWorkDate()));
        attendanceLocks(keys, List.of(request.getEmployeeId()), request.getWorkDate().minusDays(1), request.getWorkDate().plusDays(1));
        return keys;
    }

    public void attendanceLocks(List<String> keys, List<Long> employeeIds, LocalDate from, LocalDate to) {
        for (Long employeeId : employeeIds.stream().distinct().sorted().toList()) {
            for (YearMonth month = YearMonth.from(from); !month.isAfter(YearMonth.from(to)); month = month.plusMonths(1)) keys.add("attendance:" + employeeId + ":" + month);
        }
    }

    public void monthOpen(Long employeeId, LocalDate date) {
        if (mapper.confirmedMonth(tenantId(), employeeId, YearMonth.from(date).toString()) > 0) throw conflict("ATTENDANCE_MONTH_CLOSED", "考勤月份已封账，不能新增或核定相关工时");
    }

    public HrShift shift(Long id) {
        HrShift shift = id == null ? null : shifts.selectById(id);
        if (shift == null || !Objects.equals(shift.getTenantId(), tenantId()) || !Integer.valueOf(1).equals(shift.getStatus())) throw conflict("SHIFT_INVALID", "班次不存在或未启用");
        HrAttendanceJudge.validateShift(shift);
        return shift;
    }

    public String shiftName(Long id) {
        HrShift shift = id == null ? null : shifts.selectById(id);
        return shift != null && Objects.equals(shift.getTenantId(), tenantId()) ? shift.getShiftName() : null;
    }

    public int minimumRestMinutes() {
        String value = settings.getString("sys.hr.shift.minimumRestMinutes", "");
        if (value == null || !value.matches("[0-9]+")) throw conflict("MINIMUM_REST_NOT_CONFIGURED", "须先核定非负整数的调班最小休息分钟数");
        try { return Integer.parseInt(value); }
        catch (NumberFormatException failure) { throw conflict("MINIMUM_REST_NOT_CONFIGURED", "调班最小休息分钟数超出整数范围"); }
    }

    public HrAttendanceRule rule(Long id) {
        HrAttendanceRule rule = id == null ? null : rules.selectById(id);
        if (rule == null || !Objects.equals(rule.getTenantId(), tenantId()) || !Integer.valueOf(1).equals(rule.getStatus())) throw conflict("ATTENDANCE_RULE_INVALID", "考勤规则不存在或未启用");
        if (!rule.hasValidCheckMethods()) throw conflict("ATTENDANCE_RULE_INVALID", "打卡方式配置无效，请先核定考勤规则");
        return rule;
    }

    public Map<String, Object> calendar(Long employeeId, LocalDate date) {
        Long calendarId = calendars.resolveCalendarId(employeeId, date);
        return calendarDetails(calendarId, date);
    }

    public Map<String, Object> calendarForShift(Long employeeId, LocalDate date, HrShift shift) {
        Long calendarId = shift.getHolidayCalendarId();
        if (calendarId == null) {
            List<Long> defaults = mapper.fallbackCalendars(tenantId(), employeeId);
            if (defaults.size() != 1 || defaults.get(0) == null) throw conflict("CALENDAR_MISSING", "部门及租户没有唯一有效默认日历");
            calendarId = defaults.get(0);
        }
        return calendarDetails(calendarId, date);
    }

    private Map<String, Object> calendarDetails(Long calendarId, LocalDate date) {
        Map<String, Object> source = mapper.calendar(tenantId(), calendarId, date);
        if (source == null || !"ENABLED".equals(source.get("status"))) throw conflict("CALENDAR_MISSING", "未配置本租户启用的日历");
        Map<String, Object> result = new TreeMap<>(source);
        if (source.get("dateType") == null) {
            String restDays = String.valueOf(source.get("weeklyRestDays"));
            if (!restDays.matches("(?:[1-7](?:,[1-7])*)?")) throw conflict("CALENDAR_CONFLICT", "每周休息日配置无效");
            result.put("dateType", Arrays.asList(restDays.split(",")).contains(String.valueOf(date.getDayOfWeek().getValue())) ? "REST" : "WORKDAY");
            result.put("triplePayFlag", 0);
        } else if (!Objects.equals(number(source.get("yearNo")), Long.valueOf(date.getYear()))) throw conflict("CALENDAR_CONFLICT", "日历年份与日期不一致");
        HrOvertimeCalculator.dayType(String.valueOf(result.get("dateType")), number(result.get("triplePayFlag")).intValue());
        result.put("date", date.toString());
        return result;
    }

    public Slot slot(Long employeeId, LocalDate date) {
        Map<String, Object> assignment = mapper.assignment(tenantId(), employeeId, date);
        if (assignment == null) throw conflict("SCHEDULE_MISSING", "日期没有唯一有效排班");
        HrShift shift = shift(number(assignment.get("shiftId")));
        HrAttendanceRule rule = rule(number(assignment.get("ruleId")));
        if (!Objects.equals(rule.getShiftId(), shift.getId())) throw conflict("RULE_SHIFT_CONFLICT", "排班班次与规则不兼容");
        Map<String, Object> calendar = calendarForShift(employeeId, date, shift);
        return new Slot(employeeId, date, number(assignment.get("assignmentId")), number(assignment.get("assignmentVersion")).intValue(), shift, rule, calendar,
                assignment.get("effectiveStart") == null ? null : String.valueOf(assignment.get("effectiveStart")));
    }

    public ShiftSlotVO slotView(Slot slot) {
        ShiftSlotVO view = new ShiftSlotVO();
        view.setEmployeeId(slot.employeeId()); view.setAttendanceDate(slot.date()); view.setAssignmentId(slot.assignmentId());
        view.setAssignmentVersion(slot.assignmentVersion()); view.setShiftId(slot.shift().getId()); view.setShiftVersion(slot.shift().getVersion());
        view.setRuleId(slot.rule().getId()); view.setRuleVersion(slot.rule().getVersion()); view.setStartTime(slot.start()); view.setEndTime(slot.end());
        view.setCalendarId(number(slot.calendar().get("calendarId"))); view.setDateType(String.valueOf(slot.calendar().get("dateType")));
        return view;
    }

    public Map<String, Object> slotSnapshot(Slot slot) {
        Map<String, Object> value = new TreeMap<>();
        value.put("slot", slotView(slot)); value.put("calendar", slot.calendar()); value.put("shift", slot.shift()); value.put("rule", slot.rule());
        value.put("effectiveStart", slot.effectiveStart());
        return value;
    }

    public void noLeave(Long employeeId, LocalDate attendanceDate, LocalDateTime start, LocalDateTime end) {
        for (HrTimeRequest request : mapper.leaveOverlap(tenantId(), employeeId, start, end)) {
            HrLeaveType type = leaveTypes.selectById(request.getLeaveTypeId());
            if (type == null || !Objects.equals(type.getTenantId(), tenantId())) throw conflict("LEAVE_EVIDENCE_INVALID", "存在无法核实的请假依据");
            LocalDateTime from = start.isAfter(request.getStartTime()) ? start : request.getStartTime();
            LocalDateTime to = end.isBefore(request.getEndTime()) ? end : request.getEndTime();
            if (leaveDays.quantity(employeeId, type, attendanceDate, from, to).signum() > 0) throw conflict("LEAVE_OVERLAP", "申请与待审批或已批准请假区间重叠");
        }
    }

    public Map<String, Object> approvals(String businessType, HrEmployee applicant, HrEmployee peer) {
        Long applicantUserId = linkedUser(applicant);
        List<String> excluded = new ArrayList<>(); excluded.add(applicantUserId.toString());
        if (peer != null) excluded.add(linkedUser(peer).toString());
        String prefix = "HR_OVERTIME".equals(businessType) ? "sys.hr.overtime" : "sys.hr.shiftRequest";
        return approvalContext(prefix, applicant, applicantUserId, excluded);
    }

    public Map<String, Object> referralApprovals(HrEmployee referrer, Long submitter) {
        if (submitter == null || mapper.activeUser(tenantId(), submitter) == null) throw forbidden();
        Long beneficiary = linkedUser(referrer);
        List<String> excluded = java.util.stream.Stream.of(submitter, beneficiary).distinct().map(String::valueOf).toList();
        Map<String, Object> snapshot = approvalContext("sys.hr.referral", referrer, submitter, excluded);
        snapshot.put("beneficiaryUserId", beneficiary.toString());
        return snapshot;
    }

    private Map<String, Object> approvalContext(String prefix, HrEmployee applicant, Long applicantUserId, List<String> excluded) {
        ObjectNode approvalUsers = tree(settings.getString(prefix + ".approvalUsers", ""));
        if (approvalUsers.size() != 2 || !approvalUsers.path("responsibleUserId").isTextual() || !approvalUsers.path("hrUserId").isTextual()) throw conflict("APPROVER_MISSING", "须配置已核定的负责人与人事审批人");
        String responsible = approvalUsers.path("responsibleUserId").asText();
        String humanResources = approvalUsers.path("hrUserId").asText();
        List<String> allowed = mapper.permissionUsers(tenantId(), "workflow:task:complete", applicant.getDeptId()).stream().map(String::valueOf).toList();
        if (!responsible.matches("[1-9][0-9]{0,18}") || !humanResources.matches("[1-9][0-9]{0,18}") || responsible.equals(humanResources)
                || excluded.contains(responsible) || excluded.contains(humanResources) || !allowed.containsAll(List.of(responsible, humanResources))) {
            throw conflict("APPROVER_INVALID", "审批人须有效、互不重复、有办理资格且排除申请双方");
        }
        String processKey = settings.getString(prefix + ".processKey", "");
        if (processKey == null || processKey.isBlank()) throw conflict("WORKFLOW_NOT_CONFIGURED", "审批流程尚未配置");
        Map<String, Object> definition = mapper.definition(tenantId(), processKey);
        if (definition == null) throw conflict("WORKFLOW_NOT_CONFIGURED", "审批流程尚未正式发布");
        validateModel(tree(String.valueOf(definition.get("modelJson"))));
        Map<String, Object> snapshot = new TreeMap<>();
        snapshot.put("applicantUserId", applicantUserId.toString()); snapshot.put(EXCLUDED_USERS, excluded);
        snapshot.put("responsibleApproverIds", List.of(responsible)); snapshot.put("hrApproverIds", List.of(humanResources));
        snapshot.put("processKey", processKey); snapshot.put("definitionId", definition.get("definitionId"));
        snapshot.put("definitionVersion", definition.get("version")); snapshot.put("modelDigest", digest(tree(String.valueOf(definition.get("modelJson")))));
        return snapshot;
    }

    public void validateOfferModel(ObjectNode model) {
        JsonNode nodes = model.path("nodes"); JsonNode edges = model.path("edges");
        if (!nodes.isArray() || nodes.size() != 3 || !edges.isArray() || edges.size() != 2) throw conflict("OFFER_MODEL_UNSUPPORTED", "录用须使用发起、管理员审批、结束的完整顺序流程");
        Map<String, String> stages = new HashMap<>(); Set<String> identifiers = new HashSet<>();
        for (JsonNode node : nodes) {
            String identifier = node.path("id").asText(); String type = node.path("type").asText();
            manualNode(node);
            if (identifier.isBlank() || !identifiers.add(identifier) || !List.of("START", "APPROVAL", "END").contains(type)
                    || stages.put(type, identifier) != null || "AUTO_SKIP".equals(node.path("approveSelf").asText())) throw conflict("OFFER_MODEL_UNSUPPORTED", "录用审批节点缺失、重复或允许自动跳过");
            if ("APPROVAL".equals(type) && (!"ROLE".equals(node.path("approverType").asText())
                    || !"admin".equals(node.path("approverValue").asText()))) throw conflict("OFFER_MODEL_UNSUPPORTED", "录用须由管理员实际审批");
        }
        Set<String> actual = new HashSet<>();
        for (JsonNode edge : edges) { unconditional(edge); actual.add(edge.path("source").asText() + ":" + edge.path("target").asText()); }
        if (!actual.equals(Set.of(stages.get("START") + ":" + stages.get("APPROVAL"), stages.get("APPROVAL") + ":" + stages.get("END")))) throw conflict("OFFER_MODEL_UNSUPPORTED", "录用流程不能跳过管理员审批");
    }

    private void validateModel(ObjectNode model) {
        validateSequentialModel(model, "hrApproverIds");
    }

    public void validateAdvanceModel(ObjectNode model) {
        validateSequentialModel(model, "financeApproverIds");
        for (JsonNode node : model.path("nodes")) {
            if (!"APPROVAL".equals(node.path("type").asText())) continue;
            boolean finance = "financeApproverIds".equals(node.path("approverValue").asText());
            if (finance ? !"ANY".equals(node.path("signType").asText()) : !node.path("signType").asText("").isBlank()) {
                throw conflict("WORKFLOW_MODEL_UNSAFE", "借款须部门负责人单人首审，独立财务任一人复核");
            }
            for (JsonNode sign : node.findValues("signType")) {
                if (finance ? !"ANY".equals(sign.asText()) : !sign.isNull() && !sign.asText().isBlank()) {
                    throw conflict("WORKFLOW_MODEL_UNSAFE", "借款审批方式不能由嵌套配置覆盖");
                }
            }
            for (String field : List.of("allowDelegate", "allowAddSign", "allowAgent")) for (JsonNode flag : node.findValues(field)) {
                if (!flag.isNull() && (!flag.isBoolean() || flag.booleanValue())) throw conflict("WORKFLOW_MODEL_UNSAFE", "借款禁止转办、加签或代理");
            }
        }
    }

    public void validateSettlementModel(ObjectNode model) {
        JsonNode nodes = model.path("nodes"); JsonNode edges = model.path("edges");
        if (!nodes.isArray() || nodes.size() != 3 || !edges.isArray() || edges.size() != 2) throw conflict("WORKFLOW_MODEL_UNSAFE", "结算须使用发起、独立财务复核、结束的顺序流程");
        Map<String, String> stages = new HashMap<>(); Set<String> identifiers = new HashSet<>();
        for (JsonNode node : nodes) {
            String identifier = node.path("id").asText(); String type = node.path("type").asText(); manualNode(node);
            if (identifier.isBlank() || !identifiers.add(identifier) || !Set.of("START", "APPROVAL", "END").contains(type)
                    || stages.put(type, identifier) != null) throw conflict("WORKFLOW_MODEL_UNSAFE", "结算审批节点缺失、重复或包含未批准环节");
            for (JsonNode mode : node.findValues("approveSelf")) if ("AUTO_SKIP".equals(mode.asText())) throw conflict("WORKFLOW_MODEL_UNSAFE", "结算财务复核禁止自动跳过");
            if (!"APPROVAL".equals(type)) continue;
            if (!"VARIABLE_USER".equals(node.path("approverType").asText()) || !"financeApproverIds".equals(node.path("approverValue").asText())
                    || !"ANY".equals(node.path("signType").asText())) throw conflict("WORKFLOW_MODEL_UNSAFE", "结算须由冻结名单内任一独立财务实际复核");
            for (JsonNode mode : node.findValues("signType")) if (!"ANY".equals(mode.asText())) throw conflict("WORKFLOW_MODEL_UNSAFE", "结算复核方式不能由嵌套配置覆盖");
            for (String field : List.of("allowDelegate", "allowAddSign", "allowAgent")) {
                JsonNode flag = node.has(field) ? node.path(field) : node.path("props").path(field);
                if (!"allowAgent".equals(field) && (!flag.isBoolean() || flag.booleanValue())) throw conflict("WORKFLOW_MODEL_UNSAFE", "结算须明确禁止转办和加签");
                for (JsonNode value : node.findValues(field)) if (!value.isNull() && (!value.isBoolean() || value.booleanValue())) throw conflict("WORKFLOW_MODEL_UNSAFE", "结算禁止转办、加签或代理");
            }
        }
        Set<String> actual = new HashSet<>();
        for (JsonNode edge : edges) { unconditional(edge); actual.add(edge.path("source").asText() + ":" + edge.path("target").asText()); }
        if (!actual.equals(Set.of(stages.get("START") + ":" + stages.get("APPROVAL"), stages.get("APPROVAL") + ":" + stages.get("END")))) throw conflict("WORKFLOW_MODEL_UNSAFE", "结算流程须完整经过独立财务复核");
    }

    private void validateSequentialModel(ObjectNode model, String finalApprovers) {
        JsonNode nodes = model.path("nodes");
        JsonNode edges = model.path("edges");
        if (!nodes.isArray() || nodes.size() != 4 || !edges.isArray() || edges.size() != 3) throw conflict("WORKFLOW_MODEL_UNSAFE", "审批模型须为发起、负责人、复核、结束的顺序审批");
        Map<String, String> ids = new HashMap<>();
        Set<String> uniqueIds = new HashSet<>();
        for (JsonNode node : nodes) {
            if (node.path("id").asText().isBlank() || !uniqueIds.add(node.path("id").asText())) throw conflict("WORKFLOW_MODEL_UNSAFE", "审批节点编号缺失或重复");
            manualNode(node);
            String type = node.path("type").asText();
            if ("APPROVAL".equals(type)) {
                String variable = node.path("approverValue").asText();
                JsonNode props = node.path("props");
                JsonNode delegate = node.has("allowDelegate") ? node.path("allowDelegate") : props.path("allowDelegate");
                JsonNode addSign = node.has("allowAddSign") ? node.path("allowAddSign") : props.path("allowAddSign");
                if (!"VARIABLE_USER".equals(node.path("approverType").asText()) || !List.of("responsibleApproverIds", finalApprovers).contains(variable)
                        || !delegate.isBoolean() || delegate.asBoolean() || !addSign.isBoolean() || addSign.asBoolean()
                        || "AUTO_SKIP".equals(node.path("approveSelf").asText()) || ids.put(variable, node.path("id").asText()) != null) {
                    throw conflict("WORKFLOW_MODEL_UNSAFE", "审批节点须使用受控审批人且禁止转办、加签及自动跳过");
                }
            } else if (!List.of("START", "END").contains(type) || ids.put(type, node.path("id").asText()) != null) throw conflict("WORKFLOW_MODEL_UNSAFE", "审批模型包含未确认节点");
        }
        if (ids.size() != 4) throw conflict("WORKFLOW_MODEL_UNSAFE", "审批模型缺少必需节点");
        Set<String> expected = Set.of(ids.get("START") + ":" + ids.get("responsibleApproverIds"), ids.get("responsibleApproverIds") + ":" + ids.get(finalApprovers), ids.get(finalApprovers) + ":" + ids.get("END"));
        Set<String> actual = new HashSet<>();
        for (JsonNode edge : edges) { unconditional(edge); actual.add(edge.path("source").asText() + ":" + edge.path("target").asText()); }
        if (!expected.equals(actual)) throw conflict("WORKFLOW_MODEL_UNSAFE", "审批模型顺序或分支不符合确认规则");
    }

    public void verifyActors(String businessType, ObjectNode snapshot, HrEmployee applicant, HrEmployee peer) {
        Map<String, Object> current = approvals(businessType, applicant, peer);
        for (String field : current.keySet()) {
            if (!objectMapper.valueToTree(current.get(field)).equals(snapshot.path(field))) throw conflict("APPROVAL_SNAPSHOT_CONFLICT", "申请人关联、审批人或流程依据已经变化");
        }
    }

    public void callbackActor(ObjectNode snapshot, Long approverId, String result) {
        if (approverId == null || mapper.activeUser(tenantId(), approverId) == null) throw conflict("APPROVER_INVALID", "审批结果缺少有效办理人");
        String actor = approverId.toString();
        for (JsonNode excluded : snapshot.path(EXCLUDED_USERS)) if (actor.equals(excluded.asText())) throw forbidden();
        boolean allowed = false;
        for (JsonNode reviewer : snapshot.path("hrApproverIds")) allowed |= actor.equals(reviewer.asText());
        if ("REJECTED".equals(result)) for (JsonNode reviewer : snapshot.path("responsibleApproverIds")) allowed |= actor.equals(reviewer.asText());
        if (!allowed) throw conflict("APPROVER_INVALID", "终审人不在冻结的审批人名单内");
    }

    private void unconditional(JsonNode edge) {
        for (String field : List.of("condition", "conditionExpression", "expression", "conditions")) {
            for (JsonNode value : edge.findValues(field)) if (!value.isNull() && !(value.isTextual() && value.asText().isBlank()) && !(value.isArray() && value.isEmpty())) {
                throw conflict("WORKFLOW_MODEL_UNSAFE", "H审批连线不能带跳过必经审批的条件");
            }
        }
    }

    private void manualNode(JsonNode node) {
        unconditional(node);
        for (String field : List.of("allowSelection", "allowEdit", "allowRollback", "allowReduceSign")) {
            for (JsonNode value : node.findValues(field)) if (!value.isNull() && (!value.isBoolean() || value.asBoolean())) throw conflict("WORKFLOW_MODEL_UNSAFE", "H审批禁止动态选人、修改依据、回退及减签");
        }
        for (String field : List.of("slaHours", "slaAction", "inputs", "outputs", "triggers", "retry")) {
            for (JsonNode value : node.findValues(field)) if (!value.isNull() && !(value.isTextual() && value.asText().isBlank())
                    && !(value.isContainerNode() && value.isEmpty()) && !(value.isIntegralNumber() && value.asLong() == 0)) throw conflict("WORKFLOW_MODEL_UNSAFE", "H审批禁止自动终审和改写冻结变量的执行配置");
        }
    }

    public Map<String, Object> correctionApprovals(HrOvertimeRequest source) {
        HrEmployee employee = employee(source.getEmployeeId()); ObjectNode policy = tree(source.getPolicySnapshot());
        Long applicant = linkedUser(employee);
        if (!applicant.toString().equals(policy.path("applicantUserId").asText())) throw conflict("APPLICANT_USER_INVALID", "原加班申请人的登录关联已变化");
        return correctionApprovals(employee, applicant, null);
    }

    public Map<String, Object> advanceCorrectionApprovals(HrEmployee employee, Long applicant) {
        if (applicant == null || mapper.activeUser(tenantId(), applicant) == null) throw conflict("APPLICANT_USER_INVALID", "借款补正发起人须为本租户有效用户");
        return correctionApprovals(employee, applicant, employee.getUserId());
    }

    private Map<String, Object> correctionApprovals(HrEmployee employee, Long applicant, Long beneficiary) {
        String processKey = settings.getString("sys.hr.payroll.correctionProcessKey", "");
        Map<String, Object> definition = processKey == null || processKey.isBlank() ? null : mapper.definition(tenantId(), processKey);
        if (definition == null) throw conflict("WORKFLOW_NOT_CONFIGURED", "工资补正审批尚未正式发布");
        ObjectNode model = tree(String.valueOf(definition.get("modelJson"))); JsonNode nodes = model.path("nodes"); JsonNode edges = model.path("edges");
        if (!nodes.isArray() || nodes.size() != 3 || !edges.isArray() || edges.size() != 2) throw conflict("WORKFLOW_MODEL_UNSAFE", "关联补正须使用D财务核验流程");
        Map<String, String> nodeIds = new HashMap<>();
        Set<String> uniqueIds = new HashSet<>();
        for (JsonNode node : nodes) {
            if (node.path("id").asText().isBlank() || !uniqueIds.add(node.path("id").asText())) throw conflict("WORKFLOW_MODEL_UNSAFE", "工资补正节点编号缺失或重复");
            manualNode(node);
            String type = node.path("type").asText();
            if (!List.of("START", "APPROVAL", "END").contains(type) || nodeIds.put(type, node.path("id").asText()) != null) throw conflict("WORKFLOW_MODEL_UNSAFE", "工资补正模型包含未确认节点");
            boolean financeRole = "ROLE".equals(node.path("approverType").asText()) && "finance".equals(node.path("approverValue").asText());
            boolean frozenUsers = "VARIABLE_USER".equals(node.path("approverType").asText()) && "hCorrectionApproverIds".equals(node.path("approverValue").asText());
            if ("APPROVAL".equals(type) && !financeRole && !frozenUsers) throw conflict("WORKFLOW_MODEL_UNSAFE", "工资补正须由真实财务审批人核验");
            if ("AUTO_SKIP".equals(node.path("approveSelf").asText())) throw conflict("WORKFLOW_MODEL_UNSAFE", "关联补正禁止自动跳过自审");
        }
        Set<String> actual = new HashSet<>(); for (JsonNode edge : edges) { unconditional(edge); actual.add(edge.path("source").asText() + ":" + edge.path("target").asText()); }
        if (!actual.equals(Set.of(nodeIds.get("START") + ":" + nodeIds.get("APPROVAL"), nodeIds.get("APPROVAL") + ":" + nodeIds.get("END")))) throw conflict("WORKFLOW_MODEL_UNSAFE", "工资补正模型存在绕过财务的路径");
        List<Long> qualified = mapper.permissionUsers(tenantId(), "workflow:task:complete", employee.getDeptId());
        List<String> approvers = mapper.roleUsers(tenantId(), "finance").stream().filter(qualified::contains)
                .filter(userId -> !userId.equals(applicant) && !userId.equals(beneficiary)).map(String::valueOf).toList();
        if (approvers.isEmpty()) throw conflict("APPROVER_MISSING", "没有排除原申请人后的有效财务审批人");
        Map<String, Object> snapshot = new TreeMap<>(); snapshot.put("applicantUserId", applicant.toString()); snapshot.put(EXCLUDED_USERS, List.of(applicant.toString()));
        if (beneficiary != null) snapshot.put("beneficiaryUserId", beneficiary.toString());
        snapshot.put("hCorrectionApproverIds", approvers); snapshot.put("processKey", processKey); snapshot.put("definitionId", definition.get("definitionId"));
        snapshot.put("definitionVersion", definition.get("version")); snapshot.put("modelDigest", digest(model)); return snapshot;
    }

    public void correctionActor(ObjectNode snapshot, Long approverId) {
        if (approverId == null || mapper.activeUser(tenantId(), approverId) == null) throw conflict("APPROVER_INVALID", "补正回调缺少有效办理人");
        String actor = approverId.toString();
        for (JsonNode excluded : snapshot.path(EXCLUDED_USERS)) if (actor.equals(excluded.asText())) throw forbidden();
        for (JsonNode approved : snapshot.path("hCorrectionApproverIds")) if (actor.equals(approved.asText())) return;
        throw conflict("APPROVER_INVALID", "补正办理人不在冻结的财务名单中");
    }

    public static Long number(Object value) {
        if (value == null) return null;
        if (value instanceof Boolean flag) return flag ? 1L : 0L;
        try { return Long.valueOf(String.valueOf(value)); }
        catch (NumberFormatException failure) { throw conflict("SNAPSHOT_INVALID", "业务编号或版本格式无效"); }
    }

    public record Slot(Long employeeId, LocalDate date, Long assignmentId, Integer assignmentVersion,
            HrShift shift, HrAttendanceRule rule, Map<String, Object> calendar, String effectiveStart) {
        public LocalDateTime start() { return date.atTime(shift.getStartTime()); }
        public LocalDateTime end() { return HrAttendanceJudge.shiftEnd(shift, date); }
    }
}
