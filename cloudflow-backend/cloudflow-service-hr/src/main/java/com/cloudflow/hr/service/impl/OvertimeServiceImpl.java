package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.OvertimeApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OvertimeApplicationQueryDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.LeaveQuota;
import com.cloudflow.hr.domain.entity.LeaveType;
import com.cloudflow.hr.domain.entity.OvertimeApplication;
import com.cloudflow.hr.domain.vo.OvertimeApplicationVO;
import com.cloudflow.hr.domain.vo.OvertimeStatisticsVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.LeaveQuotaMapper;
import com.cloudflow.hr.mapper.LeaveTypeMapper;
import com.cloudflow.hr.mapper.OvertimeApplicationMapper;
import com.cloudflow.hr.service.OvertimeService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 加班管理服务实现类
 * 提供加班申请、审批和统计功能
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OvertimeServiceImpl implements OvertimeService {

    private final OvertimeApplicationMapper overtimeApplicationMapper;
    private final EmployeeMapper employeeMapper;
    private final LeaveTypeMapper leaveTypeMapper;
    private final LeaveQuotaMapper leaveQuotaMapper;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;
    private final ObjectMapper objectMapper;

    // 加班转换比例配置
    private static final BigDecimal WORKDAY_RATIO = new BigDecimal("1.0");   // 工作日加班：1:1转调休
    private static final BigDecimal WEEKEND_RATIO = new BigDecimal("1.5");   // 周末加班：1:1.5转调休
    private static final BigDecimal HOLIDAY_RATIO = new BigDecimal("2.0");   // 节假日加班：1:2转调休

    // 每日加班时长上限（小时）
    private static final BigDecimal DAILY_OVERTIME_LIMIT = new BigDecimal("4.0");

    /**
     * 创建加班申请
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createOvertimeApplication(OvertimeApplicationCreateDTO dto) {
        log.info("创建加班申请，员工ID: {}, 开始时间: {}, 结束时间: {}", 
                dto.getEmployeeId(), dto.getStartTime(), dto.getEndTime());

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在");
        }
        validateOvertimeEligibleEmployee(employee);

        // 验证时间范围
        if (dto.getEndTime().isBefore(dto.getStartTime())) {
            throw new HrBusinessException("结束时间不能早于开始时间");
        }

        // 计算加班时长（小时）
        long minutes = ChronoUnit.MINUTES.between(dto.getStartTime(), dto.getEndTime());
        BigDecimal duration = new BigDecimal(minutes).divide(new BigDecimal("60"), 2, RoundingMode.HALF_UP);

        // 验证加班时长上限
        if (duration.compareTo(DAILY_OVERTIME_LIMIT) > 0) {
            throw new HrBusinessException("单次加班时长不能超过" + DAILY_OVERTIME_LIMIT + "小时");
        }

        // 根据加班类型和补偿类型计算补偿时长
        BigDecimal compensationHours = calculateCompensationHours(duration, dto.getOvertimeType(), dto.getCompensationType());

        // 生成申请编号
        String applicationNo = generateApplicationNo();

        // 创建加班申请实体
        OvertimeApplication application = new OvertimeApplication();
        BeanUtils.copyProperties(dto, application);
        application.setTenantId(tenantId);
        application.setApplicationNo(applicationNo);
        application.setDuration(duration);
        application.setCompensationHours(compensationHours);
        application.setStatus("DRAFT");

        // 保存到数据库
        overtimeApplicationMapper.insert(application);

        log.info("加班申请创建成功，申请编号: {}, ID: {}", applicationNo, application.getId());
        return application.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateOvertimeApplication(Long id, OvertimeApplicationCreateDTO dto) {
        Long tenantId = SecurityUtils.getTenantId();
        OvertimeApplication application = overtimeApplicationMapper.selectById(id);
        if (application == null || !application.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("加班申请不存在");
        }
        if (!"DRAFT".equals(application.getStatus()) && !"REJECTED".equals(application.getStatus())) {
            throw new HrBusinessException("只有草稿或已驳回的申请才允许编辑");
        }

        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在");
        }
        validateOvertimeEligibleEmployee(employee);

        if (dto.getEndTime().isBefore(dto.getStartTime())) {
            throw new HrBusinessException("结束时间不能早于开始时间");
        }

        BigDecimal duration = calculateDuration(dto.getStartTime(), dto.getEndTime());
        if (duration.compareTo(DAILY_OVERTIME_LIMIT) > 0) {
            throw new HrBusinessException("单次加班时长不能超过" + DAILY_OVERTIME_LIMIT + "小时");
        }

        application.setEmployeeId(dto.getEmployeeId());
        application.setStartTime(dto.getStartTime());
        application.setEndTime(dto.getEndTime());
        application.setDuration(duration);
        application.setOvertimeType(dto.getOvertimeType());
        application.setReason(dto.getReason());
        application.setCompensationType(dto.getCompensationType());
        application.setCompensationHours(
                calculateCompensationHours(duration, dto.getOvertimeType(), dto.getCompensationType()));
        application.setProcessInstanceId(null);
        application.setStatus("DRAFT");
        overtimeApplicationMapper.updateById(application);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteOvertimeApplication(Long id) {
        Long tenantId = SecurityUtils.getTenantId();
        OvertimeApplication application = overtimeApplicationMapper.selectById(id);
        if (application == null || !application.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("加班申请不存在");
        }
        if (!"DRAFT".equals(application.getStatus()) && !"REJECTED".equals(application.getStatus())) {
            throw new HrBusinessException("只有草稿或已驳回的申请才允许删除");
        }

        overtimeApplicationMapper.deleteById(id);
    }

    /**
     * 提交加班申请（启动审批流程）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitOvertimeApplication(Long id) {
        log.info("提交加班申请，ID: {}", id);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 查询加班申请
        OvertimeApplication application = overtimeApplicationMapper.selectById(id);
        tenantId = application != null ? application.getTenantId() : tenantId;
        if (application == null || !application.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("加班申请不存在");
        }

        // 验证状态
        if (!"DRAFT".equals(application.getStatus())) {
            throw new HrBusinessException("只有草稿状态的申请才能提交");
        }

        // TODO: 调用Workflow服务启动审批流程
        // String processInstanceId = workflowServiceClient.startProcess(...);
        // application.setProcessInstanceId(processInstanceId);

        // 更新状态为审批中
        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(application.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getOvertime());
        processStartDTO.setBusinessType("OVERTIME");
        processStartDTO.setBusinessId(application.getId());
        processStartDTO.setBusinessNo(application.getApplicationNo());
        processStartDTO.setProcessTitle("加班申请-" + application.getApplicationNo());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        Map<String, Object> variables = new HashMap<>();
        variables.put("employeeId", application.getEmployeeId());
        variables.put("overtimeType", application.getOvertimeType());
        variables.put("compensationType", application.getCompensationType());
        variables.put("startTime", application.getStartTime() != null ? application.getStartTime().toString() : null);
        variables.put("endTime", application.getEndTime() != null ? application.getEndTime().toString() : null);
        variables.put("duration", application.getDuration());
        variables.put("compensationHours", application.getCompensationHours());
        variables.put("reason", application.getReason());
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + result.getMsg());
            }

            application.setStatus("APPROVING");
            application.setProcessInstanceId(result.getData());
            overtimeApplicationMapper.updateById(application);
        } catch (Exception e) {
            log.error("启动加班审批流程失败", e);
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + e.getMessage(), e);
        }

        log.info("加班申请提交成功，申请编号: {}", application.getApplicationNo());
    }

    /**
     * 审批通过后处理（转换为调休或加班费）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveOvertimeApplication(Long id) {
        log.info("审批通过加班申请，ID: {}", id);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 查询加班申请
        OvertimeApplication application = overtimeApplicationMapper.selectById(id);
        tenantId = application != null ? application.getTenantId() : tenantId;
        if (application == null || !application.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("加班申请不存在");
        }

        // 验证状态
        if (!"APPROVING".equals(application.getStatus())) {
            throw new HrBusinessException("只有审批中的申请才能通过");
        }

        // 如果补偿类型是调休，则增加调休额度
        if ("TIME_OFF".equals(application.getCompensationType())) {
            addTimeOffQuota(application);
        }

        // 更新状态为已通过
        application.setStatus("APPROVED");
        overtimeApplicationMapper.updateById(application);

        log.info("加班申请审批通过，申请编号: {}, 补偿类型: {}, 补偿时长: {}小时", 
                application.getApplicationNo(), application.getCompensationType(), application.getCompensationHours());
    }

    /**
     * 审批拒绝
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectOvertimeApplication(Long id) {
        log.info("审批拒绝加班申请，ID: {}", id);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 查询加班申请
        OvertimeApplication application = overtimeApplicationMapper.selectById(id);
        tenantId = application != null ? application.getTenantId() : tenantId;
        if (application == null || !application.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("加班申请不存在");
        }

        // 验证状态
        if (!"APPROVING".equals(application.getStatus())) {
            throw new HrBusinessException("只有审批中的申请才能拒绝");
        }

        // 更新状态为已拒绝
        application.setStatus("REJECTED");
        overtimeApplicationMapper.updateById(application);

        log.info("加班申请审批拒绝，申请编号: {}", application.getApplicationNo());
    }

    /**
     * 撤销加班申请
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancelOvertimeApplication(Long id) {
        log.info("撤销加班申请，ID: {}", id);

        Long tenantId = SecurityUtils.getTenantId();
        OvertimeApplication application = overtimeApplicationMapper.selectById(id);
        if (application == null || !application.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("加班申请不存在");
        }

        if (!"APPROVING".equals(application.getStatus()) && !"APPROVED".equals(application.getStatus())) {
            throw new HrBusinessException("只有审批中或已通过的申请才能撤销");
        }

        if ("APPROVING".equals(application.getStatus()) && application.getProcessInstanceId() != null
                && !application.getProcessInstanceId().isBlank()) {
            R<Void> result = workflowServiceClient.cancelProcess(application.getProcessInstanceId());
            if (result == null || !result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_CANCEL_FAILED",
                        "撤销审批流程失败：" + (result != null ? result.getMsg() : "Workflow 服务无响应"));
            }
        }

        if ("APPROVED".equals(application.getStatus()) && "TIME_OFF".equals(application.getCompensationType())) {
            removeTimeOffQuota(application);
        }

        application.setStatus("CANCELLED");
        overtimeApplicationMapper.updateById(application);

        log.info("加班申请撤销成功，申请编号: {}", application.getApplicationNo());
    }

    /**
     * 查询加班申请列表
     */
    @Override
    public List<OvertimeApplicationVO> listOvertimeApplications(OvertimeApplicationQueryDTO query) {
        log.info("查询加班申请列表，查询条件: {}", query);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 构建查询条件
        LambdaQueryWrapper<OvertimeApplication> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(OvertimeApplication::getTenantId, tenantId)
                    .eq(query.getEmployeeId() != null, OvertimeApplication::getEmployeeId, query.getEmployeeId())
                    .eq(query.getOvertimeType() != null, OvertimeApplication::getOvertimeType, query.getOvertimeType())
                    .eq(query.getStatus() != null, OvertimeApplication::getStatus, query.getStatus())
                    .ge(query.getStartTimeFrom() != null, OvertimeApplication::getStartTime, query.getStartTimeFrom())
                    .le(query.getStartTimeTo() != null, OvertimeApplication::getStartTime, query.getStartTimeTo())
                    .orderByDesc(OvertimeApplication::getCreateTime);

        // 查询数据
        List<OvertimeApplication> applications = overtimeApplicationMapper.selectList(queryWrapper);

        // 转换为VO
        return applications.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    /**
     * 获取加班申请详情
     */
    @Override
    public OvertimeApplicationVO getOvertimeApplication(Long id) {
        log.info("获取加班申请详情，ID: {}", id);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 查询加班申请
        OvertimeApplication application = overtimeApplicationMapper.selectById(id);
        if (application == null || !application.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("加班申请不存在");
        }

        return convertToVO(application);
    }

    /**
     * 获取员工加班统计
     */
    @Override
    public OvertimeStatisticsVO getOvertimeStatistics(Long employeeId, YearMonth yearMonth) {
        log.info("获取员工加班统计，员工ID: {}, 年月: {}", employeeId, yearMonth);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 验证员工是否存在
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在");
        }

        // 查询统计数据
        Map<String, Object> statisticsMap = overtimeApplicationMapper.getOvertimeStatistics(
                tenantId, employeeId, yearMonth.getYear(), yearMonth.getMonthValue());

        // 构建统计VO
        OvertimeStatisticsVO statistics = new OvertimeStatisticsVO();
        statistics.setEmployeeId(employeeId);
        statistics.setEmployeeName(employee.getName());
        statistics.setEmployeeNo(employee.getEmployeeNo());
        statistics.setYear(yearMonth.getYear());
        statistics.setMonth(yearMonth.getMonthValue());
        statistics.setWorkdayHours(getBigDecimalFromMap(statisticsMap, "workdayHours"));
        statistics.setWeekendHours(getBigDecimalFromMap(statisticsMap, "weekendHours"));
        statistics.setHolidayHours(getBigDecimalFromMap(statisticsMap, "holidayHours"));
        statistics.setTotalHours(getBigDecimalFromMap(statisticsMap, "totalHours"));
        statistics.setTimeOffHours(getBigDecimalFromMap(statisticsMap, "timeOffHours"));
        statistics.setPaymentHours(getBigDecimalFromMap(statisticsMap, "paymentHours"));
        statistics.setOvertimeCount(getIntegerFromMap(statisticsMap, "overtimeCount"));

        return statistics;
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 计算补偿时长
     * 
     * @param duration 加班时长
     * @param overtimeType 加班类型
     * @param compensationType 补偿类型
     * @return 补偿时长
     */
    private BigDecimal calculateDuration(LocalDateTime startTime, LocalDateTime endTime) {
        long minutes = ChronoUnit.MINUTES.between(startTime, endTime);
        return new BigDecimal(minutes).divide(new BigDecimal("60"), 2, RoundingMode.HALF_UP);
    }

    private BigDecimal calculateCompensationHours(BigDecimal duration, String overtimeType, String compensationType) {
        // 如果是加班费，补偿时长等于加班时长
        if ("PAYMENT".equals(compensationType)) {
            return duration;
        }

        // 如果是调休，根据加班类型应用不同的转换比例
        BigDecimal ratio;
        switch (overtimeType) {
            case "WORKDAY":
                ratio = WORKDAY_RATIO;
                break;
            case "WEEKEND":
                ratio = WEEKEND_RATIO;
                break;
            case "HOLIDAY":
                ratio = HOLIDAY_RATIO;
                break;
            default:
                throw new HrBusinessException("无效的加班类型：" + overtimeType);
        }

        return duration.multiply(ratio).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * 增加调休额度
     * 
     * @param application 加班申请
     */
    private void addTimeOffQuota(OvertimeApplication application) {
        log.info("增加调休额度，员工ID: {}, 补偿时长: {}小时",
                application.getEmployeeId(), application.getCompensationHours());

        LeaveType leaveType = getRequiredCompensatoryLeaveType(application.getTenantId());

        // 跨年加班需要按年度拆分调休额度，避免整笔额度都落到开始年份。
        Map<Integer, BigDecimal> quotaByYear = splitTimeOffQuotaByYear(application);
        for (Map.Entry<Integer, BigDecimal> entry : quotaByYear.entrySet()) {
            Integer year = entry.getKey();
            BigDecimal quotaAmount = entry.getValue();
            LocalDate expiryDate = resolveTimeOffQuotaExpiryDate(leaveType, application, year);

            LambdaQueryWrapper<LeaveQuota> quotaQuery = new LambdaQueryWrapper<>();
            quotaQuery.eq(LeaveQuota::getTenantId, application.getTenantId())
                    .eq(LeaveQuota::getEmployeeId, application.getEmployeeId())
                    .eq(LeaveQuota::getLeaveTypeId, leaveType.getId())
                    .eq(LeaveQuota::getYear, year);
            if (expiryDate == null) {
                quotaQuery.isNull(LeaveQuota::getExpiryDate);
            } else {
                quotaQuery.eq(LeaveQuota::getExpiryDate, expiryDate);
            }
            LeaveQuota quota = leaveQuotaMapper.selectOne(quotaQuery);

            if (quota == null) {
                quota = new LeaveQuota();
                quota.setTenantId(application.getTenantId());
                quota.setEmployeeId(application.getEmployeeId());
                quota.setLeaveTypeId(leaveType.getId());
                quota.setYear(year);
                quota.setTotalQuota(quotaAmount);
                quota.setUsedQuota(BigDecimal.ZERO);
                quota.setFrozenQuota(BigDecimal.ZERO);
                quota.setAvailableQuota(quotaAmount);
                quota.setExpiryDate(expiryDate);
                leaveQuotaMapper.insert(quota);
            } else {
                quota.setTotalQuota(normalizeQuotaAmount(quota.getTotalQuota()).add(quotaAmount));
                quota.setAvailableQuota(normalizeQuotaAmount(quota.getAvailableQuota()).add(quotaAmount));
                leaveQuotaMapper.updateById(quota);
            }
        }

        log.info("调休额度增加成功，员工ID: {}, 增加时长: {}小时",
                application.getEmployeeId(), application.getCompensationHours());
    }

    /**
     * 撤销已通过的调休额度；如果额度已被请假冻结或使用，则不允许撤销。
     */
    private void removeTimeOffQuota(OvertimeApplication application) {
        log.info("回滚调休额度，员工ID: {}, 补偿时长: {}小时",
                application.getEmployeeId(), application.getCompensationHours());

        LeaveType leaveType = getRequiredCompensatoryLeaveType(application.getTenantId());
        Map<Integer, BigDecimal> quotaByYear = splitTimeOffQuotaByYear(application);
        for (Map.Entry<Integer, BigDecimal> entry : quotaByYear.entrySet()) {
            Integer year = entry.getKey();
            BigDecimal quotaAmount = entry.getValue();
            LocalDate expiryDate = resolveTimeOffQuotaExpiryDate(leaveType, application, year);

            LambdaQueryWrapper<LeaveQuota> quotaQuery = new LambdaQueryWrapper<>();
            quotaQuery.eq(LeaveQuota::getTenantId, application.getTenantId())
                    .eq(LeaveQuota::getEmployeeId, application.getEmployeeId())
                    .eq(LeaveQuota::getLeaveTypeId, leaveType.getId())
                    .eq(LeaveQuota::getYear, year);
            if (expiryDate == null) {
                quotaQuery.isNull(LeaveQuota::getExpiryDate);
            } else {
                quotaQuery.eq(LeaveQuota::getExpiryDate, expiryDate);
            }
            LeaveQuota quota = leaveQuotaMapper.selectOne(quotaQuery);

            if (quota == null) {
                throw new HrBusinessException("调休额度不存在，无法撤销已通过的加班申请");
            }

            BigDecimal totalQuota = normalizeQuotaAmount(quota.getTotalQuota());
            BigDecimal availableQuota = normalizeQuotaAmount(quota.getAvailableQuota());
            if (availableQuota.compareTo(quotaAmount) < 0) {
                throw new HrBusinessException(year + " 年调休额度已被占用，无法撤销该加班申请");
            }
            if (totalQuota.compareTo(quotaAmount) < 0) {
                throw new HrBusinessException(year + " 年调休额度状态异常，无法回滚该加班申请");
            }

            quota.setTotalQuota(normalizeQuotaAmount(totalQuota.subtract(quotaAmount)));
            quota.setAvailableQuota(normalizeQuotaAmount(availableQuota.subtract(quotaAmount)));
            leaveQuotaMapper.updateById(quota);
        }

        log.info("调休额度回滚成功，员工ID: {}, 回滚时长: {}小时",
                application.getEmployeeId(), application.getCompensationHours());
    }

    private LeaveType getRequiredCompensatoryLeaveType(Long tenantId) {
        LambdaQueryWrapper<LeaveType> leaveTypeQuery = new LambdaQueryWrapper<>();
        leaveTypeQuery.eq(LeaveType::getTenantId, tenantId)
                .eq(LeaveType::getLeaveCode, "COMPENSATORY");
        LeaveType leaveType = leaveTypeMapper.selectOne(leaveTypeQuery);
        if (leaveType == null) {
            throw new HrBusinessException("调休假期类型未配置");
        }
        return leaveType;
    }

    private Map<String, Object> parseExpiryRule(LeaveType leaveType) {
        if (leaveType.getExpiryRule() == null || leaveType.getExpiryRule().isBlank()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(leaveType.getExpiryRule(), new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            throw new HrBusinessException("INVALID_LEAVE_EXPIRY_RULE",
                    "假期类型[" + leaveType.getLeaveName() + "]过期规则不是合法 JSON", e);
        }
    }

    private LocalDate resolveTimeOffQuotaExpiryDate(LeaveType leaveType, OvertimeApplication application, int quotaYear) {
        Map<String, Object> expiryRule = parseExpiryRule(leaveType);
        String expiryType = expiryRule.get("expiryType") != null ? expiryRule.get("expiryType").toString() : "";
        if (expiryType.isBlank() || "YEAR_END".equalsIgnoreCase(expiryType)) {
            return LocalDate.of(quotaYear, 12, 31);
        }
        if ("FIXED_DAYS".equalsIgnoreCase(expiryType)) {
            Object daysValue = expiryRule.get("days");
            if (daysValue == null) {
                throw new HrBusinessException("假期类型[" + leaveType.getLeaveName() + "]过期规则缺少 days 配置");
            }
            int days;
            try {
                days = Integer.parseInt(daysValue.toString());
            } catch (NumberFormatException e) {
                throw new HrBusinessException("INVALID_LEAVE_EXPIRY_RULE",
                        "假期类型[" + leaveType.getLeaveName() + "]过期规则 days 必须为整数", e);
            }
            if (days < 0) {
                throw new HrBusinessException("假期类型[" + leaveType.getLeaveName() + "]过期规则 days 不能为负数");
            }
            return resolveTimeOffQuotaBaseDate(application).plusDays(days);
        }
        throw new HrBusinessException("假期类型[" + leaveType.getLeaveName() + "]暂不支持过期规则：" + expiryType);
    }

    private LocalDate resolveTimeOffQuotaBaseDate(OvertimeApplication application) {
        if (application.getEndTime() != null) {
            return application.getEndTime().toLocalDate();
        }
        if (application.getStartTime() != null) {
            return application.getStartTime().toLocalDate();
        }
        return LocalDate.now();
    }


    /**
     * 生成申请编号
     * 
     * @return 申请编号
     */
    /**
     * 先按加班发生时间确定默认年度；时间脏数据时再回退到可用的年份。
     */
    private int resolveTimeOffQuotaYear(OvertimeApplication application) {
        if (application.getStartTime() != null) {
            return application.getStartTime().getYear();
        }
        if (application.getEndTime() != null) {
            return application.getEndTime().getYear();
        }
        return LocalDateTime.now().getYear();
    }

    /**
     * 跨年加班按分钟占比拆分调休额度，保证各年度分摊后总额不变。
     */
    private Map<Integer, BigDecimal> splitTimeOffQuotaByYear(OvertimeApplication application) {
        BigDecimal totalQuota = normalizeQuotaAmount(application.getCompensationHours());
        if (totalQuota.compareTo(BigDecimal.ZERO) <= 0) {
            return Map.of();
        }

        LocalDateTime startTime = application.getStartTime();
        LocalDateTime endTime = application.getEndTime();
        if (startTime == null || endTime == null || !endTime.isAfter(startTime)) {
            return Map.of(resolveTimeOffQuotaYear(application), totalQuota);
        }

        LinkedHashMap<Integer, BigDecimal> weightByYear = new LinkedHashMap<>();
        BigDecimal totalWeight = BigDecimal.ZERO;
        for (int year = startTime.getYear(); year <= endTime.getYear(); year++) {
            BigDecimal weight = calculateYearOverlapMinutes(startTime, endTime, year);
            if (weight.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            weightByYear.put(year, weight);
            totalWeight = totalWeight.add(weight);
        }

        if (weightByYear.isEmpty()) {
            return Map.of(resolveTimeOffQuotaYear(application), totalQuota);
        }
        if (weightByYear.size() == 1) {
            return Map.of(weightByYear.keySet().iterator().next(), totalQuota);
        }

        LinkedHashMap<Integer, BigDecimal> splitQuota = new LinkedHashMap<>();
        BigDecimal allocated = BigDecimal.ZERO;
        int index = 0;
        int size = weightByYear.size();
        for (Map.Entry<Integer, BigDecimal> entry : weightByYear.entrySet()) {
            BigDecimal quotaAmount;
            if (index == size - 1) {
                quotaAmount = totalQuota.subtract(allocated);
            } else {
                quotaAmount = totalQuota.multiply(entry.getValue())
                        .divide(totalWeight, 2, RoundingMode.HALF_UP);
            }
            quotaAmount = normalizeQuotaAmount(quotaAmount);
            if (quotaAmount.compareTo(BigDecimal.ZERO) > 0) {
                splitQuota.put(entry.getKey(), quotaAmount);
                allocated = allocated.add(quotaAmount);
            }
            index++;
        }
        return splitQuota;
    }

    private BigDecimal calculateYearOverlapMinutes(LocalDateTime startTime, LocalDateTime endTime, int year) {
        LocalDateTime yearStart = LocalDate.of(year, 1, 1).atStartOfDay();
        LocalDateTime yearEndExclusive = LocalDate.of(year + 1, 1, 1).atStartOfDay();
        LocalDateTime overlapStart = startTime.isAfter(yearStart) ? startTime : yearStart;
        LocalDateTime overlapEnd = endTime.isBefore(yearEndExclusive) ? endTime : yearEndExclusive;
        if (!overlapEnd.isAfter(overlapStart)) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(ChronoUnit.MINUTES.between(overlapStart, overlapEnd));
    }

    private BigDecimal normalizeQuotaAmount(BigDecimal quotaAmount) {
        if (quotaAmount == null) {
            return BigDecimal.ZERO;
        }
        return quotaAmount.setScale(2, RoundingMode.HALF_UP);
    }

    private String generateApplicationNo() {
        return "OT" + System.currentTimeMillis();
    }

    /**
     * 加班申请只允许已入职员工发起。
     */
    private void validateOvertimeEligibleEmployee(Employee employee) {
        if ("PROBATION".equals(employee.getEmployeeStatus()) || "REGULAR".equals(employee.getEmployeeStatus())) {
            return;
        }
        throw HrBusinessException.invalidEmployeeStatus(employee.getId(), employee.getEmployeeStatus(), "加班申请");
    }

    /**
     * 转换为VO
     * 
     * @param application 加班申请实体
     * @return VO对象
     */
    private OvertimeApplicationVO convertToVO(OvertimeApplication application) {
        OvertimeApplicationVO vo = new OvertimeApplicationVO();
        BeanUtils.copyProperties(application, vo);

        // 查询员工信息
        Employee employee = employeeMapper.selectById(application.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
            vo.setEmployeeNo(employee.getEmployeeNo());
        }

        // 设置加班类型名称
        vo.setOvertimeTypeName(getOvertimeTypeName(application.getOvertimeType()));

        // 设置补偿类型名称
        vo.setCompensationTypeName(getCompensationTypeName(application.getCompensationType()));

        // 设置状态名称
        vo.setStatusName(getStatusName(application.getStatus()));

        return vo;
    }

    /**
     * 获取加班类型名称
     */
    private String getOvertimeTypeName(String overtimeType) {
        switch (overtimeType) {
            case "WORKDAY":
                return "工作日";
            case "WEEKEND":
                return "周末";
            case "HOLIDAY":
                return "节假日";
            default:
                return overtimeType;
        }
    }

    /**
     * 获取补偿类型名称
     */
    private String getCompensationTypeName(String compensationType) {
        switch (compensationType) {
            case "TIME_OFF":
                return "调休";
            case "PAYMENT":
                return "加班费";
            default:
                return compensationType;
        }
    }

    /**
     * 获取状态名称
     */
    private String getStatusName(String status) {
        switch (status) {
            case "DRAFT":
                return "草稿";
            case "APPROVING":
                return "审批中";
            case "APPROVED":
                return "已通过";
            case "REJECTED":
                return "已拒绝";
            case "CANCELLED":
                return "已撤销";
            default:
                return status;
        }
    }

    /**
     * 从Map中获取BigDecimal值
     */
    private BigDecimal getBigDecimalFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return BigDecimal.ZERO;
        }
        if (value instanceof BigDecimal) {
            return (BigDecimal) value;
        }
        return new BigDecimal(value.toString());
    }

    /**
     * 从Map中获取Integer值
     */
    private Integer getIntegerFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return 0;
        }
        if (value instanceof Integer) {
            return (Integer) value;
        }
        if (value instanceof Long) {
            return ((Long) value).intValue();
        }
        return Integer.parseInt(value.toString());
    }
}
