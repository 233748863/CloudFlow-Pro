package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.domain.dto.EmployeeCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeQueryDTO;
import com.cloudflow.hr.domain.dto.EmployeeUpdateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.vo.EmployeeVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.service.EmployeeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 员工档案服务实现类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeServiceImpl implements EmployeeService {
    
    private final EmployeeMapper employeeMapper;
    private final PositionMapper positionMapper;
    private final AuthServiceClient authServiceClient;
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createEmployee(EmployeeCreateDTO dto) {
        log.info("创建员工档案，工号：{}", dto.getEmployeeNo());
        
        // 1. 验证工号唯一性
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<Employee> wrapper = Wrappers.lambdaQuery(Employee.class);
        wrapper.eq(Employee::getTenantId, tenantId)
               .eq(Employee::getEmployeeNo, dto.getEmployeeNo());
        
        if (employeeMapper.selectCount(wrapper) > 0) {
            throw HrBusinessException.duplicateEmployeeNo(dto.getEmployeeNo());
        }
        
        // 2. 验证部门ID和岗位ID（如果提供）
        if (dto.getDeptId() != null) {
            validateDeptId(dto.getDeptId());
        }
        
        if (dto.getPostId() != null) {
            validatePostId(dto.getPostId());
        }
        
        // 3. 验证职位ID（如果提供）
        if (dto.getPositionId() != null) {
            Position position = positionMapper.selectById(dto.getPositionId());
            if (position == null) {
                throw HrBusinessException.positionNotFound(dto.getPositionId());
            }
        }
        
        // 4. 创建员工记录
        Employee employee = new Employee();
        BeanUtils.copyProperties(dto, employee);
        employee.setTenantId(tenantId);
        
        employeeMapper.insert(employee);
        
        log.info("员工档案创建成功，员工ID：{}，工号：{}", employee.getId(), employee.getEmployeeNo());
        return employee.getId();
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateEmployee(Long id, EmployeeUpdateDTO dto) {
        log.info("更新员工档案，员工ID：{}", id);
        
        // 1. 查询员工
        Employee employee = employeeMapper.selectById(id);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(id);
        }
        
        // 2. 验证部门ID和岗位ID（如果提供）
        if (dto.getDeptId() != null) {
            validateDeptId(dto.getDeptId());
        }
        
        if (dto.getPostId() != null) {
            validatePostId(dto.getPostId());
        }
        
        // 3. 验证职位ID（如果提供）
        if (dto.getPositionId() != null) {
            Position position = positionMapper.selectById(dto.getPositionId());
            if (position == null) {
                throw HrBusinessException.positionNotFound(dto.getPositionId());
            }
        }
        
        // 4. 更新员工信息
        BeanUtils.copyProperties(dto, employee);
        employeeMapper.updateById(employee);
        
        log.info("员工档案更新成功，员工ID：{}", id);
    }
    
    @Override
    public EmployeeVO getEmployee(Long id) {
        log.info("查询员工详情，员工ID：{}", id);
        
        // 1. 查询员工
        Employee employee = employeeMapper.selectById(id);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(id);
        }
        
        // 2. 转换为VO
        EmployeeVO vo = new EmployeeVO();
        BeanUtils.copyProperties(employee, vo);
        
        // 3. 查询部门名称
        if (employee.getDeptId() != null) {
            try {
                R<DeptVO> deptResult = authServiceClient.getDeptById(employee.getDeptId());
                if (deptResult != null && deptResult.isSuccess() && deptResult.getData() != null) {
                    vo.setDeptName(deptResult.getData().getDeptName());
                }
            } catch (Exception e) {
                log.error("查询部门信息失败，部门ID：{}", employee.getDeptId(), e);
            }
        }
        
        // 4. 查询岗位名称
        if (employee.getPostId() != null) {
            try {
                R<PostVO> postResult = authServiceClient.getPostById(employee.getPostId());
                if (postResult != null && postResult.isSuccess() && postResult.getData() != null) {
                    vo.setPostName(postResult.getData().getPostName());
                }
            } catch (Exception e) {
                log.error("查询岗位信息失败，岗位ID：{}", employee.getPostId(), e);
            }
        }
        
        // 5. 查询职位名称
        if (employee.getPositionId() != null) {
            Position position = positionMapper.selectById(employee.getPositionId());
            if (position != null) {
                vo.setPositionName(position.getPositionName());
            }
        }
        
        return vo;
    }
    
    @Override
    public List<EmployeeVO> listEmployees(EmployeeQueryDTO query) {
        log.info("查询员工列表，查询条件：{}", query);
        
        // 1. 构建查询条件
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<Employee> wrapper = Wrappers.lambdaQuery(Employee.class);
        wrapper.eq(Employee::getTenantId, tenantId);
        
        if (query.getEmployeeNo() != null && !query.getEmployeeNo().isEmpty()) {
            wrapper.like(Employee::getEmployeeNo, query.getEmployeeNo());
        }
        
        if (query.getName() != null && !query.getName().isEmpty()) {
            wrapper.like(Employee::getName, query.getName());
        }
        
        if (query.getDeptId() != null) {
            wrapper.eq(Employee::getDeptId, query.getDeptId());
        }
        
        if (query.getPostId() != null) {
            wrapper.eq(Employee::getPostId, query.getPostId());
        }
        
        if (query.getPositionId() != null) {
            wrapper.eq(Employee::getPositionId, query.getPositionId());
        }
        
        if (query.getEmployeeType() != null && !query.getEmployeeType().isEmpty()) {
            wrapper.eq(Employee::getEmployeeType, query.getEmployeeType());
        }
        
        if (query.getEmployeeStatus() != null && !query.getEmployeeStatus().isEmpty()) {
            wrapper.eq(Employee::getEmployeeStatus, query.getEmployeeStatus());
        }
        
        // 2. 查询员工列表
        List<Employee> employees = employeeMapper.selectList(wrapper);
        
        // 3. 转换为VO列表
        List<EmployeeVO> voList = new ArrayList<>();
        for (Employee employee : employees) {
            EmployeeVO vo = new EmployeeVO();
            BeanUtils.copyProperties(employee, vo);
            
            // 查询部门名称
            if (employee.getDeptId() != null) {
                try {
                    R<DeptVO> deptResult = authServiceClient.getDeptById(employee.getDeptId());
                    if (deptResult != null && deptResult.isSuccess() && deptResult.getData() != null) {
                        vo.setDeptName(deptResult.getData().getDeptName());
                    }
                } catch (Exception e) {
                    log.error("查询部门信息失败，部门ID：{}", employee.getDeptId(), e);
                }
            }
            
            // 查询岗位名称
            if (employee.getPostId() != null) {
                try {
                    R<PostVO> postResult = authServiceClient.getPostById(employee.getPostId());
                    if (postResult != null && postResult.isSuccess() && postResult.getData() != null) {
                        vo.setPostName(postResult.getData().getPostName());
                    }
                } catch (Exception e) {
                    log.error("查询岗位信息失败，岗位ID：{}", employee.getPostId(), e);
                }
            }
            
            // 查询职位名称
            if (employee.getPositionId() != null) {
                Position position = positionMapper.selectById(employee.getPositionId());
                if (position != null) {
                    vo.setPositionName(position.getPositionName());
                }
            }
            
            voList.add(vo);
        }
        
        return voList;
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteEmployee(Long id) {
        log.info("删除员工档案，员工ID：{}", id);
        
        // 1. 查询员工
        Employee employee = employeeMapper.selectById(id);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(id);
        }
        
        // 2. 验证员工状态（只能删除待入职或已离职的员工）
        if (!"PENDING".equals(employee.getEmployeeStatus()) && 
            !"RESIGNED".equals(employee.getEmployeeStatus())) {
            throw HrBusinessException.cannotDeleteActiveEmployee(id);
        }
        
        // 3. 删除员工
        employeeMapper.deleteById(id);
        
        log.info("员工档案删除成功，员工ID：{}", id);
    }
    
    /**
     * 验证部门ID是否有效
     */
    private void validateDeptId(Long deptId) {
        try {
            R<DeptVO> result = authServiceClient.getDeptById(deptId);
            if (result == null || !result.isSuccess() || result.getData() == null) {
                throw HrBusinessException.invalidDeptOrPost("DEPT", deptId);
            }
        } catch (Exception e) {
            log.error("验证部门ID失败，部门ID：{}", deptId, e);
            throw HrBusinessException.invalidDeptOrPost("DEPT", deptId);
        }
    }
    
    /**
     * 验证岗位ID是否有效
     */
    private void validatePostId(Long postId) {
        try {
            R<PostVO> result = authServiceClient.getPostById(postId);
            if (result == null || !result.isSuccess() || result.getData() == null) {
                throw HrBusinessException.invalidDeptOrPost("POST", postId);
            }
        } catch (Exception e) {
            log.error("验证岗位ID失败，岗位ID：{}", postId, e);
            throw HrBusinessException.invalidDeptOrPost("POST", postId);
        }
    }
}
