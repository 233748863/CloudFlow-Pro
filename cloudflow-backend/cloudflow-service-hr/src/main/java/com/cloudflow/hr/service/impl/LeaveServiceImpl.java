package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
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
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    public void initLeaveQuota(Long employeeId, Integer year) {
        log.info("初始化员工假期额度，employeeId: {}, year: {}", employeeId, year);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询员工信息
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在");
        }
        validateLeaveEligibleEmployee(employee, "初始化假期额度");
        
        // 查询所有需要额度的假期类型
        LambdaQueryWrapper<LeaveType> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveType::getTenantId, tenantId)
                    .eq(LeaveType::getNeedQuota, true)
                    .eq(LeaveType::getStatus, 1);
        
        List<LeaveType> leaveTypes = leaveTypeMapper.selectList(queryWrapper);
        
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
                } else {
                    log.info("员工假期额度已存在且已使用，跳过初始化，employeeId: {}, leaveTypeId: {}, year: {}",
                            employeeId, leaveType.getId(), year);
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
        BigDecimal newTotalQuota = leaveQuota.getTotalQuota().add(dto.getAdjustmentAmount());
        if (newTotalQuota.compareTo(BigDecimal.ZERO) < 0) {
            throw new HrBusinessException("调整后的总额度不能为负数");
        }
        
        leaveQuota.setTotalQuota(newTotalQuota);
        
        // 重新计算可用额度
        BigDecimal newAvailableQuota = newTotalQuota
                .subtract(leaveQuota.getUsedQuota())
                .subtract(leaveQuota.getFrozenQuota());
        leaveQuota.setAvailableQuota(newAvailableQuota);
        
        // 更新数据库
        leaveQuotaMapper.updateById(leaveQuota);
        
        log.info("假期额度调整成功，新总额度: {}, 新可用额度: {}", newTotalQuota, newAvailableQuota);
    }
    
    /**
     * 获取员工假期额度
     */
    @Override
    public LeaveQuotaVO getLeaveQuota(Long employeeId, Long leaveTypeId, Integer year) {
        log.info("获取员工假期额度，employeeId: {}, leaveTypeId: {}, year: {}", employeeId, leaveTypeId, year);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询假期额度
        LambdaQueryWrapper<LeaveQuota> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                    .eq(LeaveQuota::getEmployeeId, employeeId)
                    .eq(LeaveQuota::getLeaveTypeId, leaveTypeId)
                    .eq(LeaveQuota::getYear, year);
        
        LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(queryWrapper);
        if (leaveQuota == null) {
            throw new HrBusinessException("假期额度不存在");
        }
        
        // 查询员工和假期类型信息
        Employee employee = employeeMapper.selectById(employeeId);
        LeaveType leaveType = leaveTypeMapper.selectById(leaveTypeId);
        
        // 转换为VO
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
     * 获取员工假期额度列表
     */
    @Override
    public List<LeaveQuotaVO> listLeaveQuotas(Long employeeId, Integer year) {
        log.info("获取员工假期额度列表，employeeId: {}, year: {}", employeeId, year);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询假期额度列表（包含关联信息）
        return leaveQuotaMapper.selectLeaveQuotaList(tenantId, employeeId, year);
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
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在");
        }
        validateLeaveEligibleEmployee(employee, "请假申请");
        
        // 验证假期类型是否存在
        LeaveType leaveType = leaveTypeMapper.selectById(dto.getLeaveTypeId());
        if (leaveType == null || !leaveType.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("假期类型不存在");
        }
        
        // 如果假期类型需要额度，验证额度是否充足
        if (leaveType.getNeedQuota()) {
            Integer year = dto.getStartTime().getYear();
            LambdaQueryWrapper<LeaveQuota> quotaQueryWrapper = new LambdaQueryWrapper<>();
            quotaQueryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                            .eq(LeaveQuota::getEmployeeId, dto.getEmployeeId())
                            .eq(LeaveQuota::getLeaveTypeId, dto.getLeaveTypeId())
                            .eq(LeaveQuota::getYear, year);
            
            LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(quotaQueryWrapper);
            if (leaveQuota == null) {
                throw new HrBusinessException("假期额度不存在，请先初始化假期额度");
            }
            
            // 验证可用额度是否充足
            if (leaveQuota.getAvailableQuota().compareTo(dto.getDuration()) < 0) {
                throw new InsufficientQuotaException(
                    String.format("假期额度不足，可用额度: %s %s，申请时长: %s %s",
                        leaveQuota.getAvailableQuota(), dto.getUnit(),
                        dto.getDuration(), dto.getUnit())
                );
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
        return "LEAVE" + System.currentTimeMillis();
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
            Integer year = leaveApplication.getStartTime().getYear();
            LambdaQueryWrapper<LeaveQuota> quotaQueryWrapper = new LambdaQueryWrapper<>();
            quotaQueryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                            .eq(LeaveQuota::getEmployeeId, leaveApplication.getEmployeeId())
                            .eq(LeaveQuota::getLeaveTypeId, leaveApplication.getLeaveTypeId())
                            .eq(LeaveQuota::getYear, year);
            
            LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(quotaQueryWrapper);
            if (leaveQuota == null) {
                throw new HrBusinessException("假期额度不存在");
            }
            
            // 再次验证可用额度
            if (leaveQuota.getAvailableQuota().compareTo(leaveApplication.getDuration()) < 0) {
                throw new InsufficientQuotaException("假期额度不足");
            }
            
            // 冻结额度
            leaveQuota.setFrozenQuota(leaveQuota.getFrozenQuota().add(leaveApplication.getDuration()));
            leaveQuota.setAvailableQuota(leaveQuota.getAvailableQuota().subtract(leaveApplication.getDuration()));
            leaveQuotaMapper.updateById(leaveQuota);
            
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
            Integer year = leaveApplication.getStartTime().getYear();
            LambdaQueryWrapper<LeaveQuota> quotaQueryWrapper = new LambdaQueryWrapper<>();
            quotaQueryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                            .eq(LeaveQuota::getEmployeeId, leaveApplication.getEmployeeId())
                            .eq(LeaveQuota::getLeaveTypeId, leaveApplication.getLeaveTypeId())
                            .eq(LeaveQuota::getYear, year);
            
            LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(quotaQueryWrapper);
            if (leaveQuota == null) {
                throw new HrBusinessException("假期额度不存在");
            }
            
            // 扣减额度：冻结额度转为已使用额度
            leaveQuota.setFrozenQuota(leaveQuota.getFrozenQuota().subtract(leaveApplication.getDuration()));
            leaveQuota.setUsedQuota(leaveQuota.getUsedQuota().add(leaveApplication.getDuration()));
            leaveQuotaMapper.updateById(leaveQuota);
            
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
            Integer year = leaveApplication.getStartTime().getYear();
            LambdaQueryWrapper<LeaveQuota> quotaQueryWrapper = new LambdaQueryWrapper<>();
            quotaQueryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                            .eq(LeaveQuota::getEmployeeId, leaveApplication.getEmployeeId())
                            .eq(LeaveQuota::getLeaveTypeId, leaveApplication.getLeaveTypeId())
                            .eq(LeaveQuota::getYear, year);
            
            LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(quotaQueryWrapper);
            if (leaveQuota != null) {
                // 释放冻结额度
                leaveQuota.setFrozenQuota(leaveQuota.getFrozenQuota().subtract(leaveApplication.getDuration()));
                leaveQuota.setAvailableQuota(leaveQuota.getAvailableQuota().add(leaveApplication.getDuration()));
                leaveQuotaMapper.updateById(leaveQuota);
                
                log.info("释放冻结额度成功，employeeId: {}, leaveTypeId: {}, releasedAmount: {}", 
                        leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), leaveApplication.getDuration());
            }
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
        
        // 查询假期类型
        LeaveType leaveType = leaveTypeMapper.selectById(leaveApplication.getLeaveTypeId());
        
        // 如果需要额度，恢复额度
        if (leaveType.getNeedQuota()) {
            Integer year = leaveApplication.getStartTime().getYear();
            LambdaQueryWrapper<LeaveQuota> quotaQueryWrapper = new LambdaQueryWrapper<>();
            quotaQueryWrapper.eq(LeaveQuota::getTenantId, tenantId)
                            .eq(LeaveQuota::getEmployeeId, leaveApplication.getEmployeeId())
                            .eq(LeaveQuota::getLeaveTypeId, leaveApplication.getLeaveTypeId())
                            .eq(LeaveQuota::getYear, year);
            
            LeaveQuota leaveQuota = leaveQuotaMapper.selectOne(quotaQueryWrapper);
            if (leaveQuota != null) {
                if ("APPROVING".equals(leaveApplication.getStatus())) {
                    // 如果是审批中状态，释放冻结额度
                    leaveQuota.setFrozenQuota(leaveQuota.getFrozenQuota().subtract(leaveApplication.getDuration()));
                    leaveQuota.setAvailableQuota(leaveQuota.getAvailableQuota().add(leaveApplication.getDuration()));
                } else if ("APPROVED".equals(leaveApplication.getStatus())) {
                    // 如果是已通过状态，恢复已使用额度
                    leaveQuota.setUsedQuota(leaveQuota.getUsedQuota().subtract(leaveApplication.getDuration()));
                    leaveQuota.setAvailableQuota(leaveQuota.getAvailableQuota().add(leaveApplication.getDuration()));
                }
                leaveQuotaMapper.updateById(leaveQuota);
                
                log.info("恢复假期额度成功，employeeId: {}, leaveTypeId: {}, restoredAmount: {}", 
                        leaveApplication.getEmployeeId(), leaveApplication.getLeaveTypeId(), leaveApplication.getDuration());
            }
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
