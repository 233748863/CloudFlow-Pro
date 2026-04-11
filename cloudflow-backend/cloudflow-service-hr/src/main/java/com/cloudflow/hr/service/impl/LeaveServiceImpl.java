package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.LeaveApplication;
import com.cloudflow.hr.domain.entity.LeaveQuota;
import com.cloudflow.hr.domain.entity.LeaveType;
import com.cloudflow.hr.domain.vo.LeaveApplicationVO;
import com.cloudflow.hr.domain.vo.LeaveQuotaInitItemVO;
import com.cloudflow.hr.domain.vo.LeaveQuotaInitResultVO;
import com.cloudflow.hr.domain.vo.LeaveQuotaVO;
import com.cloudflow.hr.domain.vo.LeaveTypeVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.exception.InsufficientQuotaException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.LeaveApplicationMapper;
import com.cloudflow.hr.mapper.LeaveQuotaMapper;
import com.cloudflow.hr.mapper.LeaveTypeMapper;
import com.cloudflow.hr.service.LeaveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 假期管理服务实现类
 * 提供假期类型、假期额度和请假申请管理功能
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveServiceImpl implements LeaveService {
    
    private final LeaveTypeMapper leaveTypeMapper;
    private final LeaveQuotaMapper leaveQuotaMapper;
    private final LeaveApplicationMapper leaveApplicationMapper;
    private final EmployeeMapper employeeMapper;
    private final WorkflowServiceClient workflowServiceClient;
    private final ObjectMapper objectMapper;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    private static final String LEAVE_CODE_ANNUAL = "ANNUAL";
    private static final String LEAVE_CODE_COMPENSATORY = "COMPENSATORY";

    
    // ==================== 假期类型管理 ====================
    
    /**
     * 创建假期类型
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createLeaveType(LeaveTypeCreateDTO dto) {
        log.info("创建假期类型，leaveCode: {}, leaveName: {}", dto.getLeaveCode(), dto.getLeaveName());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查假期编码是否已存在
        LambdaQueryWrapper<LeaveType> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveType::getTenantId, tenantId)
                    .eq(LeaveType::getLeaveCode, dto.getLeaveCode());
        
        if (leaveTypeMapper.selectCount(queryWrapper) > 0) {
            throw new HrBusinessException("假期编码已存在：" + dto.getLeaveCode());
        }

        validateLeaveTypeQuotaRule(dto.getLeaveCode(), dto.getNeedQuota(), dto.getQuotaRule());
        
        // 创建假期类型实体
        LeaveType leaveType = new LeaveType();
        BeanUtils.copyProperties(dto, leaveType);
        leaveType.setTenantId(tenantId);
        leaveType.setStatus(1); // 默认启用
        
        // 保存到数据库
        leaveTypeMapper.insert(leaveType);
        
        log.info("假期类型创建成功，ID: {}", leaveType.getId());
        return leaveType.getId();
    }
    
    /**
     * 更新假期类型
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateLeaveType(Long id, LeaveTypeUpdateDTO dto) {
        log.info("更新假期类型，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询假期类型
        LeaveType leaveType = leaveTypeMapper.selectById(id);
        if (leaveType == null || !leaveType.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("假期类型不存在");
        }

        validateLeaveTypeQuotaRule(leaveType.getLeaveCode(), dto.getNeedQuota(), dto.getQuotaRule());
        
        // 更新假期类型信息
        BeanUtils.copyProperties(dto, leaveType);
        leaveTypeMapper.updateById(leaveType);
        
        log.info("假期类型更新成功，ID: {}", id);
    }

    
    /**
     * 获取假期类型详情
     */
    @Override
    public LeaveTypeVO getLeaveType(Long id) {
        log.info("获取假期类型详情，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询假期类型
        LeaveType leaveType = leaveTypeMapper.selectById(id);
        if (leaveType == null || !leaveType.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("假期类型不存在");
        }
        
        // 转换为VO
        LeaveTypeVO vo = new LeaveTypeVO();
        BeanUtils.copyProperties(leaveType, vo);
        
        return vo;
    }
    
    /**
     * 获取假期类型列表
     */
    @Override
    public List<LeaveTypeVO> listLeaveTypes() {
        log.info("获取假期类型列表");
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询假期类型列表
        LambdaQueryWrapper<LeaveType> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveType::getTenantId, tenantId)
                    .eq(LeaveType::getStatus, 1) // 只查询启用的假期类型
                    .orderByAsc(LeaveType::getLeaveCode);
        
        List<LeaveType> leaveTypes = leaveTypeMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return leaveTypes.stream()
                .map(leaveType -> {
                    LeaveTypeVO vo = new LeaveTypeVO();
                    BeanUtils.copyProperties(leaveType, vo);
                    return vo;
                })
                .collect(Collectors.toList());
    }

    
    // ==================== 假期额度管理 ====================
    
    /**
     * 初始化员工年度假期额度
     * 根据员工入职日期和假期类型规则计算初始额度
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public LeaveQuotaInitResultVO initLeaveQuota(Long employeeId, Integer year, Long leaveTypeId) {
        log.info("初始化员工假期额度，employeeId: {}, year: {}, leaveTypeId: {}", employeeId, year, leaveTypeId);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询员工信息
        Employee employee = getTenantEmployeeOrThrow(employeeId, tenantId);
        validateLeaveEligibleEmployee(employee, "初始化假期额度");
        
        List<LeaveType> leaveTypes = resolveQuotaInitLeaveTypes(tenantId, leaveTypeId);
        LeaveQuotaInitResultVO result = buildLeaveQuotaInitResult(employee, year, leaveTypeId, leaveTypes);
        
        // 为每种假期类型初始化额度
        for (LeaveType leaveType : leaveTypes) {
            BigDecimal totalQuota = calculateInitialQuota(employee, leaveType, year);
            LocalDate expiryDate = LocalDate.of(year, 12, 31);

            // 检查是否已存在额度记录
            LambdaQueryWrapper<LeaveQuota> quotaQueryWrapper = new LambdaQueryWrapper<>();
            quotaQueryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                            .eq(LeaveQuota::getEmployeeId, employeeId)
                            .eq(LeaveQuota::getLeaveTypeId, leaveType.getId())
                            .eq(LeaveQuota::getYear, year);

            LeaveQuota existingQuota = leaveQuotaMapper.selectOne(quotaQueryWrapper);
            if (existingQuota != null) {
                if (shouldRefreshQuota(existingQuota, totalQuota, expiryDate)) {
                    existingQuota.setTotalQuota(totalQuota);
                    existingQuota.setUsedQuota(BigDecimal.ZERO);
                    existingQuota.setFrozenQuota(BigDecimal.ZERO);
                    existingQuota.setAvailableQuota(totalQuota);
                    existingQuota.setExpiryDate(expiryDate);
                    leaveQuotaMapper.updateById(existingQuota);
                    log.info("员工假期额度已刷新，employeeId: {}, leaveTypeId: {}, totalQuota: {}",
                            employeeId, leaveType.getId(), totalQuota);
                    appendLeaveQuotaInitItem(result, leaveType, "REFRESHED", "已按最新规则刷新年度额度", totalQuota, expiryDate);
                } else {
                    String message = (!isZero(existingQuota.getUsedQuota()) || !isZero(existingQuota.getFrozenQuota()))
                            ? "已有使用或冻结记录，保留当前额度"
                            : "当前额度记录已是最新，无需重复补齐";
                    log.info("员工假期额度已存在且已使用，跳过初始化，employeeId: {}, leaveTypeId: {}, year: {}",
                            employeeId, leaveType.getId(), year);
                    appendLeaveQuotaInitItem(
                            result,
                            leaveType,
                            "SKIPPED",
                            message,
                            normalizeQuota(existingQuota.getTotalQuota()),
                            existingQuota.getExpiryDate()
                    );
                }
                continue;
            }

            // 创建额度记录
            LeaveQuota leaveQuota = new LeaveQuota();
            leaveQuota.setTenantId(tenantId);
            leaveQuota.setEmployeeId(employeeId);
            leaveQuota.setLeaveTypeId(leaveType.getId());
            leaveQuota.setYear(year);
            leaveQuota.setTotalQuota(totalQuota);
            leaveQuota.setUsedQuota(BigDecimal.ZERO);
            leaveQuota.setFrozenQuota(BigDecimal.ZERO);
            leaveQuota.setAvailableQuota(totalQuota);
            
            // 设置过期日期（默认为年底）
            leaveQuota.setExpiryDate(expiryDate);
            
            leaveQuotaMapper.insert(leaveQuota);
            
            log.info("员工假期额度初始化成功，employeeId: {}, leaveTypeId: {}, totalQuota: {}", 
                    employeeId, leaveType.getId(), totalQuota);
            appendLeaveQuotaInitItem(result, leaveType, "CREATED", "已创建年度额度记录", totalQuota, expiryDate);
        }
        return result;
    }

    private LeaveQuotaInitResultVO buildLeaveQuotaInitResult(Employee employee,
                                                             Integer year,
                                                             Long leaveTypeId,
                                                             List<LeaveType> leaveTypes) {
        LeaveQuotaInitResultVO result = new LeaveQuotaInitResultVO();
        result.setEmployeeId(employee.getId());
        result.setEmployeeName(employee.getName());
        result.setYear(year);
        result.setMode(leaveTypeId == null ? "BATCH" : "SINGLE");
        result.setRequestedCount(leaveTypes.size());
        result.setCreatedCount(0);
        result.setRefreshedCount(0);
        result.setSkippedCount(0);
        return result;
    }

    private void appendLeaveQuotaInitItem(LeaveQuotaInitResultVO result,
                                          LeaveType leaveType,
                                          String action,
                                          String message,
                                          BigDecimal totalQuota,
                                          LocalDate expiryDate) {
        LeaveQuotaInitItemVO item = new LeaveQuotaInitItemVO();
        item.setLeaveTypeId(leaveType.getId());
        item.setLeaveTypeName(leaveType.getLeaveName());
        item.setAction(action);
        item.setMessage(message);
        item.setTotalQuota(normalizeQuota(totalQuota));
        item.setExpiryDate(expiryDate);
        result.getItems().add(item);

        switch (action) {
            case "CREATED" -> result.setCreatedCount(result.getCreatedCount() + 1);
            case "REFRESHED" -> result.setRefreshedCount(result.getRefreshedCount() + 1);
            case "SKIPPED" -> result.setSkippedCount(result.getSkippedCount() + 1);
            default -> log.warn("未知的假期额度补齐结果动作，action: {}", action);
        }
    }

    
    /**
     * 计算员工初始假期额度
     * 根据入职日期和假期类型规则计算
     */
    private BigDecimal calculateInitialQuota(Employee employee, LeaveType leaveType, Integer year) {
        Map<String, Object> quotaRule = parseQuotaRule(leaveType);
        if (quotaRule.isEmpty()) {
            if (LEAVE_CODE_COMPENSATORY.equals(leaveType.getLeaveCode())) {
                log.info("调休额度初始化为0，后续通过加班审批累计，leaveTypeId: {}", leaveType.getId());
            }
            return BigDecimal.ZERO;
        }

        if (LEAVE_CODE_ANNUAL.equals(leaveType.getLeaveCode())) {
            return calculateAnnualQuota(employee, leaveType, year, quotaRule);
        }

        BigDecimal fixedQuota = readDecimalValue(quotaRule, "quota");
        if (fixedQuota != null) {
            return normalizeQuota(fixedQuota);
        }

        BigDecimal baseQuota = readDecimalValue(quotaRule, "baseQuota");
        if (baseQuota != null) {
            return normalizeQuota(baseQuota);
        }

        throw new HrBusinessException("假期类型[" + leaveType.getLeaveName() + "]额度规则缺少 quota 或 baseQuota 配置");
    }

    /**
     * 校验需要额度的假期类型规则，避免配置错误后静默初始化为0。
     */
    private void validateLeaveTypeQuotaRule(String leaveCode, Boolean needQuota, String quotaRule) {
        if (!Boolean.TRUE.equals(needQuota)) {
            return;
        }
        if (LEAVE_CODE_COMPENSATORY.equals(leaveCode) && (quotaRule == null || quotaRule.isBlank())) {
            return;
        }
        if (quotaRule == null || quotaRule.isBlank()) {
            throw new HrBusinessException("需要额度的假期类型必须配置额度规则，调休除外");
        }

        Map<String, Object> rule = parseQuotaRule(leaveCode, quotaRule);
        boolean hasQuota = readDecimalValue(rule, "quota") != null;
        boolean hasBaseQuota = readDecimalValue(rule, "baseQuota") != null;
        if (!hasQuota && !hasBaseQuota) {
            throw new HrBusinessException("假期类型[" + leaveCode + "]额度规则缺少 quota 或 baseQuota 配置");
        }

        if (LEAVE_CODE_ANNUAL.equals(leaveCode)) {
            BigDecimal incrementPerYear = readDecimalValue(rule, "incrementPerYear");
            BigDecimal maxQuota = readDecimalValue(rule, "maxQuota");
            if (incrementPerYear != null && incrementPerYear.compareTo(BigDecimal.ZERO) < 0) {
                throw new HrBusinessException("假期类型[" + leaveCode + "]额度规则 incrementPerYear 不能为负数");
            }
            if (maxQuota != null && maxQuota.compareTo(BigDecimal.ZERO) < 0) {
                throw new HrBusinessException("假期类型[" + leaveCode + "]额度规则 maxQuota 不能为负数");
            }
        }
    }

    /**
     * 解析假期额度规则 JSON。
     */
    private Map<String, Object> parseQuotaRule(LeaveType leaveType) {
        return parseQuotaRule(leaveType.getLeaveName(), leaveType.getQuotaRule());
    }

    private Map<String, Object> parseQuotaRule(String leaveTypeName, String quotaRule) {
        if (quotaRule == null || quotaRule.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(quotaRule, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            throw new HrBusinessException("INVALID_LEAVE_QUOTA_RULE",
                    "假期类型[" + leaveTypeName + "]额度规则不是合法 JSON", e);
        }
    }

    /**
     * 读取规则中的数值字段。
     */
    private BigDecimal readDecimalValue(Map<String, Object> quotaRule, String key) {
        if (quotaRule == null || !quotaRule.containsKey(key) || quotaRule.get(key) == null) {
            return null;
        }
        try {
            return new BigDecimal(quotaRule.get(key).toString());
        } catch (NumberFormatException e) {
            throw new HrBusinessException("INVALID_LEAVE_QUOTA_RULE",
                    "额度规则字段[" + key + "]必须为数字", e);
        }
    }

    /**
     * 计算年假额度。
     */
    private BigDecimal calculateAnnualQuota(Employee employee, LeaveType leaveType, Integer year, Map<String, Object> quotaRule) {
        LocalDate hireDate = employee.getHireDate();
        if (hireDate == null) {
            throw new HrBusinessException("员工[" + employee.getId() + "]缺少入职日期，无法初始化年假额度");
        }

        LocalDate yearStart = LocalDate.of(year, 1, 1);
        LocalDate yearEnd = LocalDate.of(year, 12, 31);
        if (hireDate.isAfter(yearEnd)) {
            return BigDecimal.ZERO;
        }

        BigDecimal baseQuota = readDecimalValue(quotaRule, "quota");
        if (baseQuota == null) {
            baseQuota = readDecimalValue(quotaRule, "baseQuota");
        }
        if (baseQuota == null) {
            throw new HrBusinessException("假期类型[" + leaveType.getLeaveName() + "]额度规则缺少基础额度配置");
        }

        BigDecimal incrementPerYear = readDecimalValue(quotaRule, "incrementPerYear");
        if (incrementPerYear == null) {
            incrementPerYear = BigDecimal.ZERO;
        }
        BigDecimal maxQuota = readDecimalValue(quotaRule, "maxQuota");

        long workYears = Math.max(0, ChronoUnit.YEARS.between(hireDate, yearStart));
        BigDecimal totalQuota = baseQuota.add(incrementPerYear.multiply(BigDecimal.valueOf(workYears)));

        if (hireDate.getYear() == year) {
            int monthsWorked = 12 - hireDate.getMonthValue() + 1;
            totalQuota = totalQuota.multiply(BigDecimal.valueOf(monthsWorked))
                    .divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP);
        }

        if (maxQuota != null) {
            totalQuota = totalQuota.min(maxQuota);
        }
        return normalizeQuota(totalQuota);
    }

    /**
     * 统一标准化额度精度。
     */
    private BigDecimal normalizeQuota(BigDecimal quota) {
        if (quota == null) {
            return BigDecimal.ZERO;
        }
        if (quota.compareTo(BigDecimal.ZERO) < 0) {
            throw new HrBusinessException("假期额度不能为负数");
        }
        return quota.setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * 跨年请假需要按年度拆分额度，避免整单都落到开始年份。
     */
    private Map<Integer, BigDecimal> splitQuotaUsageByYear(LocalDateTime startTime,
                                                           LocalDateTime endTime,
                                                           BigDecimal duration,
                                                           String unit) {
        if (startTime == null || endTime == null) {
            return Map.of();
        }
        if (endTime.isBefore(startTime)) {
            throw new HrBusinessException("结束时间不能早于开始时间");
        }

        BigDecimal normalizedDuration = normalizeQuota(duration);
        LinkedHashMap<Integer, BigDecimal> weightByYear = new LinkedHashMap<>();
        BigDecimal totalWeight = BigDecimal.ZERO;
        for (int year = startTime.getYear(); year <= endTime.getYear(); year++) {
            BigDecimal weight = calculateYearOverlapWeight(startTime, endTime, unit, year);
            if (weight.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            weightByYear.put(year, weight);
            totalWeight = totalWeight.add(weight);
        }

        if (weightByYear.isEmpty()) {
            return Map.of();
        }
        if (weightByYear.size() == 1) {
            return Map.of(weightByYear.keySet().iterator().next(), normalizedDuration);
        }

        LinkedHashMap<Integer, BigDecimal> splitUsage = new LinkedHashMap<>();
        BigDecimal allocated = BigDecimal.ZERO;
        int index = 0;
        int size = weightByYear.size();
        for (Map.Entry<Integer, BigDecimal> entry : weightByYear.entrySet()) {
            BigDecimal amount;
            if (index == size - 1) {
                amount = normalizedDuration.subtract(allocated);
            } else {
                amount = normalizedDuration.multiply(entry.getValue())
                        .divide(totalWeight, 2, RoundingMode.HALF_UP);
            }
            if (amount.compareTo(BigDecimal.ZERO) < 0) {
                amount = BigDecimal.ZERO;
            }
            amount = normalizeQuota(amount);
            if (amount.compareTo(BigDecimal.ZERO) > 0) {
                splitUsage.put(entry.getKey(), amount);
            }
            allocated = allocated.add(amount);
            index++;
        }
        return splitUsage;
    }

    private BigDecimal calculateYearOverlapWeight(LocalDateTime startTime,
                                                  LocalDateTime endTime,
                                                  String unit,
                                                  int year) {
        if ("HOUR".equalsIgnoreCase(unit)) {
            LocalDateTime yearStart = LocalDate.of(year, 1, 1).atStartOfDay();
            LocalDateTime yearEndExclusive = LocalDate.of(year + 1, 1, 1).atStartOfDay();
            LocalDateTime overlapStart = startTime.isAfter(yearStart) ? startTime : yearStart;
            LocalDateTime overlapEnd = endTime.isBefore(yearEndExclusive) ? endTime : yearEndExclusive;
            if (!overlapEnd.isAfter(overlapStart)) {
                return BigDecimal.ZERO;
            }
            return BigDecimal.valueOf(ChronoUnit.MINUTES.between(overlapStart, overlapEnd));
        }

        LocalDate yearStart = LocalDate.of(year, 1, 1);
        LocalDate yearEnd = LocalDate.of(year, 12, 31);
        LocalDate overlapStart = startTime.toLocalDate().isAfter(yearStart) ? startTime.toLocalDate() : yearStart;
        LocalDate overlapEnd = endTime.toLocalDate().isBefore(yearEnd) ? endTime.toLocalDate() : yearEnd;
        if (overlapEnd.isBefore(overlapStart)) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(ChronoUnit.DAYS.between(overlapStart, overlapEnd) + 1);
    }

    private LeaveQuota getRequiredLeaveQuota(Long tenantId, Long employeeId, Long leaveTypeId, Integer year) {
        LambdaQueryWrapper<LeaveQuota> quotaQueryWrapper = new LambdaQueryWrapper<>();
        quotaQueryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                .eq(LeaveQuota::getEmployeeId, employeeId)
                .eq(LeaveQuota::getLeaveTypeId, leaveTypeId)
                .eq(LeaveQuota::getYear, year);

        LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(quotaQueryWrapper);
        if (leaveQuota == null) {
            throw new HrBusinessException("假期额度不存在，请先初始化 " + year + " 年假期额度");
        }
        return leaveQuota;
    }

    private LeaveQuota getRequiredLeaveQuotaById(Long tenantId, Long quotaId) {
        LeaveQuota leaveQuota = leaveQuotaMapper.selectById(quotaId);
        if (leaveQuota == null || !tenantId.equals(leaveQuota.getTenantId())) {
            throw new HrBusinessException("假期额度不存在");
        }
        return leaveQuota;
    }

    private boolean isCompensatoryLeave(LeaveType leaveType) {
        return leaveType != null && LEAVE_CODE_COMPENSATORY.equals(leaveType.getLeaveCode());
    }

    private LocalDate resolveCompensatoryReferenceDate(LocalDateTime startTime, LocalDateTime endTime) {
        // 调休额度至少要覆盖到请假结束日，避免跨过过期日后仍误用已过期额度。
        if (endTime != null) {
            return endTime.toLocalDate();
        }
        if (startTime != null) {
            return startTime.toLocalDate();
        }
        return LocalDate.now();
    }

    /**
     * 调休额度按照“最早到期优先”的规则分配，避免快过期额度长期滞留。
     */
    private LinkedHashMap<Long, BigDecimal> buildCompensatoryQuotaAllocation(Long tenantId,
                                                                             Long employeeId,
                                                                             Long leaveTypeId,
                                                                             BigDecimal requestedDuration,
                                                                             LocalDate referenceDate,
                                                                             Function<LeaveQuota, BigDecimal> balanceResolver,
                                                                             boolean excludeExpired,
                                                                             boolean insufficientAsQuotaError,
                                                                             String insufficientMessage) {
        LambdaQueryWrapper<LeaveQuota> quotaQueryWrapper = new LambdaQueryWrapper<>();
        quotaQueryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                .eq(LeaveQuota::getEmployeeId, employeeId)
                .eq(LeaveQuota::getLeaveTypeId, leaveTypeId)
                .orderByAsc(LeaveQuota::getExpiryDate, LeaveQuota::getYear, LeaveQuota::getId);
        if (excludeExpired) {
            LocalDate baseDate = referenceDate != null ? referenceDate : LocalDate.now();
            quotaQueryWrapper.and(query -> query.isNull(LeaveQuota::getExpiryDate)
                    .or()
                    .ge(LeaveQuota::getExpiryDate, baseDate));
        }

        List<LeaveQuota> quotaList = queryAndSortCompensatoryQuotaBuckets(quotaQueryWrapper, excludeExpired, referenceDate);
        BigDecimal remaining = normalizeQuota(requestedDuration);
        LinkedHashMap<Long, BigDecimal> allocation = new LinkedHashMap<>();
        for (LeaveQuota leaveQuota : quotaList) {
            BigDecimal balance = normalizeQuota(balanceResolver.apply(leaveQuota));
            if (balance.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal allocatedAmount = balance.min(remaining);
            if (allocatedAmount.compareTo(BigDecimal.ZERO) > 0) {
                allocation.put(leaveQuota.getId(), normalizeQuota(allocatedAmount));
                remaining = normalizeQuota(remaining.subtract(allocatedAmount));
            }
            if (remaining.compareTo(BigDecimal.ZERO) == 0) {
                break;
            }
        }

        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            if (insufficientAsQuotaError) {
                throw new InsufficientQuotaException(insufficientMessage);
            }
            throw new HrBusinessException(insufficientMessage);
        }
        return allocation;
    }

    private void validateCompensatoryQuotaAvailability(Long tenantId,
                                                       Long employeeId,
                                                       LeaveType leaveType,
                                                       BigDecimal requestedDuration,
                                                       LocalDate referenceDate) {
        buildCompensatoryQuotaAllocation(
                tenantId,
                employeeId,
                leaveType.getId(),
                requestedDuration,
                referenceDate,
                LeaveQuota::getAvailableQuota,
                true,
                true,
                String.format("%s额度不足或已过期，可用额度无法覆盖申请时长 %s %s",
                        leaveType.getLeaveName(),
                        normalizeQuota(requestedDuration),
                        leaveType.getUnit())
        );
    }

    private void freezeCompensatoryQuotaUsage(Long tenantId, Map<Long, BigDecimal> quotaAllocation) {
        for (Map.Entry<Long, BigDecimal> entry : quotaAllocation.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuotaById(tenantId, entry.getKey());
            BigDecimal availableQuota = normalizeQuota(leaveQuota.getAvailableQuota());
            if (availableQuota.compareTo(entry.getValue()) < 0) {
                throw new InsufficientQuotaException("调休额度不足");
            }
            leaveQuota.setFrozenQuota(normalizeQuota(normalizeQuota(leaveQuota.getFrozenQuota()).add(entry.getValue())));
            leaveQuota.setAvailableQuota(normalizeQuota(availableQuota.subtract(entry.getValue())));
            leaveQuotaMapper.updateById(leaveQuota);
        }
    }

    private void consumeCompensatoryFrozenQuota(Long tenantId, Map<Long, BigDecimal> quotaAllocation) {
        for (Map.Entry<Long, BigDecimal> entry : quotaAllocation.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuotaById(tenantId, entry.getKey());
            BigDecimal frozenQuota = normalizeQuota(leaveQuota.getFrozenQuota());
            if (frozenQuota.compareTo(entry.getValue()) < 0) {
                throw new HrBusinessException("调休额度状态异常，无法扣减冻结额度");
            }
            leaveQuota.setFrozenQuota(normalizeQuota(frozenQuota.subtract(entry.getValue())));
            leaveQuota.setUsedQuota(normalizeQuota(normalizeQuota(leaveQuota.getUsedQuota()).add(entry.getValue())));
            leaveQuotaMapper.updateById(leaveQuota);
        }
    }

    private void releaseCompensatoryFrozenQuota(Long tenantId, Map<Long, BigDecimal> quotaAllocation) {
        for (Map.Entry<Long, BigDecimal> entry : quotaAllocation.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuotaById(tenantId, entry.getKey());
            BigDecimal frozenQuota = normalizeQuota(leaveQuota.getFrozenQuota());
            if (frozenQuota.compareTo(entry.getValue()) < 0) {
                throw new HrBusinessException("调休额度状态异常，无法释放冻结额度");
            }
            leaveQuota.setFrozenQuota(normalizeQuota(frozenQuota.subtract(entry.getValue())));
            leaveQuota.setAvailableQuota(normalizeQuota(normalizeQuota(leaveQuota.getAvailableQuota()).add(entry.getValue())));
            leaveQuotaMapper.updateById(leaveQuota);
        }
    }

    private void restoreCompensatoryUsedQuota(Long tenantId, Map<Long, BigDecimal> quotaAllocation) {
        for (Map.Entry<Long, BigDecimal> entry : quotaAllocation.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuotaById(tenantId, entry.getKey());
            BigDecimal usedQuota = normalizeQuota(leaveQuota.getUsedQuota());
            if (usedQuota.compareTo(entry.getValue()) < 0) {
                throw new HrBusinessException("调休额度状态异常，无法恢复已使用额度");
            }
            leaveQuota.setUsedQuota(normalizeQuota(usedQuota.subtract(entry.getValue())));
            leaveQuota.setAvailableQuota(normalizeQuota(normalizeQuota(leaveQuota.getAvailableQuota()).add(entry.getValue())));
            leaveQuotaMapper.updateById(leaveQuota);
        }
    }

    private String serializeQuotaAllocation(Map<Long, BigDecimal> quotaAllocation) {
        if (quotaAllocation == null || quotaAllocation.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(quotaAllocation);
        } catch (Exception e) {
            throw new HrBusinessException("INVALID_LEAVE_QUOTA_ALLOCATION", "额度分配明细序列化失败", e);
        }
    }

    private LinkedHashMap<Long, BigDecimal> parseQuotaAllocation(String quotaAllocation) {
        if (quotaAllocation == null || quotaAllocation.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            LinkedHashMap<Long, BigDecimal> allocation = objectMapper.readValue(
                    quotaAllocation,
                    new TypeReference<LinkedHashMap<Long, BigDecimal>>() {
                    }
            );
            LinkedHashMap<Long, BigDecimal> normalizedAllocation = new LinkedHashMap<>();
            for (Map.Entry<Long, BigDecimal> entry : allocation.entrySet()) {
                BigDecimal amount = normalizeQuota(entry.getValue());
                if (amount.compareTo(BigDecimal.ZERO) > 0) {
                    normalizedAllocation.put(entry.getKey(), amount);
                }
            }
            return normalizedAllocation;
        } catch (Exception e) {
            throw new HrBusinessException("INVALID_LEAVE_QUOTA_ALLOCATION", "额度分配明细解析失败", e);
        }
    }

    private LinkedHashMap<Long, BigDecimal> resolveCompensatoryQuotaAllocationForApproving(LeaveApplication leaveApplication,
                                                                                            Long tenantId) {
        LinkedHashMap<Long, BigDecimal> storedAllocation = parseQuotaAllocation(leaveApplication.getQuotaAllocation());
        if (!storedAllocation.isEmpty()) {
            return storedAllocation;
        }
        return buildCompensatoryQuotaAllocation(
                tenantId,
                leaveApplication.getEmployeeId(),
                leaveApplication.getLeaveTypeId(),
                leaveApplication.getDuration(),
                null,
                LeaveQuota::getFrozenQuota,
                false,
                false,
                "调休额度状态异常，无法解析冻结额度分配"
        );
    }

    private LinkedHashMap<Long, BigDecimal> resolveCompensatoryQuotaAllocationForApproved(LeaveApplication leaveApplication,
                                                                                           Long tenantId) {
        LinkedHashMap<Long, BigDecimal> storedAllocation = parseQuotaAllocation(leaveApplication.getQuotaAllocation());
        if (!storedAllocation.isEmpty()) {
            return storedAllocation;
        }
        return buildCompensatoryQuotaAllocation(
                tenantId,
                leaveApplication.getEmployeeId(),
                leaveApplication.getLeaveTypeId(),
                leaveApplication.getDuration(),
                null,
                LeaveQuota::getUsedQuota,
                false,
                false,
                "调休额度状态异常，无法解析已使用额度分配"
        );
    }

    private void validateQuotaAvailability(Long tenantId,
                                           Long employeeId,
                                           LeaveType leaveType,
                                           String unit,
                                           Map<Integer, BigDecimal> usageByYear) {
        for (Map.Entry<Integer, BigDecimal> entry : usageByYear.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuota(tenantId, employeeId, leaveType.getId(), entry.getKey());
            BigDecimal availableQuota = normalizeQuota(leaveQuota.getAvailableQuota());
            if (availableQuota.compareTo(entry.getValue()) < 0) {
                throw new InsufficientQuotaException(
                        String.format("%d 年 %s 额度不足，可用额度: %s %s，申请额度: %s %s",
                                entry.getKey(),
                                leaveType.getLeaveName(),
                                availableQuota,
                                unit,
                                entry.getValue(),
                                unit)
                );
            }
        }
    }

    private void freezeQuotaUsage(Long tenantId,
                                  Long employeeId,
                                  Long leaveTypeId,
                                  Map<Integer, BigDecimal> usageByYear) {
        for (Map.Entry<Integer, BigDecimal> entry : usageByYear.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuota(tenantId, employeeId, leaveTypeId, entry.getKey());
            BigDecimal availableQuota = normalizeQuota(leaveQuota.getAvailableQuota());
            if (availableQuota.compareTo(entry.getValue()) < 0) {
                throw new InsufficientQuotaException("假期额度不足");
            }
            leaveQuota.setFrozenQuota(normalizeQuota(normalizeQuota(leaveQuota.getFrozenQuota()).add(entry.getValue())));
            leaveQuota.setAvailableQuota(normalizeQuota(availableQuota.subtract(entry.getValue())));
            leaveQuotaMapper.updateById(leaveQuota);
        }
    }

    private void consumeFrozenQuota(Long tenantId,
                                    Long employeeId,
                                    Long leaveTypeId,
                                    Map<Integer, BigDecimal> usageByYear) {
        for (Map.Entry<Integer, BigDecimal> entry : usageByYear.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuota(tenantId, employeeId, leaveTypeId, entry.getKey());
            BigDecimal frozenQuota = normalizeQuota(leaveQuota.getFrozenQuota());
            if (frozenQuota.compareTo(entry.getValue()) < 0) {
                throw new HrBusinessException("假期额度状态异常，无法扣减冻结额度");
            }
            leaveQuota.setFrozenQuota(normalizeQuota(frozenQuota.subtract(entry.getValue())));
            leaveQuota.setUsedQuota(normalizeQuota(normalizeQuota(leaveQuota.getUsedQuota()).add(entry.getValue())));
            leaveQuotaMapper.updateById(leaveQuota);
        }
    }

    private void releaseFrozenQuota(Long tenantId,
                                    Long employeeId,
                                    Long leaveTypeId,
                                    Map<Integer, BigDecimal> usageByYear) {
        for (Map.Entry<Integer, BigDecimal> entry : usageByYear.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuota(tenantId, employeeId, leaveTypeId, entry.getKey());
            BigDecimal frozenQuota = normalizeQuota(leaveQuota.getFrozenQuota());
            if (frozenQuota.compareTo(entry.getValue()) < 0) {
                throw new HrBusinessException("假期额度状态异常，无法释放冻结额度");
            }
            leaveQuota.setFrozenQuota(normalizeQuota(frozenQuota.subtract(entry.getValue())));
            leaveQuota.setAvailableQuota(normalizeQuota(normalizeQuota(leaveQuota.getAvailableQuota()).add(entry.getValue())));
            leaveQuotaMapper.updateById(leaveQuota);
        }
    }

    private void restoreUsedQuota(Long tenantId,
                                  Long employeeId,
                                  Long leaveTypeId,
                                  Map<Integer, BigDecimal> usageByYear) {
        for (Map.Entry<Integer, BigDecimal> entry : usageByYear.entrySet()) {
            LeaveQuota leaveQuota = getRequiredLeaveQuota(tenantId, employeeId, leaveTypeId, entry.getKey());
            BigDecimal usedQuota = normalizeQuota(leaveQuota.getUsedQuota());
            if (usedQuota.compareTo(entry.getValue()) < 0) {
                throw new HrBusinessException("假期额度状态异常，无法恢复已使用额度");
            }
            leaveQuota.setUsedQuota(normalizeQuota(usedQuota.subtract(entry.getValue())));
            leaveQuota.setAvailableQuota(normalizeQuota(normalizeQuota(leaveQuota.getAvailableQuota()).add(entry.getValue())));
            leaveQuotaMapper.updateById(leaveQuota);
        }
    }

    /**
     * 仅在额度尚未被消费或冻结时，允许按最新规则刷新旧记录。
     */
    private boolean shouldRefreshQuota(LeaveQuota existingQuota, BigDecimal totalQuota, LocalDate expiryDate) {
        if (!isZero(existingQuota.getUsedQuota()) || !isZero(existingQuota.getFrozenQuota())) {
            return false;
        }
        return compareQuota(existingQuota.getTotalQuota(), totalQuota) != 0
                || compareQuota(existingQuota.getAvailableQuota(), totalQuota) != 0
                || (existingQuota.getExpiryDate() != null && !existingQuota.getExpiryDate().equals(expiryDate))
                || existingQuota.getExpiryDate() == null;
    }

    private boolean isZero(BigDecimal value) {
        return value == null || value.compareTo(BigDecimal.ZERO) == 0;
    }

    private int compareQuota(BigDecimal left, BigDecimal right) {
        BigDecimal normalizedLeft = left == null ? BigDecimal.ZERO : left;
        BigDecimal normalizedRight = right == null ? BigDecimal.ZERO : right;
        return normalizedLeft.compareTo(normalizedRight);
    }

    /**
     * 请假相关操作只允许已入职员工执行。
     */
    private void validateLeaveEligibleEmployee(Employee employee, String operation) {
        if ("PROBATION".equals(employee.getEmployeeStatus()) || "REGULAR".equals(employee.getEmployeeStatus())) {
            return;
        }
        throw HrBusinessException.invalidEmployeeStatus(employee.getId(), employee.getEmployeeStatus(), operation);
    }

    
    /**
     * 调整假期额度
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void adjustLeaveQuota(LeaveQuotaAdjustDTO dto) {
        log.info("调整假期额度，employeeId: {}, leaveTypeId: {}, adjustmentAmount: {}", 
                dto.getEmployeeId(), dto.getLeaveTypeId(), dto.getAdjustmentAmount());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        getTenantEmployeeOrThrow(dto.getEmployeeId(), tenantId);

        LeaveType leaveType = leaveTypeMapper.selectById(dto.getLeaveTypeId());
        if (leaveType == null || !tenantId.equals(leaveType.getTenantId())) {
            throw new HrBusinessException("假期类型不存在");
        }
        if (isCompensatoryLeave(leaveType)) {
            adjustCompensatoryLeaveQuota(tenantId, dto);
            return;
        }
        
        // 查询假期额度
        LambdaQueryWrapper<LeaveQuota> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                    .eq(LeaveQuota::getEmployeeId, dto.getEmployeeId())
                    .eq(LeaveQuota::getLeaveTypeId, dto.getLeaveTypeId())
                    .eq(LeaveQuota::getYear, dto.getYear());
        
        LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(queryWrapper);
        if (leaveQuota == null) {
            throw new HrBusinessException("假期额度不存在");
        }
        
        // 调整总额度
        BigDecimal newTotalQuota = normalizeQuota(normalizeQuota(leaveQuota.getTotalQuota()).add(dto.getAdjustmentAmount()));
        if (newTotalQuota.compareTo(BigDecimal.ZERO) < 0) {
            throw new HrBusinessException("调整后的总额度不能为负数");
        }

        // 重新计算可用额度
        BigDecimal rawAvailableQuota = newTotalQuota
                .subtract(normalizeQuota(leaveQuota.getUsedQuota()))
                .subtract(normalizeQuota(leaveQuota.getFrozenQuota()));
        // 普通假种减少额度时，不能把“已使用/已冻结”部分挤压成负的可用余额。
        if (dto.getAdjustmentAmount().compareTo(BigDecimal.ZERO) < 0 && rawAvailableQuota.compareTo(BigDecimal.ZERO) < 0) {
            throw new HrBusinessException("假期额度可用额度不足，无法减少指定额度");
        }
        BigDecimal newAvailableQuota = normalizeQuota(rawAvailableQuota);

        leaveQuota.setTotalQuota(newTotalQuota);
        leaveQuota.setAvailableQuota(newAvailableQuota);
        
        // 更新数据库
        leaveQuotaMapper.updateById(leaveQuota);
        
        log.info("假期额度调整成功，新总额度: {}, 新可用额度: {}", newTotalQuota, newAvailableQuota);
    }

    private void adjustCompensatoryLeaveQuota(Long tenantId, LeaveQuotaAdjustDTO dto) {
        if (dto.getExpiryDate() == null) {
            throw new HrBusinessException("调休额度调整必须指定过期日期");
        }
        BigDecimal adjustmentAmount = normalizeQuota(dto.getAdjustmentAmount().abs());
        if (adjustmentAmount.compareTo(BigDecimal.ZERO) == 0) {
            throw new HrBusinessException("调整额度不能为0");
        }
        if (dto.getAdjustmentAmount().compareTo(BigDecimal.ZERO) > 0) {
            validateCompensatoryQuotaAdjustmentWindow(dto.getYear(), dto.getExpiryDate());
        }

        LambdaQueryWrapper<LeaveQuota> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                .eq(LeaveQuota::getEmployeeId, dto.getEmployeeId())
                .eq(LeaveQuota::getLeaveTypeId, dto.getLeaveTypeId())
                .eq(LeaveQuota::getYear, dto.getYear())
                .eq(LeaveQuota::getExpiryDate, dto.getExpiryDate());

        LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(queryWrapper);
        if (dto.getAdjustmentAmount().compareTo(BigDecimal.ZERO) > 0) {
            if (leaveQuota == null) {
                leaveQuota = new LeaveQuota();
                leaveQuota.setTenantId(tenantId);
                leaveQuota.setEmployeeId(dto.getEmployeeId());
                leaveQuota.setLeaveTypeId(dto.getLeaveTypeId());
                leaveQuota.setYear(dto.getYear());
                leaveQuota.setTotalQuota(adjustmentAmount);
                leaveQuota.setUsedQuota(BigDecimal.ZERO);
                leaveQuota.setFrozenQuota(BigDecimal.ZERO);
                leaveQuota.setAvailableQuota(adjustmentAmount);
                leaveQuota.setExpiryDate(dto.getExpiryDate());
                leaveQuotaMapper.insert(leaveQuota);
            } else {
                leaveQuota.setTotalQuota(normalizeQuota(leaveQuota.getTotalQuota()).add(adjustmentAmount));
                leaveQuota.setAvailableQuota(normalizeQuota(leaveQuota.getAvailableQuota()).add(adjustmentAmount));
                leaveQuotaMapper.updateById(leaveQuota);
            }
            log.info("调休额度桶增加成功，employeeId: {}, leaveTypeId: {}, year: {}, expiryDate: {}, adjustmentAmount: {}",
                    dto.getEmployeeId(), dto.getLeaveTypeId(), dto.getYear(), dto.getExpiryDate(), adjustmentAmount);
            return;
        }

        if (leaveQuota == null) {
            throw new HrBusinessException("指定的调休额度桶不存在，无法减少额度");
        }

        BigDecimal availableQuota = normalizeQuota(leaveQuota.getAvailableQuota());
        if (availableQuota.compareTo(adjustmentAmount) < 0) {
            throw new HrBusinessException("调休额度桶可用额度不足，无法减少指定额度");
        }
        leaveQuota.setTotalQuota(normalizeQuota(normalizeQuota(leaveQuota.getTotalQuota()).subtract(adjustmentAmount)));
        leaveQuota.setAvailableQuota(normalizeQuota(availableQuota.subtract(adjustmentAmount)));
        leaveQuotaMapper.updateById(leaveQuota);

        log.info("调休额度桶减少成功，employeeId: {}, leaveTypeId: {}, year: {}, expiryDate: {}, adjustmentAmount: {}",
                dto.getEmployeeId(), dto.getLeaveTypeId(), dto.getYear(), dto.getExpiryDate(), adjustmentAmount);
    }

    /**
     * 手工新增或补加调休额度时，至少要保证这个额度桶还没过期，
     * 且过期日不能早于它的归属年度起点，避免造出逻辑上无效的桶。
     */
    private void validateCompensatoryQuotaAdjustmentWindow(Integer year, LocalDate expiryDate) {
        LocalDate yearStart = LocalDate.of(year, 1, 1);
        if (expiryDate.isBefore(yearStart)) {
            throw new HrBusinessException("调休额度过期日期不能早于归属年度开始日期");
        }
        if (expiryDate.isBefore(LocalDate.now())) {
            throw new HrBusinessException("不能新增已过期的调休额度桶");
        }
    }

    private List<LeaveQuota> queryCompensatoryQuotaBucketsForYear(Long tenantId,
                                                                  Long employeeId,
                                                                  Long leaveTypeId,
                                                                  Integer year) {
        LocalDate yearStart = LocalDate.of(year, 1, 1);
        LambdaQueryWrapper<LeaveQuota> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                .eq(LeaveQuota::getEmployeeId, employeeId)
                .eq(LeaveQuota::getLeaveTypeId, leaveTypeId)
                .le(LeaveQuota::getYear, year)
                .and(wrapper -> wrapper.isNull(LeaveQuota::getExpiryDate)
                        .or()
                        .ge(LeaveQuota::getExpiryDate, yearStart));
        return queryAndSortCompensatoryQuotaBuckets(queryWrapper, true, yearStart);
    }

    private List<LeaveQuota> queryAndSortCompensatoryQuotaBuckets(LambdaQueryWrapper<LeaveQuota> queryWrapper,
                                                                  boolean excludeExpired,
                                                                  LocalDate referenceDate) {
        List<LeaveQuota> quotaList = new ArrayList<>(leaveQuotaMapper.selectList(queryWrapper));
        if (excludeExpired) {
            LocalDate baseDate = referenceDate != null ? referenceDate : LocalDate.now();
            quotaList = quotaList.stream()
                    .filter(leaveQuota -> leaveQuota.getExpiryDate() == null || !leaveQuota.getExpiryDate().isBefore(baseDate))
                    .collect(Collectors.toList());
        }
        sortCompensatoryQuotaBuckets(quotaList);
        return quotaList;
    }

    private void sortCompensatoryQuotaBuckets(List<LeaveQuota> quotaList) {
        // MySQL 中 NULL 会在升序时排到前面，这里显式把“长期有效”桶放到最后，
        // 保证真正快到期的额度优先被消费。
        quotaList.sort(Comparator
                .comparing(LeaveQuota::getExpiryDate, Comparator.nullsLast(LocalDate::compareTo))
                .thenComparing(LeaveQuota::getYear, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(LeaveQuota::getId, Comparator.nullsLast(Long::compareTo)));
    }

    private LeaveType getCompensatoryLeaveType(Long tenantId) {
        LambdaQueryWrapper<LeaveType> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveType::getTenantId, tenantId)
                .eq(LeaveType::getLeaveCode, LEAVE_CODE_COMPENSATORY);
        return leaveTypeMapper.selectOne(queryWrapper);
    }

    private LeaveQuotaVO buildLeaveQuotaSummaryVO(List<LeaveQuota> quotaList,
                                                  Employee employee,
                                                  LeaveType leaveType,
                                                  Integer requestedYear) {
        LeaveQuotaVO vo = new LeaveQuotaVO();
        BeanUtils.copyProperties(quotaList.get(0), vo);
        vo.setYear(requestedYear);
        vo.setTotalQuota(quotaList.stream().map(LeaveQuota::getTotalQuota).map(this::normalizeQuota)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        vo.setUsedQuota(quotaList.stream().map(LeaveQuota::getUsedQuota).map(this::normalizeQuota)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        vo.setFrozenQuota(quotaList.stream().map(LeaveQuota::getFrozenQuota).map(this::normalizeQuota)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        vo.setAvailableQuota(quotaList.stream().map(LeaveQuota::getAvailableQuota).map(this::normalizeQuota)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        vo.setExpiryDate(quotaList.stream()
                .map(LeaveQuota::getExpiryDate)
                .filter(date -> date != null)
                .min(LocalDate::compareTo)
                .orElse(null));
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
        }
        if (leaveType != null) {
            vo.setLeaveTypeName(leaveType.getLeaveName());
        }
        return vo;
    }

    private LeaveQuotaVO buildLeaveQuotaBucketVO(LeaveQuota leaveQuota,
                                                 Employee employee,
                                                 LeaveType leaveType) {
        LeaveQuotaVO vo = new LeaveQuotaVO();
        BeanUtils.copyProperties(leaveQuota, vo);
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
        }
        if (leaveType != null) {
            vo.setLeaveTypeName(leaveType.getLeaveName());
        }
        return vo;
    }
    
    /**
     * 获取员工假期额度
     */
    @Override
    public LeaveQuotaVO getLeaveQuota(Long employeeId, Long leaveTypeId, Integer year) {
        log.info("获取员工假期额度，employeeId: {}, leaveTypeId: {}, year: {}", employeeId, leaveTypeId, year);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        Employee employee = getTenantEmployeeOrThrow(employeeId, tenantId);
        LeaveType leaveType = leaveTypeMapper.selectById(leaveTypeId);
        if (leaveType == null || !tenantId.equals(leaveType.getTenantId())) {
            throw new HrBusinessException("假期类型不存在");
        }
        if (isCompensatoryLeave(leaveType)) {
            List<LeaveQuota> quotaList = queryCompensatoryQuotaBucketsForYear(tenantId, employeeId, leaveTypeId, year);
            if (quotaList.isEmpty()) {
                throw new HrBusinessException("假期额度不存在");
            }
            return buildLeaveQuotaSummaryVO(quotaList, employee, leaveType, year);
        }

        LambdaQueryWrapper<LeaveQuota> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                .eq(LeaveQuota::getEmployeeId, employeeId)
                .eq(LeaveQuota::getLeaveTypeId, leaveTypeId)
                .eq(LeaveQuota::getYear, year)
                .orderByAsc(LeaveQuota::getExpiryDate, LeaveQuota::getId);

        List<LeaveQuota> quotaList = leaveQuotaMapper.selectList(queryWrapper);
        if (quotaList.isEmpty()) {
            // 普通按年度管控的假种，在未初始化时也返回占位额度，和列表接口保持一致。
            if (Boolean.TRUE.equals(leaveType.getNeedQuota())) {
                return buildPendingLeaveQuotaSummaryVO(employee, leaveType, year);
            }
            throw new HrBusinessException("假期额度不存在");
        }
        return buildLeaveQuotaSummaryVO(quotaList, employee, leaveType, year);
    }
    
    /**
     * 获取员工假期额度列表
     */
    @Override
    public List<LeaveQuotaVO> listLeaveQuotaBuckets(Long employeeId, Long leaveTypeId, Integer year) {
        log.info("获取员工假期额度桶明细，employeeId: {}, leaveTypeId: {}, year: {}", employeeId, leaveTypeId, year);

        Long tenantId = SecurityUtils.getTenantId();
        Employee employee = getTenantEmployeeOrThrow(employeeId, tenantId);
        LeaveType leaveType = leaveTypeMapper.selectById(leaveTypeId);
        if (leaveType == null || !tenantId.equals(leaveType.getTenantId())) {
            throw new HrBusinessException("假期类型不存在");
        }

        List<LeaveQuota> quotaList;
        if (isCompensatoryLeave(leaveType)) {
            // 调休桶明细需要带出“跨年仍有效”的额度，便于 HR 判断快过期余额。
            quotaList = queryCompensatoryQuotaBucketsForYear(tenantId, employeeId, leaveTypeId, year);
        } else {
            LambdaQueryWrapper<LeaveQuota> queryWrapper = new LambdaQueryWrapper<>();
            queryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                    .eq(LeaveQuota::getEmployeeId, employeeId)
                    .eq(LeaveQuota::getLeaveTypeId, leaveTypeId)
                    .eq(LeaveQuota::getYear, year)
                    .orderByAsc(LeaveQuota::getExpiryDate, LeaveQuota::getId);
            quotaList = leaveQuotaMapper.selectList(queryWrapper);
        }

        // 查询型接口在“没有额度桶”时返回空列表，避免前端把正常空态误判成接口异常。
        if (quotaList.isEmpty()) {
            return Collections.emptyList();
        }
        return quotaList.stream()
                .map(quota -> buildLeaveQuotaBucketVO(quota, employee, leaveType))
                .collect(Collectors.toList());
    }

    @Override
    public List<LeaveQuotaVO> listLeaveQuotas(Long employeeId, Integer year) {
        log.info("获取员工假期额度列表，employeeId: {}, year: {}", employeeId, year);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        Employee employee = getTenantEmployeeOrThrow(employeeId, tenantId);
        
        List<LeaveQuotaVO> quotaList = new ArrayList<>(leaveQuotaMapper.selectLeaveQuotaList(tenantId, employeeId, year));
        LeaveType compensatoryType = getCompensatoryLeaveType(tenantId);
        if (compensatoryType != null) {
            quotaList.removeIf(vo -> compensatoryType.getId().equals(vo.getLeaveTypeId()));
            List<LeaveQuota> compensatoryBuckets = queryCompensatoryQuotaBucketsForYear(
                    tenantId,
                    employeeId,
                    compensatoryType.getId(),
                    year
            );
            if (!compensatoryBuckets.isEmpty()) {
                quotaList.add(buildLeaveQuotaSummaryVO(compensatoryBuckets, employee, compensatoryType, year));
            }
        }

        appendPendingQuotaSummaries(quotaList, employee, listQuotaEnabledLeaveTypes(tenantId), year);

        quotaList.sort(Comparator
                .comparing(LeaveQuotaVO::getLeaveTypeId, Comparator.nullsLast(Long::compareTo))
                .thenComparing(LeaveQuotaVO::getYear, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(LeaveQuotaVO::getExpiryDate, Comparator.nullsLast(LocalDate::compareTo))
                .thenComparing(LeaveQuotaVO::getId, Comparator.nullsLast(Long::compareTo)));
        return quotaList;
    }

    private List<LeaveType> listQuotaEnabledLeaveTypes(Long tenantId) {
        LambdaQueryWrapper<LeaveType> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveType::getTenantId, tenantId)
                .eq(LeaveType::getNeedQuota, true)
                .eq(LeaveType::getStatus, 1)
                .orderByAsc(LeaveType::getId);
        return leaveTypeMapper.selectList(queryWrapper);
    }

    private void appendPendingQuotaSummaries(List<LeaveQuotaVO> quotaList,
                                             Employee employee,
                                             List<LeaveType> leaveTypes,
                                             Integer year) {
        if (leaveTypes == null || leaveTypes.isEmpty()) {
            return;
        }

        Map<Long, LeaveQuotaVO> existingQuotaMap = quotaList.stream()
                .filter(item -> item.getLeaveTypeId() != null)
                .collect(Collectors.toMap(LeaveQuotaVO::getLeaveTypeId, Function.identity(), (left, right) -> left));

        for (LeaveType leaveType : leaveTypes) {
            if (leaveType == null || isCompensatoryLeave(leaveType) || existingQuotaMap.containsKey(leaveType.getId())) {
                continue;
            }
            quotaList.add(buildPendingLeaveQuotaSummaryVO(employee, leaveType, year));
        }
    }

    /**
     * 额度查询和调整都必须先确认 employeeId 属于当前租户，
     * 避免把占位额度、调休额度桶等数据误挂到错误员工名下。
     */
    private Employee getTenantEmployeeOrThrow(Long employeeId, Long tenantId) {
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !tenantId.equals(employee.getTenantId())) {
            throw new HrBusinessException("员工不存在");
        }
        return employee;
    }

    /**
     * 年度额度补齐既支持整年批量处理，也支持在额度页按当前假种单独补齐。
     */
    private List<LeaveType> resolveQuotaInitLeaveTypes(Long tenantId, Long leaveTypeId) {
        if (leaveTypeId == null) {
            return listQuotaEnabledLeaveTypes(tenantId).stream()
                    .filter(leaveType -> !isCompensatoryLeave(leaveType))
                    .collect(Collectors.toList());
        }

        LeaveType leaveType = leaveTypeMapper.selectById(leaveTypeId);
        if (leaveType == null || !tenantId.equals(leaveType.getTenantId())) {
            throw new HrBusinessException("假期类型不存在");
        }
        if (!Boolean.TRUE.equals(leaveType.getNeedQuota())
                || !Integer.valueOf(1).equals(leaveType.getStatus())
                || isCompensatoryLeave(leaveType)) {
            throw new HrBusinessException("当前假种不支持补齐年度额度");
        }
        return List.of(leaveType);
    }

    private LeaveQuotaVO buildPendingLeaveQuotaSummaryVO(Employee employee, LeaveType leaveType, Integer year) {
        LeaveQuotaVO vo = new LeaveQuotaVO();
        if (employee != null) {
            vo.setEmployeeId(employee.getId());
            vo.setEmployeeName(employee.getName());
        }
        vo.setLeaveTypeId(leaveType.getId());
        vo.setLeaveTypeName(leaveType.getLeaveName());
        vo.setYear(year);
        vo.setTotalQuota(normalizeQuota(BigDecimal.ZERO));
        vo.setUsedQuota(normalizeQuota(BigDecimal.ZERO));
        vo.setFrozenQuota(normalizeQuota(BigDecimal.ZERO));
        vo.setAvailableQuota(normalizeQuota(BigDecimal.ZERO));
        return vo;
    }

    
    // ==================== 请假申请管理 ====================
    
    /**
     * 创建请假申请
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createLeaveApplication(LeaveApplicationCreateDTO dto) {
        log.info("创建请假申请，employeeId: {}, leaveTypeId: {}, duration: {}", 
                dto.getEmployeeId(), dto.getLeaveTypeId(), dto.getDuration());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 验证员工是否存在
        Employee employee = getTenantEmployeeOrThrow(dto.getEmployeeId(), tenantId);
        validateLeaveEligibleEmployee(employee, "请假申请");
        
        // 验证假期类型是否存在
        LeaveType leaveType = leaveTypeMapper.selectById(dto.getLeaveTypeId());
        if (leaveType == null || !leaveType.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("假期类型不存在");
        }
        
        // 如果假期类型需要额度，验证额度是否充足
        if (leaveType.getNeedQuota()) {
            if (isCompensatoryLeave(leaveType)) {
                validateCompensatoryQuotaAvailability(
                        tenantId,
                        dto.getEmployeeId(),
                        leaveType,
                        dto.getDuration(),
                        resolveCompensatoryReferenceDate(dto.getStartTime(), dto.getEndTime())
                );
            } else {
                Map<Integer, BigDecimal> usageByYear = splitQuotaUsageByYear(
                        dto.getStartTime(),
                        dto.getEndTime(),
                        dto.getDuration(),
                        dto.getUnit()
                );
                validateQuotaAvailability(tenantId, dto.getEmployeeId(), leaveType, dto.getUnit(), usageByYear);
            }
        }
        
        // 生成申请编号
        String applicationNo = generateApplicationNo();
        
        // 创建请假申请实体
        LeaveApplication leaveApplication = new LeaveApplication();
        BeanUtils.copyProperties(dto, leaveApplication);
        leaveApplication.setTenantId(tenantId);
        leaveApplication.setApplicationNo(applicationNo);
        leaveApplication.setStatus("DRAFT"); // 初始状态为草稿
        
        // 保存到数据库
        leaveApplicationMapper.insert(leaveApplication);
        
        log.info("请假申请创建成功，ID: {}, applicationNo: {}", leaveApplication.getId(), applicationNo);
        return leaveApplication.getId();
    }

    @Override
    public LeaveApplicationVO getLeaveApplication(Long id) {
        Long tenantId = SecurityUtils.getTenantId();
        LeaveApplication leaveApplication = leaveApplicationMapper.selectById(id);
        if (leaveApplication == null || !leaveApplication.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("请假申请不存在");
        }

        LeaveApplicationVO vo = new LeaveApplicationVO();
        BeanUtils.copyProperties(leaveApplication, vo);

        Employee employee = employeeMapper.selectById(leaveApplication.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
        }

        LeaveType leaveType = leaveTypeMapper.selectById(leaveApplication.getLeaveTypeId());
        if (leaveType != null) {
            vo.setLeaveTypeName(leaveType.getLeaveName());
        }

        return vo;
    }
    
    /**
     * 生成申请编号
     */
    private String generateApplicationNo() {
        return "LEAVE" + IdUtils.snowflakeIdStr();
    }

    
    /**
     * 提交请假申请（启动审批流程）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitLeaveApplication(Long id) {
        log.info("提交请假申请，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询请假申请
        LeaveApplication leaveApplication = leaveApplicationMapper.selectById(id);
        if (leaveApplication == null || !leaveApplication.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("请假申请不存在");
        }
        
        // 验证状态
        if (!"DRAFT".equals(leaveApplication.getStatus())) {
            throw new HrBusinessException("只有草稿状态的申请才能提交");
        }
        
        // 查询假期类型
        LeaveType leaveType = leaveTypeMapper.selectById(leaveApplication.getLeaveTypeId());
        
        // 如果需要额度，冻结额度
        if (leaveType.getNeedQuota()) {
            if (isCompensatoryLeave(leaveType)) {
                LinkedHashMap<Long, BigDecimal> quotaAllocation = buildCompensatoryQuotaAllocation(
                        tenantId,
                        leaveApplication.getEmployeeId(),
                        leaveApplication.getLeaveTypeId(),
                        leaveApplication.getDuration(),
                        resolveCompensatoryReferenceDate(leaveApplication.getStartTime(), leaveApplication.getEndTime()),
                        LeaveQuota::getAvailableQuota,
                        true,
                        true,
                        String.format("%s额度不足或已过期，可用额度无法覆盖申请时长 %s %s",
                                leaveType.getLeaveName(),
                                normalizeQuota(leaveApplication.getDuration()),
                                leaveApplication.getUnit())
                );
                freezeCompensatoryQuotaUsage(tenantId, quotaAllocation);
                leaveApplication.setQuotaAllocation(serializeQuotaAllocation(quotaAllocation));
            } else {
                Map<Integer, BigDecimal> usageByYear = splitQuotaUsageByYear(
                        leaveApplication.getStartTime(),
                        leaveApplication.getEndTime(),
                        leaveApplication.getDuration(),
                        leaveApplication.getUnit()
                );
                validateQuotaAvailability(tenantId, leaveApplication.getEmployeeId(), leaveType, leaveApplication.getUnit(), usageByYear);
                freezeQuotaUsage(tenantId, leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), usageByYear);
            }
            
            log.info("冻结假期额度成功，employeeId: {}, leaveTypeId: {}, frozenAmount: {}", 
                    leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), leaveApplication.getDuration());
        }
        
        // TODO: 调用工作流服务启动审批流程
        // String processInstanceId = workflowServiceClient.startProcess(...);
        // leaveApplication.setProcessInstanceId(processInstanceId);
        
        // 更新申请状态为审批中
        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(leaveApplication.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getLeave());
        processStartDTO.setBusinessType("LEAVE");
        processStartDTO.setBusinessId(leaveApplication.getId());
        processStartDTO.setBusinessNo(leaveApplication.getApplicationNo());
        processStartDTO.setProcessTitle("请假申请-" + leaveApplication.getApplicationNo());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        Map<String, Object> variables = new HashMap<>();
        variables.put("employeeId", leaveApplication.getEmployeeId());
        variables.put("leaveTypeId", leaveApplication.getLeaveTypeId());
        variables.put("startTime", leaveApplication.getStartTime() != null ? leaveApplication.getStartTime().toString() : null);
        variables.put("endTime", leaveApplication.getEndTime() != null ? leaveApplication.getEndTime().toString() : null);
        variables.put("duration", leaveApplication.getDuration());
        variables.put("unit", leaveApplication.getUnit());
        variables.put("reason", leaveApplication.getReason());
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + result.getMsg());
            }

            leaveApplication.setStatus("APPROVING");
            leaveApplication.setProcessInstanceId(result.getData());
            leaveApplicationMapper.updateById(leaveApplication);
        } catch (Exception e) {
            log.error("启动请假审批流程失败", e);
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + e.getMessage(), e);
        }
        
        log.info("请假申请提交成功，ID: {}", id);
    }

    
    /**
     * 审批通过后扣减额度
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveLeaveApplication(Long id) {
        log.info("审批通过请假申请，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询请假申请
        LeaveApplication leaveApplication = leaveApplicationMapper.selectById(id);
        tenantId = leaveApplication != null ? leaveApplication.getTenantId() : tenantId;
        if (leaveApplication == null || !leaveApplication.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("请假申请不存在");
        }
        
        // 验证状态
        if (!"APPROVING".equals(leaveApplication.getStatus())) {
            throw new HrBusinessException("只有审批中的申请才能审批通过");
        }
        
        // 查询假期类型
        LeaveType leaveType = leaveTypeMapper.selectById(leaveApplication.getLeaveTypeId());
        
        // 如果需要额度，扣减额度
        if (leaveType.getNeedQuota()) {
            if (isCompensatoryLeave(leaveType)) {
                consumeCompensatoryFrozenQuota(tenantId, resolveCompensatoryQuotaAllocationForApproving(leaveApplication, tenantId));
            } else {
                Map<Integer, BigDecimal> usageByYear = splitQuotaUsageByYear(
                        leaveApplication.getStartTime(),
                        leaveApplication.getEndTime(),
                        leaveApplication.getDuration(),
                        leaveApplication.getUnit()
                );
                consumeFrozenQuota(tenantId, leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), usageByYear);
            }
            
            log.info("扣减假期额度成功，employeeId: {}, leaveTypeId: {}, usedAmount: {}", 
                    leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), leaveApplication.getDuration());
        }
        
        // 更新申请状态为已通过
        leaveApplication.setStatus("APPROVED");
        leaveApplicationMapper.updateById(leaveApplication);
        
        log.info("请假申请审批通过，ID: {}", id);
    }
    
    /**
     * 审批拒绝后释放冻结额度
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectLeaveApplication(Long id) {
        log.info("审批拒绝请假申请，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询请假申请
        LeaveApplication leaveApplication = leaveApplicationMapper.selectById(id);
        tenantId = leaveApplication != null ? leaveApplication.getTenantId() : tenantId;
        if (leaveApplication == null || !leaveApplication.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("请假申请不存在");
        }
        
        // 验证状态
        if (!"APPROVING".equals(leaveApplication.getStatus())) {
            throw new HrBusinessException("只有审批中的申请才能审批拒绝");
        }
        
        // 查询假期类型
        LeaveType leaveType = leaveTypeMapper.selectById(leaveApplication.getLeaveTypeId());
        
        // 如果需要额度，释放冻结额度
        if (leaveType.getNeedQuota()) {
            if (isCompensatoryLeave(leaveType)) {
                releaseCompensatoryFrozenQuota(tenantId, resolveCompensatoryQuotaAllocationForApproving(leaveApplication, tenantId));
            } else {
                Map<Integer, BigDecimal> usageByYear = splitQuotaUsageByYear(
                        leaveApplication.getStartTime(),
                        leaveApplication.getEndTime(),
                        leaveApplication.getDuration(),
                        leaveApplication.getUnit()
                );
                releaseFrozenQuota(tenantId, leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), usageByYear);
            }
            
            log.info("释放冻结额度成功，employeeId: {}, leaveTypeId: {}, releasedAmount: {}", 
                    leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), leaveApplication.getDuration());
        }
        
        // 更新申请状态为已拒绝
        leaveApplication.setStatus("REJECTED");
        leaveApplicationMapper.updateById(leaveApplication);
        
        log.info("请假申请审批拒绝，ID: {}", id);
    }

    
    /**
     * 撤销请假后恢复额度
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancelLeaveApplication(Long id) {
        log.info("撤销请假申请，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询请假申请
        LeaveApplication leaveApplication = leaveApplicationMapper.selectById(id);
        if (leaveApplication == null || !leaveApplication.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("请假申请不存在");
        }
        
        // 验证状态（只有审批中或已通过的申请才能撤销）
        if (!"APPROVING".equals(leaveApplication.getStatus()) && !"APPROVED".equals(leaveApplication.getStatus())) {
            throw new HrBusinessException("只有审批中或已通过的申请才能撤销");
        }

        if ("APPROVING".equals(leaveApplication.getStatus()) && leaveApplication.getProcessInstanceId() != null
                && !leaveApplication.getProcessInstanceId().isBlank()) {
            R<Void> result = workflowServiceClient.cancelProcess(leaveApplication.getProcessInstanceId());
            if (result == null || !result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_CANCEL_FAILED",
                        "撤销审批流程失败：" + (result != null ? result.getMsg() : "Workflow 服务无响应"));
            }
        }
        
        // 查询假期类型
        LeaveType leaveType = leaveTypeMapper.selectById(leaveApplication.getLeaveTypeId());
        
        // 如果需要额度，恢复额度
        if (leaveType.getNeedQuota()) {
            if (isCompensatoryLeave(leaveType)) {
                if ("APPROVING".equals(leaveApplication.getStatus())) {
                    releaseCompensatoryFrozenQuota(tenantId, resolveCompensatoryQuotaAllocationForApproving(leaveApplication, tenantId));
                } else if ("APPROVED".equals(leaveApplication.getStatus())) {
                    restoreCompensatoryUsedQuota(tenantId, resolveCompensatoryQuotaAllocationForApproved(leaveApplication, tenantId));
                }
            } else {
                Map<Integer, BigDecimal> usageByYear = splitQuotaUsageByYear(
                        leaveApplication.getStartTime(),
                        leaveApplication.getEndTime(),
                        leaveApplication.getDuration(),
                        leaveApplication.getUnit()
                );
                if ("APPROVING".equals(leaveApplication.getStatus())) {
                    releaseFrozenQuota(tenantId, leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), usageByYear);
                } else if ("APPROVED".equals(leaveApplication.getStatus())) {
                    restoreUsedQuota(tenantId, leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), usageByYear);
                }
            }
            
            log.info("恢复假期额度成功，employeeId: {}, leaveTypeId: {}, restoredAmount: {}", 
                    leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), leaveApplication.getDuration());
        }
        
        // 更新申请状态为已撤销
        leaveApplication.setStatus("CANCELLED");
        leaveApplicationMapper.updateById(leaveApplication);
        
        log.info("请假申请撤销成功，ID: {}", id);
    }
    
    /**
     * 分页查询请假申请列表
     */
    @Override
    public IPage<LeaveApplicationVO> listLeaveApplications(LeaveApplicationQueryDTO query) {
        log.info("分页查询请假申请列表，query: {}", query);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 创建分页对象
        Page<LeaveApplicationVO> page = new Page<>(query.getPageNum(), query.getPageSize());
        
        // 查询请假申请列表
        return leaveApplicationMapper.selectLeaveApplicationPage(page, tenantId, query);
    }
}
