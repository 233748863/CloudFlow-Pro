package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.EmployeeSalaryAssignDTO;
import com.cloudflow.hr.domain.dto.EmployeeSalaryQueryDTO;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.domain.vo.EmployeeSalaryDetailVO;
import com.cloudflow.hr.domain.vo.EmployeeSalaryVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.cloudflow.hr.service.EmployeeSalaryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 员工薪资服务实现类
 * 提供员工薪资的分配和查询功能
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeSalaryServiceImpl implements EmployeeSalaryService {
    
    private final EmployeeSalaryMapper employeeSalaryMapper;
    private final EmployeeMapper employeeMapper;
    private final SalaryStructureMapper salaryStructureMapper;
    private final SalaryItemMapper salaryItemMapper;
    private final SalaryStructureItemMapper salaryStructureItemMapper;
    private final ObjectMapper objectMapper;
    
    // 状态映射
    private static final Map<String, String> STATUS_MAP = new HashMap<>();
    static {
        STATUS_MAP.put("DRAFT", "草稿");
        STATUS_MAP.put("ACTIVE", "生效中");
        STATUS_MAP.put("EXPIRED", "已过期");
    }
    
    /**
     * 分配薪资结构给员工
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void assignSalaryStructure(EmployeeSalaryAssignDTO dto) {
        log.info("分配薪资结构给员工，employeeId: {}, structureId: {}", dto.getEmployeeId(), dto.getStructureId());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在");
        }
        
        // 验证薪资结构是否存在
        SalaryStructure structure = salaryStructureMapper.selectById(dto.getStructureId());
        if (structure == null || !structure.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("薪资结构不存在");
        }
        
        // 验证薪资数据中的项目是否都属于该薪资结构
        validateSalaryData(dto.getStructureId(), dto.getSalaryData());
        
        // 计算总薪资
        BigDecimal totalSalary = dto.getSalaryData().values().stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        // 将旧的薪资记录设置为已过期
        expireOldSalary(dto.getEmployeeId());
        
        // 创建新的薪资记录
        EmployeeSalary employeeSalary = new EmployeeSalary();
        employeeSalary.setTenantId(tenantId);
        employeeSalary.setEmployeeId(dto.getEmployeeId());
        employeeSalary.setStructureId(dto.getStructureId());
        employeeSalary.setTotalSalary(totalSalary);
        employeeSalary.setEffectiveDate(dto.getEffectiveDate());
        employeeSalary.setStatus("ACTIVE");
        
        // 将薪资数据转换为JSON
        try {
            String salaryDataJson = objectMapper.writeValueAsString(dto.getSalaryData());
            employeeSalary.setSalaryData(salaryDataJson);
        } catch (Exception e) {
            log.error("转换薪资数据为JSON失败", e);
            throw new HrBusinessException("薪资数据格式错误");
        }
        
        // 保存到数据库
        employeeSalaryMapper.insert(employeeSalary);
        
        log.info("薪资结构分配成功，employeeId: {}, totalSalary: {}", dto.getEmployeeId(), totalSalary);
    }
    
    /**
     * 获取员工薪资详情（包含薪资项目明细）
     */
    @Override
    public EmployeeSalaryDetailVO getEmployeeSalary(Long employeeId) {
        log.info("获取员工薪资详情，employeeId: {}", employeeId);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询员工信息
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在");
        }
        
        // 查询员工当前生效的薪资记录
        LambdaQueryWrapper<EmployeeSalary> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeSalary::getTenantId, tenantId)
                    .eq(EmployeeSalary::getEmployeeId, employeeId)
                    .eq(EmployeeSalary::getStatus, "ACTIVE")
                    .orderByDesc(EmployeeSalary::getEffectiveDate)
                    .last("LIMIT 1");
        
        EmployeeSalary employeeSalary = employeeSalaryMapper.selectOne(queryWrapper);
        if (employeeSalary == null) {
            throw new HrBusinessException("员工暂无薪资信息");
        }
        
        // 转换为VO
        return convertToDetailVO(employeeSalary, employee);
    }
    
    /**
     * 查询员工薪资列表
     */
    @Override
    public List<EmployeeSalaryVO> listEmployeeSalaries(EmployeeSalaryQueryDTO query) {
        log.info("查询员工薪资列表");
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 构建查询条件
        LambdaQueryWrapper<EmployeeSalary> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeSalary::getTenantId, tenantId);
        
        if (query.getEmployeeId() != null) {
            queryWrapper.eq(EmployeeSalary::getEmployeeId, query.getEmployeeId());
        }
        if (query.getStructureId() != null) {
            queryWrapper.eq(EmployeeSalary::getStructureId, query.getStructureId());
        }
        if (query.getStatus() != null) {
            queryWrapper.eq(EmployeeSalary::getStatus, query.getStatus());
        }
        
        queryWrapper.orderByDesc(EmployeeSalary::getEffectiveDate);
        
        List<EmployeeSalary> employeeSalaries = employeeSalaryMapper.selectList(queryWrapper);
        
        // 如果按部门查询，需要先查询部门下的员工
        if (query.getDeptId() != null) {
            LambdaQueryWrapper<Employee> empQueryWrapper = new LambdaQueryWrapper<>();
            empQueryWrapper.eq(Employee::getTenantId, tenantId)
                          .eq(Employee::getDeptId, query.getDeptId());
            List<Employee> employees = employeeMapper.selectList(empQueryWrapper);
            
            Set<Long> employeeIds = employees.stream()
                    .map(Employee::getId)
                    .collect(Collectors.toSet());
            
            employeeSalaries = employeeSalaries.stream()
                    .filter(es -> employeeIds.contains(es.getEmployeeId()))
                    .collect(Collectors.toList());
        }
        
        // 转换为VO列表
        return employeeSalaries.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }
    
    /**
     * 验证薪资数据中的项目是否都属于该薪资结构
     */
    private void validateSalaryData(Long structureId, Map<Long, BigDecimal> salaryData) {
        // 查询薪资结构包含的项目
        LambdaQueryWrapper<SalaryStructureItem> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryStructureItem::getStructureId, structureId);
        
        List<SalaryStructureItem> structureItems = salaryStructureItemMapper.selectList(queryWrapper);
        Set<Long> validItemIds = structureItems.stream()
                .map(SalaryStructureItem::getItemId)
                .collect(Collectors.toSet());
        
        // 验证薪资数据中的项目ID是否都在薪资结构中
        for (Long itemId : salaryData.keySet()) {
            if (!validItemIds.contains(itemId)) {
                throw new HrBusinessException("薪资项目ID " + itemId + " 不属于该薪资结构");
            }
        }
    }
    
    /**
     * 将员工旧的薪资记录设置为已过期
     */
    private void expireOldSalary(Long employeeId) {
        LambdaQueryWrapper<EmployeeSalary> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeSalary::getEmployeeId, employeeId)
                    .eq(EmployeeSalary::getStatus, "ACTIVE");
        
        List<EmployeeSalary> oldSalaries = employeeSalaryMapper.selectList(queryWrapper);
        for (EmployeeSalary oldSalary : oldSalaries) {
            oldSalary.setStatus("EXPIRED");
            employeeSalaryMapper.updateById(oldSalary);
        }
    }
    
    /**
     * 转换为详情VO对象
     */
    private EmployeeSalaryDetailVO convertToDetailVO(EmployeeSalary employeeSalary, Employee employee) {
        EmployeeSalaryDetailVO vo = new EmployeeSalaryDetailVO();
        BeanUtils.copyProperties(employeeSalary, vo);
        
        // 设置员工信息
        vo.setEmployeeNo(employee.getEmployeeNo());
        vo.setEmployeeName(employee.getName());
        
        // 查询薪资结构信息
        SalaryStructure structure = salaryStructureMapper.selectById(employeeSalary.getStructureId());
        if (structure != null) {
            vo.setStructureCode(structure.getStructureCode());
            vo.setStructureName(structure.getStructureName());
        }
        
        // 解析薪资数据JSON
        try {
            Map<Long, BigDecimal> salaryDataMap = objectMapper.readValue(
                    employeeSalary.getSalaryData(),
                    new TypeReference<Map<Long, BigDecimal>>() {}
            );
            
            // 查询薪资项目详情
            List<EmployeeSalaryDetailVO.SalaryItemDetail> items = new ArrayList<>();
            for (Map.Entry<Long, BigDecimal> entry : salaryDataMap.entrySet()) {
                SalaryItem item = salaryItemMapper.selectById(entry.getKey());
                if (item != null) {
                    EmployeeSalaryDetailVO.SalaryItemDetail detail = new EmployeeSalaryDetailVO.SalaryItemDetail();
                    detail.setItemId(item.getId());
                    detail.setItemCode(item.getItemCode());
                    detail.setItemName(item.getItemName());
                    detail.setItemType(item.getItemType());
                    detail.setCategory(item.getCategory());
                    detail.setAmount(entry.getValue());
                    items.add(detail);
                }
            }
            vo.setItems(items);
        } catch (Exception e) {
            log.error("解析薪资数据JSON失败", e);
            vo.setItems(new ArrayList<>());
        }
        
        // 设置状态描述
        vo.setStatusDesc(STATUS_MAP.getOrDefault(employeeSalary.getStatus(), employeeSalary.getStatus()));
        
        return vo;
    }
    
    /**
     * 转换为VO对象
     */
    private EmployeeSalaryVO convertToVO(EmployeeSalary employeeSalary) {
        EmployeeSalaryVO vo = new EmployeeSalaryVO();
        BeanUtils.copyProperties(employeeSalary, vo);
        
        // 查询员工信息
        Employee employee = employeeMapper.selectById(employeeSalary.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeNo(employee.getEmployeeNo());
            vo.setEmployeeName(employee.getName());
        }
        
        // 查询薪资结构信息
        SalaryStructure structure = salaryStructureMapper.selectById(employeeSalary.getStructureId());
        if (structure != null) {
            vo.setStructureCode(structure.getStructureCode());
            vo.setStructureName(structure.getStructureName());
        }
        
        // 设置状态描述
        vo.setStatusDesc(STATUS_MAP.getOrDefault(employeeSalary.getStatus(), employeeSalary.getStatus()));
        
        return vo;
    }
}
