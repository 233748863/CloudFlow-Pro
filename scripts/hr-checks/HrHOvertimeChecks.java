package com.cloudflow.hr.service;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.plugins.IgnoreStrategy;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.baomidou.mybatisplus.core.plugins.InterceptorIgnoreHelper;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.staticrules.StaticRuleScanner;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.entity.HrAttendanceCheckin;
import com.cloudflow.hr.domain.entity.HrAttendanceRule;
import com.cloudflow.hr.domain.entity.HrLeavePeriod;
import com.cloudflow.hr.domain.entity.HrOvertimeRequest;
import com.cloudflow.hr.domain.entity.HrShift;
import com.cloudflow.hr.domain.vo.attendance.HrHViews;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrHMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.io.InputStream;
import java.lang.reflect.Method;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.RowBounds;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Modifier;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.UUID;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

public final class HrHOvertimeChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final LocalDate DATE = LocalDate.of(2026, 9, 1);
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 1) throw new IllegalArgumentException("须传仓库路径；本检查不接收数据库参数");
        Path root = Path.of(arguments[0]);
        minutesAndCalendar();
        attendanceEvidence();
        compensatoryRounding();
        strictContracts();
        encryption();
        workflowModel();
        workflowDefinitionVariables();
        runtimeTimeSegments();
        runtimeCalendarSnapshot();
        runtimeResolutionSnapshot();
        attendanceCheckMethods();
        leaveTypeDefaults();
        leavePeriodClosureGuard(root);
        payrollCorrectionPrivacy(root);
        mapperAndDdl(root);
        controllerSafety();
        new StaticRuleScanner(root.resolve("cloudflow-backend/cloudflow-service-hr/src/main/java")).scan();
        System.out.println("PASS: " + checks + " HR-09离线断言；未连接数据库、未发起流程、未启动服务");
    }

    private static void payrollCorrectionPrivacy(Path root) throws Exception {
        Class<?> controller = Class.forName("com.cloudflow.hr.controller.HrPayrollController");
        Method method = controller.getMethod("correct", com.cloudflow.hr.domain.dto.HrPayrollCorrectionRequest.class);
        equal(false, method.getAnnotation(SysLog.class).logParams(), "已发工资补正操作日志不记录正文");
        String source = Files.readString(root.resolve("cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrPayrollCorrectionService.java"));
        equal(false, source.contains("\"diffAmount\", correction.getDiffAmount()"), "补正金额不进入流程变量及审计");
        equal(false, source.contains("\"SUBMIT\", request)"), "补正审计不保存原金额请求");
        equal(true, source.contains("\"correctionSlipId\", delta.getId(), \"targetPeriodId\", period.getPeriodId()"), "补正创建仅审计单据周期状态");
    }

    private static void attendanceCheckMethods() throws Exception {
        HrAttendanceRule rule = new HrAttendanceRule();
        equal(true, rule.hasValidCheckMethods(), "未配置打卡方式保留既有空值语义");
        rule.setCheckMethods(List.of("GPS", "WIFI"));
        equal(List.of("GPS", "WIFI"), rule.getCheckMethods(), "数组打卡方式顺序及含义不变");
        equal(true, rule.hasValidCheckMethods(), "真实方式数组可用");
        equal(JSON.readTree("[\"GPS\",\"WIFI\"]"), rule.getCheckMethodsJson(), "新写入保持原数组格式");
        JsonNode serialized = JSON.valueToTree(rule);
        equal(false, serialized.has("checkMethodsJson"), "内部存储字段不暴露或接受业务写入");
        equal(JSON.readTree("[\"GPS\",\"WIFI\"]"), serialized.path("checkMethods"), "外部接口继续返回数组");
        HrAttendanceRule restored = JSON.readValue("{\"checkMethods\":[\"APP\",\"CARD\"]}", HrAttendanceRule.class);
        equal(List.of("APP", "CARD"), restored.getCheckMethods(), "真实JSON写入仍绑定标准数组");
        equal(true, restored.hasValidCheckMethods(), "JSON写入数组校验一致");
        JsonNode metadata = (JsonNode) new JacksonTypeHandler(JsonNode.class).parse("{\"source\":\"demo_seed\",\"row\":1}");
        rule.setCheckMethodsJson(metadata);
        equal(false, rule.hasValidCheckMethods(), "演示元数据不能当作已核定打卡方式");
        equal(null, rule.getCheckMethods(), "无效对象不被伪装为放行空数组");
        equal(metadata, rule.getCheckMethodsJson(), "对象原始数据读取后未被清空或改写");
        for (String invalid : List.of("{}", "1", "\"GPS\"", "[1]", "[null]", "[\"UNRECOGNIZED\"]")) {
            rule.setCheckMethodsJson(JSON.readTree(invalid));
            equal(false, rule.hasValidCheckMethods(), "非法配置须由业务明确拒绝");
        }
        rule.setCheckMethodsJson(JSON.readTree("null"));
        equal(true, rule.hasValidCheckMethods(), "JSON空值兼容原规则");
        rule.setCheckMethods(List.of());
        equal(true, rule.hasValidCheckMethods(), "显式空数组保留原有语义");
        equal(List.of(), rule.getCheckMethods(), "显式空数组读取保持空数组");
        rule.setCheckMethods(null);
        equal(null, rule.getCheckMethodsJson(), "空值写入不产生虚构配置");
    }

    private static void leaveTypeDefaults() {
        List<String> required = List.of("needQuota", "isPaid", "applicableAfterDays", "carryForwardFlag", "earnedLeaveFlag",
                "earnedLeaveFrequency", "encashmentFlag", "lwpFlag", "partialPaidFlag", "salaryFractionPerDay",
                "compensatoryFlag", "optionalLeaveFlag", "includeHolidayFlag", "allowNegativeFlag",
                "allowOverAllocationFlag", "needAttachmentFlag", "status");
        Map<String, Object> omitted = new java.util.LinkedHashMap<>();
        required.forEach(field -> omitted.put(field, null));
        omitted.put("maxDaysPerYear", null);
        omitted.put("encashmentComponentId", null);
        omitted.put("leaveCode", "H_TEST");
        HrLeaveConfigurationService.preserveTypeDefaults(omitted);
        for (String field : required) equal(false, omitted.containsKey(field), "省略非空假种字段保留当前值或创建默认值：" + field);
        equal(true, omitted.containsKey("maxDaysPerYear"), "可空年度上限仍可明确清除");
        equal(true, omitted.containsKey("encashmentComponentId"), "可空折现项目仍可明确清除");
        equal("H_TEST", omitted.get("leaveCode"), "必填假种编码未被改变");
        Map<String, Object> explicit = new java.util.LinkedHashMap<>(Map.of("applicableAfterDays", 0, "status", 0,
                "salaryFractionPerDay", BigDecimal.ONE, "earnedLeaveFrequency", "MONTHLY"));
        Map<String, Object> original = Map.copyOf(explicit);
        HrLeaveConfigurationService.preserveTypeDefaults(explicit);
        equal(original, explicit, "显式非空配置包含零值仍完整更新");
    }

    private static void leavePeriodClosureGuard(Path root) throws Exception {
        HrLeavePeriod current = new HrLeavePeriod();
        current.setStartDate(LocalDate.of(2025, 1, 1)); current.setEndDate(LocalDate.of(2025, 1, 31)); current.setStatus("OPEN");
        for (String changed : List.of("status", "startDate", "endDate")) {
            HrLeavePeriod payload = new HrLeavePeriod();
            payload.setStartDate(current.getStartDate()); payload.setEndDate(current.getEndDate()); payload.setStatus(current.getStatus());
            if ("status".equals(changed)) payload.setStatus("CLOSED");
            else if ("startDate".equals(changed)) payload.setStartDate(current.getStartDate().plusDays(1));
            else payload.setEndDate(current.getEndDate().plusDays(1));
            fails("OVERTIME_SETTLEMENT_PENDING", () -> HrLeaveConfigurationService.assertPeriodMutable(current, payload, 1, 0));
            fails("OVERTIME_SETTLEMENT_PENDING", () -> HrLeaveConfigurationService.assertPeriodMutable(current, payload, 1, 1));
            fails("PERIOD_IN_USE", () -> HrLeaveConfigurationService.assertPeriodMutable(current, payload, 0, 1));
            HrLeaveConfigurationService.assertPeriodMutable(current, payload, 0, 0);
            equal("OPEN", current.getStatus(), "空周期允许配置修改且校验不改写原状态");
        }
        HrLeavePeriod metadata = new HrLeavePeriod();
        metadata.setStartDate(current.getStartDate()); metadata.setEndDate(current.getEndDate()); metadata.setStatus(current.getStatus());
        metadata.setPeriodName("H_TEST_METADATA");
        HrLeaveConfigurationService.assertPeriodMutable(current, metadata, 2, 1);
        equal("H_TEST_METADATA", metadata.getPeriodName(), "周期元数据更新不绕过日期及关闭限制");
        String source = Files.readString(root.resolve("cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrLeaveConfigurationService.java"));
        equal(true, source.contains("periodMapper.selectLocked(periodId, tenantId())"), "管理关闭与H入账锁同一周期行");
        equal(true, source.contains("assertPeriodMutable(current, payload, hMapper.pendingLeave(tenantId(), periodId)"), "周期修改真实读取H未结算来源");
    }

    private static void minutesAndCalendar() throws Exception {
        equal(1, HrOvertimeCalculator.requestedMinutes(at("18:00"), at("18:01")), "整分钟");
        equal(1440, HrOvertimeCalculator.requestedMinutes(DATE.atStartOfDay(), DATE.plusDays(1).atStartOfDay()), "自然日边界");
        fails("INVALID_PARAMETER", () -> HrOvertimeCalculator.requestedMinutes(at("18:00:01"), at("19:00")));
        fails("INVALID_PARAMETER", () -> HrOvertimeCalculator.requestedMinutes(at("18:00"), DATE.plusDays(1).atTime(0, 1)));
        fails("INVALID_PARAMETER", () -> HrOvertimeCalculator.requestedMinutes(at("18:00"), at("18:00")));
        equal("WORKDAY", HrOvertimeCalculator.dayType("WORKDAY", 0), "补班按工作日");
        equal("REST_DAY", HrOvertimeCalculator.dayType("REST", 0), "实际休息日");
        equal("REST_DAY", HrOvertimeCalculator.dayType("HOLIDAY", 0), "非三倍节假日");
        equal("HOLIDAY", HrOvertimeCalculator.dayType("HOLIDAY", 1), "三倍标志");
        fails("CALENDAR_CONFLICT", () -> HrOvertimeCalculator.dayType("WORKDAY", 1));
        fails("CALENDAR_CONFLICT", () -> HrOvertimeCalculator.dayType("REST", 1));
        fails("CALENDAR_CONFLICT", () -> HrOvertimeCalculator.dayType(null, 0));
        fails("CALENDAR_CONFLICT", () -> HrOvertimeCalculator.dayType("REST", null));
        equal(new BigDecimal("0.02"), HrOvertimeCalculator.hours(1), "小时仅展示");
        equal(new BigDecimal("1.50"), HrOvertimeCalculator.money(1, new BigDecimal("60.00"), new BigDecimal("1.50")), "按分钟最终核价");
        equal(false, HrOvertimeCalculator.exceeds(120, new BigDecimal("2.00")), "上限等值");
        equal(true, HrOvertimeCalculator.exceeds(121, new BigDecimal("2.00")), "上限精确比较");
        equal(true, HrOvertimeCalculator.exceeds(1, new BigDecimal("0.01")), "不按展示小时反算上限");
        fails("OVERTIME_LIMIT_MISSING", () -> HrOvertimeCalculator.exceeds(1, null));
        fails("INVALID_PARAMETER", () -> HrOvertimeCalculator.money(1, new BigDecimal("0.01"), BigDecimal.ONE));
        fails("INVALID_PARAMETER", () -> HrOvertimeCalculator.money(1440, new BigDecimal("9999999999999999.99"), new BigDecimal("99.99")));
    }

    private static void attendanceEvidence() throws Exception {
        HrShift shift = shift("09:00", "18:00", 480, 60, 30);
        HrAttendanceRule rule = rule("12:00", "13:00");
        List<HrAttendanceCheckin> full = cards(DATE, "09:00", "20:00");
        HrOvertimeCalculator.Calculation complete = calculate(shift, rule, true, at("18:00"), at("20:00"), full);
        equal(90, complete.actualMinutes(), "工作日应工作与阈值只扣一次");
        equal(30, complete.excludedMinutes(), "阈值占用区间");
        int first = calculate(shift, rule, true, at("18:00"), at("19:00"), full).actualMinutes();
        int second = calculate(shift, rule, true, at("19:00"), at("20:00"), full).actualMinutes();
        equal(90, first + second, "非重叠拆单不重复扣阈值");
        equal(0, calculate(shift, rule, true, at("09:00"), at("10:00"), cards(DATE, "10:00", "20:00")).actualMinutes(), "迟到空档不是加班");
        equal(30, calculate(shift, rule, true, at("18:00"), at("20:00"), cards(DATE, "10:00", "20:00")).actualMinutes(), "迟到后先补应工作分钟");
        equal(90, calculate(shift, rule, false, at("18:00"), at("20:00"), cards(DATE, "18:00", "20:00")).actualMinutes(), "休息日应工作为零但扣阈值");
        shift.setWorkingHoursCalcMode("PAIRED"); shift.setCheckinDetermineMode("ALTERNATING");
        equal(90, calculate(shift, rule, true, at("18:00"), at("20:00"), cards(DATE, "09:00", "12:00", "13:00", "20:00")).actualMinutes(), "成对卡午休不重复扣除");
        shift.setWorkingHoursCalcMode("FIRST_LAST"); shift.setCheckinDetermineMode("EARLIEST_LATEST");
        fails("BREAK_EVIDENCE_REQUIRED", () -> calculate(shift, rule, true, at("18:00"), at("20:00"), cards(DATE, "09:00", "12:00", "14:00", "20:00")));
        fails("SHIFT_BREAK_REQUIRED", () -> calculate(shift, rule(null, null), true, at("18:00"), at("20:00"), full));
        fails("SHIFT_BREAK_INVALID", () -> calculate(shift, rule("12:00:30", "13:00:30"), true, at("18:00"), at("20:00"), full));
        fails("PAIRED_CHECKINS_REQUIRED", () -> calculate(shift, rule, true, at("18:00"), at("20:00"), full.subList(0, 1)));
        List<HrAttendanceCheckin> invalid = cards(DATE, "09:00", "20:00"); invalid.get(0).setSkipAutoFlag(1);
        fails("CHECKIN_EVIDENCE_INVALID", () -> calculate(shift, rule, true, at("18:00"), at("20:00"), invalid));
        invalid.get(0).setSkipAutoFlag(0); invalid.get(1).setLocationValidFlag(0);
        fails("CHECKIN_EVIDENCE_INVALID", () -> calculate(shift, rule, true, at("18:00"), at("20:00"), invalid));
        invalid.get(1).setLocationValidFlag(1); invalid.get(1).setLogType("IN");
        fails("CHECKIN_PAIR_CONFLICT", () -> calculate(shift, rule, true, at("18:00"), at("20:00"), invalid));
        invalid.get(1).setLogType("OUT"); invalid.get(1).setCheckTime(null);
        fails("CHECKIN_EVIDENCE_INVALID", () -> calculate(shift, rule, true, at("18:00"), at("20:00"), invalid));
        shift.setOvertimeThresholdMinutes(null);
        fails("ATTENDANCE_POLICY_MISSING", () -> calculate(shift, rule, true, at("18:00"), at("20:00"), full));
        HrShift night = shift("22:00", "06:00", 480, 0, 30);
        List<HrAttendanceCheckin> crossing = List.of(card(1L, DATE, at("23:00"), "IN"), card(2L, DATE, DATE.plusDays(1).atTime(1, 0), "OUT"));
        int beforeMidnight = calculate(night, rule(null, null), false, at("23:00"), DATE.plusDays(1).atStartOfDay(), crossing).actualMinutes();
        int afterMidnight = calculate(night, rule(null, null), false, DATE.plusDays(1).atStartOfDay(), DATE.plusDays(1).atTime(1, 0), crossing).actualMinutes();
        equal(30, beforeMidnight, "跨夜午夜前"); equal(60, afterMidnight, "跨夜午夜后");
        equal(90, beforeMidnight + afterMidnight, "自然日拆单无重叠");
        HrShift precise = shift("09:00", "18:00", 480, 0, 0);
        List<HrAttendanceCheckin> seconds = cards(DATE, "18:00:01", "19:00:59");
        equal(59, calculate(precise, rule(null, null), false, at("18:00"), at("19:01"), seconds).actualMinutes(), "原始秒数向内取整分钟");
        equal(1, seconds.get(0).getOffshiftFlag(), "不回写D窗口标志");
        equal(null, seconds.get(0).getOvertimeRequestId(), "不回写历史申请关联");
    }

    private static void compensatoryRounding() throws Exception {
        BigInteger weighted = BigInteger.ZERO; BigDecimal credited = new BigDecimal("0.00");
        List<BigDecimal> firstThree = new ArrayList<>();
        for (int index = 0; index < 60; index++) {
            HrOvertimeCalculator.Rounding rounding = HrOvertimeCalculator.rounding(weighted, credited, 1, BigDecimal.ONE);
            if (index < 3) firstThree.add(rounding.quantity());
            weighted = rounding.weightedAfter(); credited = credited.add(rounding.quantity());
        }
        equal(List.of(new BigDecimal("0.01"), new BigDecimal("0.02"), new BigDecimal("0.02")), firstThree, "三笔一分钟累计差额");
        equal(new BigDecimal("1.00"), credited, "六十笔不抬高额度");
        HrOvertimeCalculator.Rounding zero = HrOvertimeCalculator.rounding(BigInteger.ZERO, BigDecimal.ZERO, 1, new BigDecimal("0.01"));
        equal(new BigDecimal("0.00"), zero.quantity(), "零差额保留分钟");
        equal(new BigDecimal("0.01"), HrOvertimeCalculator.rounding(zero.weightedAfter(), zero.creditAfter(), 59, new BigDecimal("0.01")).quantity(), "零差额参与后续累计");
        List<int[]> pieces = new ArrayList<>(List.of(new int[]{1, 100}, new int[]{7, 125}, new int[]{13, 250}, new int[]{1, 1}));
        for (int seed = 0; seed < 30; seed++) {
            Collections.shuffle(pieces, new Random(seed)); weighted = BigInteger.ZERO; credited = BigDecimal.ZERO;
            for (int[] piece : pieces) {
                HrOvertimeCalculator.Rounding rounding = HrOvertimeCalculator.rounding(weighted, credited, piece[0], BigDecimal.valueOf(piece[1], 2));
                weighted = rounding.weightedAfter(); credited = credited.add(rounding.quantity());
            }
            equal(new BigDecimal("0.70"), credited, "不同比例版本任意顺序合计");
        }
        fails("ROUNDING_HISTORY_CONFLICT", () -> HrOvertimeCalculator.rounding(BigInteger.valueOf(100), new BigDecimal("0.02"), 1, BigDecimal.ONE));
        fails("QUANTITY_OVERFLOW", () -> HrOvertimeCalculator.credit(new BigInteger("6000000000")));
        fails("INVALID_PARAMETER", () -> HrOvertimeCalculator.weighted(1, new BigDecimal("0.001")));
    }

    private static void strictContracts() throws Exception {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            HrHRequests.OvertimePayReviewDTO input = JSON.readValue("{\"version\":1,\"hourlyRate\":\"60.00\",\"payrollPeriodId\":\"9007199254740993\",\"note\":\"离线检查参数\"}", HrHRequests.OvertimePayReviewDTO.class);
            equal(true, factory.getValidator().validate(input).isEmpty(), "字符串金额与BIGINT输入");
            input.setHourlyRate(new BigDecimal("1.001")); equal(false, factory.getValidator().validate(input).isEmpty(), "拒绝越界精度");
            for (String field : List.of("tenantId", "employeeId", "applicantUserId", "_hExcludedUserIds", "sourceBizId", "approvedMinutes", "processKey")) {
                rejected(() -> JSON.readValue("{\"" + field + "\":\"untrusted\"}", HrHRequests.OvertimeDraftDTO.class));
            }
        }
        HrHViews.OvertimeListVO view = new HrHViews.OvertimeListVO(); view.setRequestId(9007199254740993L); view.setActualHours(new BigDecimal("0.02"));
        JsonNode json = JSON.valueToTree(view); equal(true, json.path("requestId").isTextual(), "ID输出不丢精度"); equal(true, json.path("actualHours").isTextual(), "小时输出字符串");
        HrOvertimeRequest entity = new HrOvertimeRequest(); entity.setHourlyRateCipher("private-value"); entity.setSettlementAmountCipher("private-value"); entity.setPriceNote("private-value");
        equal(false, JSON.writeValueAsString(entity).contains("private-value"), "实体保底不序列化核价敏感字段");
        for (Class<?> type : List.of(HrHViews.OvertimeListVO.class, HrHViews.OvertimeDetailVO.class, HrHViews.OvertimeExportVO.class)) {
            equal(false, Arrays.stream(type.getMethods()).anyMatch(method -> List.of("getHourlyRate", "getSettlementAmount", "getPriceNote", "getPayrollPeriodId").contains(method.getName())), "一般视图无核价私有字段");
        }
    }

    private static void encryption() throws Exception {
        DefaultListableBeanFactory factory = new DefaultListableBeanFactory(); EncryptorProperties properties = new EncryptorProperties();
        factory.registerSingleton("offlineEncryption", properties); HrHCipherService cipher = new HrHCipherService(factory.getBeanProvider(EncryptorProperties.class));
        fails("PAY_ENCRYPTION_UNAVAILABLE", () -> cipher.seal("1.50"));
        properties.setEnabled(true); properties.setAesKey("invalid"); fails("PAY_ENCRYPTION_UNAVAILABLE", () -> cipher.seal("1.50"));
        properties.setAesKey(UUID.randomUUID().toString().replace("-", ""));
        String first = cipher.seal("1.50"); String second = cipher.seal("1.50");
        equal(false, first.equals(second), "随机IV避免相同金额同密文"); equal("1.50", cipher.open(first), "认证加密往返");
        String modified = first.substring(0, first.length() - 5) + (first.charAt(first.length() - 5) == 'A' ? 'B' : 'A') + first.substring(first.length() - 4);
        fails("PAY_CIPHER_INVALID", () -> cipher.open(modified)); fails("PAY_CIPHER_INVALID", () -> cipher.open("1.50"));
        properties.setEnabled(false); fails("PAY_ENCRYPTION_UNAVAILABLE", () -> cipher.open(first));
    }

    private static void workflowModel() throws Exception {
        HrHSupport helper = new HrHSupport(null, null, null, null, null, null, null, null, null, JSON, null);
        Method validator = HrHSupport.class.getDeclaredMethod("validateModel", ObjectNode.class); validator.setAccessible(true);
        ObjectNode model = (ObjectNode) JSON.readTree("{\"nodes\":[{\"id\":\"start\",\"type\":\"START\"},{\"id\":\"responsible\",\"type\":\"APPROVAL\",\"approverType\":\"VARIABLE_USER\",\"approverValue\":\"responsibleApproverIds\",\"allowDelegate\":false,\"allowAddSign\":false},{\"id\":\"hr\",\"type\":\"APPROVAL\",\"approverType\":\"VARIABLE_USER\",\"approverValue\":\"hrApproverIds\",\"allowDelegate\":false,\"allowAddSign\":false},{\"id\":\"end\",\"type\":\"END\"}],\"edges\":[{\"source\":\"start\",\"target\":\"responsible\"},{\"source\":\"responsible\",\"target\":\"hr\"},{\"source\":\"hr\",\"target\":\"end\"}]}");
        validator.invoke(helper, model); checks++;
        ObjectNode changed = model.deepCopy(); ((ObjectNode) changed.path("nodes").get(1)).put("slaHours", 1);
        fails("WORKFLOW_MODEL_UNSAFE", () -> validator.invoke(helper, changed));
        ObjectNode delegation = model.deepCopy(); ((ObjectNode) delegation.path("nodes").get(1)).put("allowDelegate", true);
        fails("WORKFLOW_MODEL_UNSAFE", () -> validator.invoke(helper, delegation));
        ObjectNode conditional = model.deepCopy(); ((ObjectNode) conditional.path("edges").get(0)).put("condition", "true");
        fails("WORKFLOW_MODEL_UNSAFE", () -> validator.invoke(helper, conditional));
        ObjectNode duplicate = model.deepCopy(); ((ObjectNode) duplicate.path("nodes").get(1)).put("id", "start");
        fails("WORKFLOW_MODEL_UNSAFE", () -> validator.invoke(helper, duplicate));
        ObjectNode advance = model.deepCopy();
        ((ObjectNode) advance.path("nodes").get(2)).put("approverValue", "financeApproverIds").put("signType", "ANY");
        helper.validateAdvanceModel(advance); checks++;
        ObjectNode noAny = advance.deepCopy(); ((ObjectNode) noAny.path("nodes").get(2)).remove("signType");
        fails("WORKFLOW_MODEL_UNSAFE", () -> helper.validateAdvanceModel(noAny));
        ObjectNode overridden = advance.deepCopy(); ((ObjectNode) overridden.path("nodes").get(2)).putObject("props").put("signType", "ALL");
        fails("WORKFLOW_MODEL_UNSAFE", () -> helper.validateAdvanceModel(overridden));
        ObjectNode agent = advance.deepCopy(); ((ObjectNode) agent.path("nodes").get(1)).put("allowAgent", true);
        fails("WORKFLOW_MODEL_UNSAFE", () -> helper.validateAdvanceModel(agent));
    }

    private static void workflowDefinitionVariables() throws Exception {
        ObjectNode snapshot = JSON.createObjectNode().put("definitionId", "h-frozen-definition").put("definitionVersion", 7).put("modelDigest", "a".repeat(64));
        Map<String, Object> supplied = Map.of("definitionId", "untrusted", "definitionVersion", 1, "modelDigest", "untrusted", "applicantUserId", "9007199254740993");
        Map<String, Object> frozen = HrRuleWorkflowService.frozenDefinitionVariables(supplied, snapshot);
        equal("h-frozen-definition", frozen.get("definitionId"), "流程编号只取冻结快照");
        equal(7, frozen.get("definitionVersion"), "流程版本只取冻结快照");
        equal("a".repeat(64), frozen.get("modelDigest"), "模型摘要只取冻结快照");
        equal("9007199254740993", frozen.get("applicantUserId"), "原申请人字符串保留");
        equal("untrusted", supplied.get("definitionId"), "内部调用变量不被就地覆盖");
        for (String field : List.of("definitionId", "definitionVersion", "modelDigest")) {
            ObjectNode missing = snapshot.deepCopy(); missing.remove(field);
            fails("WORKFLOW_DEFINITION_SNAPSHOT_INVALID", () -> HrRuleWorkflowService.frozenDefinitionVariables(supplied, missing));
        }
        ObjectNode invalidVersion = snapshot.deepCopy().put("definitionVersion", 0);
        fails("WORKFLOW_DEFINITION_SNAPSHOT_INVALID", () -> HrRuleWorkflowService.frozenDefinitionVariables(supplied, invalidVersion));
    }

    private static void runtimeTimeSegments() throws Exception {
        Jackson2ObjectMapperBuilder builder = new org.springframework.http.converter.json.Jackson2ObjectMapperBuilder();
        new com.cloudflow.hr.config.HrJacksonConfig().hrJacksonCustomizer().customize(builder);
        ObjectMapper runtime = builder.build();
        HrOvertimeCalculator.Span span = new HrOvertimeCalculator.Span(at("17:31"), at("18:31"), List.of(9007199254740993L, 9007199254740994L), "WORK");
        rejected(() -> runtime.convertValue(span, HrHViews.TimeSegmentVO.class));
        HrOvertimeCalculator.Calculation calculation = new HrOvertimeCalculator.Calculation(60, 0, 480, 30, List.of(span), List.of());
        HrHViews.TimeSegmentVO segment = HrOvertimeService.segments(calculation).get(0);
        equal(at("17:31"), segment.getStartTime(), "真实HR时间配置下直接保留分钟起点");
        equal(60, segment.getMinutes(), "真实HR时间配置下保留分钟差");
        JsonNode encoded = runtime.valueToTree(segment);
        equal("2026-09-01T17:31:00", encoded.path("startTime").asText(), "H时间接口仍采用T分隔格式");
        equal("9007199254740993", encoded.path("sourceCheckinIds").get(0).asText(), "原始打卡ID保持字符串精度");
        equal(at("17:31"), runtime.treeToValue(encoded, HrHViews.TimeSegmentVO.class).getStartTime(), "冻结工时分段可回读");
    }

    private static void runtimeCalendarSnapshot() throws Exception {
        Jackson2ObjectMapperBuilder builder = new org.springframework.http.converter.json.Jackson2ObjectMapperBuilder();
        new com.cloudflow.hr.config.HrJacksonConfig().hrJacksonCustomizer().customize(builder);
        ObjectMapper runtime = builder.build();
        HrHSupport helper = new HrHSupport(null, null, null, null, null, null, null, null, null, runtime, null);
        Map<String, Object> calendar = new java.util.TreeMap<>(Map.of("calendarId", 25849051L, "calendarVersion", 0,
                "dateType", "WORKDAY", "triplePayFlag", 0, "weeklyRestDays", "6,7", "date", "2026-07-13"));
        ObjectNode stored = helper.tree(helper.json(calendar));
        equal(false, runtime.convertValue(calendar, JsonNode.class).equals(stored), "真实HR配置复现长整数日历编号回读误判");
        equal(true, helper.matchesSnapshot(calendar, stored), "日历快照按持久化JSON语义严格比较");
        for (Map.Entry<String, Object> change : Map.<String, Object>of("calendarId", 25849052L, "calendarVersion", 1, "dateType", "REST",
                "triplePayFlag", 1, "weeklyRestDays", "7", "date", "2026-07-14").entrySet()) {
            Map<String, Object> changed = new java.util.TreeMap<>(calendar);
            changed.put(change.getKey(), change.getValue());
            equal(false, helper.matchesSnapshot(changed, stored), "实际日历依据变化仍必须拒绝：" + change.getKey());
        }
        equal(false, helper.matchesSnapshot(calendar, stored.deepCopy().put("calendarId", "25849051")), "字段字符串与数字类型变化不被放宽");
        equal(false, helper.matchesSnapshot(calendar, null), "缺失冻结快照不能通过");
        calendar.put("calendarId", 9007199254740993L);
        ObjectNode largeIdentifier = helper.tree(helper.json(calendar));
        equal(true, helper.matchesSnapshot(calendar, largeIdentifier), "大编号日历快照精度保持不变");
        calendar.put("calendarId", 9007199254740994L);
        equal(false, helper.matchesSnapshot(calendar, largeIdentifier), "大编号相差一仍识别为依据变化");
    }

    private static void runtimeResolutionSnapshot() throws Exception {
        Jackson2ObjectMapperBuilder builder = new org.springframework.http.converter.json.Jackson2ObjectMapperBuilder();
        new com.cloudflow.hr.config.HrJacksonConfig().hrJacksonCustomizer().customize(builder);
        ObjectMapper runtime = builder.build();
        HrHSupport helper = new HrHSupport(null, null, null, null, null, null, null, null, null, runtime, null);
        ObjectNode stored = runtime.createObjectNode().put("action", "PAY_CORRECTION")
                .put("handledTime", LocalDateTime.of(2026, 9, 14, 21, 30, 0, 123456700).toString());
        rejected(() -> helper.convert(stored, HrHViews.ResolutionVO.class));
        for (String timestamp : List.of("2026-09-14T21:30", "2026-09-14T21:30:00", "2026-09-14T21:30:12.123",
                "2026-09-14T21:30:12.123456", "2026-09-14T21:30:12.123456789")) {
            stored.put("handledTime", timestamp).put("originalPeriodId", "9007199254740993")
                    .put("targetPeriodId", "9007199254740994").put("originalSlipId", "9007199254740995")
                    .put("correctionSlipId", "9007199254740996").put("operatorId", "9007199254740997").put("reason", "test");
            HrHViews.ResolutionVO view = HrOvertimeSettlementService.resolutionView(helper, stored.toString());
            equal(LocalDateTime.parse(timestamp), view.getHandledTime(), "处置时间按内部ISO精度准确读取");
            equal(9007199254740993L, view.getOriginalPeriodId(), "处置原周期大编号不丢精度");
            equal(9007199254740994L, view.getTargetPeriodId(), "处置目标周期不变");
            equal(9007199254740995L, view.getOriginalSlipId(), "处置原工资编号不变");
            equal(9007199254740996L, view.getCorrectionSlipId(), "处置关联补正编号不变");
            equal(9007199254740997L, view.getOperatorId(), "处置办理人编号不变");
            equal("PAY_CORRECTION", view.getAction(), "处置动作不变");
            equal("test", view.getReason(), "处置原因不变");
            JsonNode encoded = runtime.valueToTree(view);
            equal(LocalDateTime.parse(timestamp).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")),
                    encoded.path("handledTime").asText(), "处置对外时间仍保持既有秒格式");
            equal("9007199254740996", encoded.path("correctionSlipId").asText(), "处置关联补正编号按字符串输出");
        }
        equal(null, HrOvertimeSettlementService.resolutionView(helper, null), "未处置申请保持空处置结果");
        stored.putNull("handledTime");
        equal(null, HrOvertimeSettlementService.resolutionView(helper, stored.toString()).getHandledTime(), "空处置时间不伪造当前时间");
        try {
            HrOvertimeSettlementService.resolutionView(helper, stored.put("handledTime", "invalid").toString());
            throw new AssertionError("非法处置时间未拒绝");
        } catch (HrHException failure) {
            equal("SNAPSHOT_INVALID", failure.getCode(), "非法处置时间返回安全业务错误码");
        }
    }

    private static void mapperAndDdl(Path root) throws Exception {
        Path mapper = root.resolve("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrHMapper.xml");
        MybatisConfiguration configuration = new MybatisConfiguration();
        try (InputStream input = Files.newInputStream(mapper)) { new XMLMapperBuilder(input, configuration, mapper.toString(), configuration.getSqlFragments()).parse(); }
        String prefix = "com.cloudflow.hr.mapper.HrHMapper.";
        for (String name : List.of("overtimeReplay", "shiftReplay", "payrollPeriodLocked", "settledCredits", "insertOvertimeChange", "approvedDays")) equal(true, configuration.hasStatement(prefix + name), "HR XML语句可解析");
        lockingSqlBoundaries(configuration);
        String creditSql = configuration.getMappedStatement(prefix + "settledCredits").getBoundSql(Map.of()).getSql();
        equal(false, creditSql.contains("compensatory_quantity > 0"), "累计查询包含零差额");
        equal(true, creditSql.contains("leave_period_id ="), "原周期累计键");
        String ddl = Files.readString(root.resolve("cloudflow-backend/DB/03.cloudflow-hr.sql"));
        for (String table : List.of("hr_overtime_type", "hr_overtime_request", "hr_shift_request")) equal(1, ddl.split("CREATE TABLE " + table + " ", -1).length - 1, "三张独立实体各一表");
        for (String index : List.of("uk_hr_ot_request_idem", "uk_hr_shift_request_idem", "uk_hr_comp_change_source", "uk_hr_leave_ledger_event", "uk_hr_schedule_shift_request")) equal(true, ddl.contains(index), "创建与来源数据库唯一键");
    }

    private static void lockingSqlBoundaries(MybatisConfiguration configuration) throws Exception {
        equal(null, HrHMapper.class.getAnnotation(InterceptorIgnore.class), "HR不设置全类租户豁免");
        IgnoreStrategy strategy = InterceptorIgnoreHelper.initSqlParserInfoCache(HrHMapper.class);
        int ignoredMethods = 0;
        for (Method method : HrHMapper.class.getDeclaredMethods()) {
            if (!method.isAnnotationPresent(InterceptorIgnore.class)) continue;
            ignoredMethods++;
            equal("lockEmployees", method.getName(), "仅显式租户员工有序锁查询跳过二次改写");
            InterceptorIgnoreHelper.initSqlParserInfoCache(strategy, HrHMapper.class.getName(), method);
        }
        equal(1, ignoredMethods, "员工锁查询方法级租户豁免唯一");
        for (Long tenantId : List.of(100000L, 100001L)) {
            TenantLineInnerInterceptor interceptor = new TenantLineInnerInterceptor(new TenantLineHandler() {
                @Override
                public Expression getTenantId() { return new LongValue(tenantId); }
            });
            Map<String, Object> parameters = Map.of("tenantId", tenantId, "employeeIds", List.of(100L, 101L));
            MappedStatement statement = configuration.getMappedStatement(HrHMapper.class.getName() + ".lockEmployees");
            BoundSql bound = statement.getBoundSql(parameters);
            String original = bound.getSql();
            equal(true, original.matches("(?s).*tenant_id\\s*=\\s*\\?.*"), "员工锁查询显式限制租户");
            equal(1L, bound.getParameterMappings().stream().filter(parameter -> "tenantId".equals(parameter.getProperty())).count(), "租户参数精确绑定一次");
            equal(tenantId, ((Map<?, ?>) bound.getParameterObject()).get("tenantId"), "两租户保持各自绑定参数");
            equal(3, bound.getParameterMappings().size(), "员工锁查询绑定租户及双方员工");
            interceptor.beforeQuery(null, statement, parameters, RowBounds.DEFAULT, null, bound);
            equal(original, bound.getSql(), "真实租户拦截器保持有序锁查询原样");
            equal(true, bound.getSql().trim().endsWith("ORDER BY id FOR UPDATE"), "排序后锁定保持数据库合法语法");
            MappedStatement ordinary = configuration.getMappedStatement(HrHMapper.class.getName() + ".overtimeLocked");
            Map<String, Long> ordinaryParameters = Map.of("tenantId", tenantId, "id", 100L);
            BoundSql ordinaryBound = ordinary.getBoundSql(ordinaryParameters);
            interceptor.beforeQuery(null, ordinary, ordinaryParameters, RowBounds.DEFAULT, null, ordinaryBound);
            equal(true, ordinaryBound.getSql().contains("tenant_id = " + tenantId), "其他HR查询继续经过租户拦截器");
        }
    }

    private static void controllerSafety() throws Exception {
        for (String name : List.of("HrOvertimeRequestController", "HrOvertimeTypeController", "HrShiftRequestController")) {
            for (Method method : Class.forName("com.cloudflow.hr.controller." + name).getDeclaredMethods()) {
                if (!Modifier.isPublic(method.getModifiers())) continue;
                equal(true, method.isAnnotationPresent(SaCheckPermission.class), "H端点权限保护");
                SysLog log = method.getAnnotation(SysLog.class); if (log != null) equal(false, log.logParams(), "H日志不记录正文");
            }
        }
        for (Class<?> service : List.of(HrOvertimeService.class, HrShiftRequestService.class, HrOvertimeTypeService.class, HrOvertimeSettlementService.class)) {
            for (Method method : service.getDeclaredMethods()) {
                if (Modifier.isPublic(method.getModifiers()) && List.of("delete", "cancel", "resolve", "changeStatus").contains(method.getName())) {
                    Audit audit = method.getAnnotation(Audit.class); equal(true, audit != null && audit.highRisk(), "高风险审计声明");
                }
            }
        }
    }

    private static HrOvertimeCalculator.Calculation calculate(HrShift shift, HrAttendanceRule rule, boolean workday, LocalDateTime from, LocalDateTime to, List<HrAttendanceCheckin> cards) {
        return HrOvertimeCalculator.calculate(shift, rule, DATE, workday, from, to, cards);
    }

    private static HrShift shift(String from, String to, int expected, int rest, int threshold) {
        HrShift shift = new HrShift(); shift.setId(100L); shift.setStartTime(LocalTime.parse(from)); shift.setEndTime(LocalTime.parse(to));
        shift.setWorkMinutes(expected); shift.setBreakMinutes(rest); shift.setOvertimeThresholdMinutes(threshold);
        shift.setWorkingHoursCalcMode("FIRST_LAST"); shift.setCheckinDetermineMode("EARLIEST_LATEST"); return shift;
    }

    private static HrAttendanceRule rule(String from, String to) {
        HrAttendanceRule rule = new HrAttendanceRule(); rule.setId(100L); rule.setShiftId(100L);
        ObjectNode configuration = JSON.createObjectNode(); if (from != null) configuration.put("breakStartTime", from); if (to != null) configuration.put("breakEndTime", to);
        rule.setConfigJson(configuration); return rule;
    }

    private static List<HrAttendanceCheckin> cards(LocalDate attendanceDate, String... times) {
        List<HrAttendanceCheckin> cards = new ArrayList<>();
        for (int index = 0; index < times.length; index++) cards.add(card((long) index + 1, attendanceDate, attendanceDate.atTime(LocalTime.parse(times[index])), index % 2 == 0 ? "IN" : "OUT"));
        return cards;
    }

    private static HrAttendanceCheckin card(Long id, LocalDate date, LocalDateTime time, String direction) {
        HrAttendanceCheckin card = new HrAttendanceCheckin(); card.setCheckinId(id); card.setShiftId(100L); card.setAttendanceDate(date);
        card.setCheckTime(time); card.setLogType(direction); card.setSkipAutoFlag(0); card.setOffshiftFlag(1); card.setLocationValidFlag(1); return card;
    }

    private static LocalDateTime at(String time) { return DATE.atTime(LocalTime.parse(time)); }
    private static void equal(Object expected, Object actual, String label) { if (!Objects.equals(expected, actual)) throw new AssertionError(label); checks++; }
    private static void fails(String code, Checked action) throws Exception {
        try { action.run(); } catch (Exception failure) {
            Throwable cause = failure instanceof InvocationTargetException invocation ? invocation.getTargetException() : failure;
            String actual = cause instanceof HrHException business ? business.getCode() : cause instanceof HrBusinessException business ? business.getCode() : null;
            if (!code.equals(actual)) throw new AssertionError("错误码不匹配：" + code + " / " + actual, failure); checks++; return;
        }
        throw new AssertionError("未拒绝无效输入：" + code);
    }
    private static void rejected(Checked action) throws Exception { try { action.run(); } catch (Exception expected) { checks++; return; } throw new AssertionError("未知字段未拒绝"); }
    private interface Checked { void run() throws Exception; }
}
