package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.domain.dto.EmployeeCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeQueryDTO;
import com.cloudflow.hr.domain.dto.EmployeeUpdateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactCreateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactUpdateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.EmergencyContact;
import com.cloudflow.hr.domain.entity.LeaveApplication;
import com.cloudflow.hr.domain.entity.LeaveQuota;
import com.cloudflow.hr.domain.entity.OvertimeApplication;
import com.cloudflow.hr.domain.vo.EmployeeVO;
import com.cloudflow.hr.domain.vo.EmergencyContactVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmergencyContactMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.LeaveApplicationMapper;
import com.cloudflow.hr.mapper.LeaveQuotaMapper;
import com.cloudflow.hr.mapper.OvertimeApplicationMapper;
import com.cloudflow.hr.service.EmployeeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeServiceImpl implements EmployeeService {

    private final EmployeeMapper employeeMapper;
    private final AuthServiceClient authServiceClient;
    private final EmergencyContactMapper emergencyContactMapper;
    private final LeaveApplicationMapper leaveApplicationMapper;
    private final LeaveQuotaMapper leaveQuotaMapper;
    private final OvertimeApplicationMapper overtimeApplicationMapper;
    private final EmployeeUserSyncService employeeUserSyncService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createEmployee(EmployeeCreateDTO dto) {
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<Employee> wrapper = Wrappers.lambdaQuery(Employee.class);
        wrapper.eq(Employee::getTenantId, tenantId)
                .eq(Employee::getEmployeeNo, dto.getEmployeeNo());
        if (employeeMapper.selectCount(wrapper) > 0) {
            throw HrBusinessException.duplicateEmployeeNo(dto.getEmployeeNo());
        }

        if (dto.getDeptId() != null) {
            validateDeptId(dto.getDeptId());
        }
        if (dto.getPostId() != null) {
            validatePostId(dto.getPostId());
        }
        validateHireDate(dto.getEmployeeStatus(), dto.getHireDate());
        employeeUserSyncService.validateUserBindable(tenantId, dto.getUserId(), null);

        Employee employee = new Employee();
        BeanUtils.copyProperties(dto, employee);
        employee.setTenantId(tenantId);
        employeeMapper.insert(employee);
        employeeUserSyncService.syncLinkedUser(employee);
        return employee.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateEmployee(Long id, EmployeeUpdateDTO dto) {
        Employee employee = employeeMapper.selectById(id);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(id);
        }

        if (dto.getDeptId() != null) {
            validateDeptId(dto.getDeptId());
        }
        if (dto.getPostId() != null) {
            validatePostId(dto.getPostId());
        }
        String targetEmployeeStatus = dto.getEmployeeStatus() != null ? dto.getEmployeeStatus() : employee.getEmployeeStatus();
        LocalDate targetHireDate = dto.getHireDate() != null ? dto.getHireDate() : employee.getHireDate();
        validateHireDate(targetEmployeeStatus, targetHireDate);
        if (dto.getUserId() != null) {
            employeeUserSyncService.validateUserBindable(employee.getTenantId(), dto.getUserId(), id);
        }

        LambdaUpdateWrapper<Employee> updateWrapper = Wrappers.lambdaUpdate(Employee.class);
        updateWrapper.eq(Employee::getId, id)
                .set(Employee::getName, dto.getName())
                .set(Employee::getGender, dto.getGender())
                .set(Employee::getBirthDate, dto.getBirthDate())
                .set(Employee::getPhone, dto.getPhone())
                .set(Employee::getEmail, dto.getEmail())
                .set(Employee::getDeptId, dto.getDeptId())
                .set(Employee::getPostId, dto.getPostId())
                .set(Employee::getEmployeeType, dto.getEmployeeType())
                .set(Employee::getEmployeeStatus, dto.getEmployeeStatus())
                .set(Employee::getHireDate, dto.getHireDate())
                .set(Employee::getRegularDate, dto.getRegularDate())
                .set(Employee::getResignDate, dto.getResignDate())
                .set(dto.getUserId() != null, Employee::getUserId, dto.getUserId())
                .set(Employee::getUpdateTime, LocalDateTime.now());
        employeeMapper.update(null, updateWrapper);
        employeeUserSyncService.syncLinkedUser(employeeMapper.selectById(id));
    }

    private void validateHireDate(String employeeStatus, LocalDate hireDate) {
        if (employeeStatus == null) {
            return;
        }
        if (hireDate == null) {
            throw new HrBusinessException("Hire date is required for status " + employeeStatus);
        }
    }

    @Override
    public EmployeeVO getEmployee(Long id) {
        Employee employee = employeeMapper.selectById(id);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(id);
        }
        return toEmployeeVO(employee);
    }

    @Override
    public EmployeeVO getCurrentEmployee() {
        return toEmployeeVO(getCurrentEmployeeEntity());
    }

    @Override
    public List<EmployeeVO> listEmployees(EmployeeQueryDTO query) {
        if (!canManageEmployeeData()) {
            return List.of(toEmployeeVO(getCurrentEmployeeEntity()));
        }

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
        if (query.getEmployeeType() != null && !query.getEmployeeType().isEmpty()) {
            wrapper.eq(Employee::getEmployeeType, query.getEmployeeType());
        }
        if (query.getEmployeeStatus() != null && !query.getEmployeeStatus().isEmpty()) {
            wrapper.eq(Employee::getEmployeeStatus, query.getEmployeeStatus());
        }

        List<EmployeeVO> voList = new ArrayList<>();
        for (Employee employee : employeeMapper.selectList(wrapper)) {
            voList.add(toEmployeeVO(employee));
        }
        return voList;
    }

    private boolean canManageEmployeeData() {
        if (SecurityUtils.isAdmin()) {
            return true;
        }
        Set<String> roles = UserContext.getRoles();
        if (roles != null) {
            for (String role : roles) {
                if ("HR".equalsIgnoreCase(String.valueOf(role).trim())) {
                    return true;
                }
            }
        }
        return false;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteEmployee(Long id) {
        Employee employee = employeeMapper.selectById(id);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(id);
        }
        if (!"RESIGNED".equals(employee.getEmployeeStatus())) {
            throw HrBusinessException.cannotDeleteActiveEmployee(id);
        }

        ensureEmployeeHasNoRelatedRecords(id);
        employeeUserSyncService.disableLinkedUser(employee);
        employeeMapper.deleteById(id);
    }

    private void ensureEmployeeHasNoRelatedRecords(Long employeeId) {
        List<String> relatedRecords = new ArrayList<>();
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(emergencyContactMapper, EmergencyContact.class, EmergencyContact::getEmployeeId, employeeId),
                "emergency contact");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(leaveApplicationMapper, LeaveApplication.class, LeaveApplication::getEmployeeId, employeeId),
                "leave application");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(leaveQuotaMapper, LeaveQuota.class, LeaveQuota::getEmployeeId, employeeId),
                "leave quota");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(overtimeApplicationMapper, OvertimeApplication.class, OvertimeApplication::getEmployeeId, employeeId),
                "overtime application");

        if (!relatedRecords.isEmpty()) {
            throw HrBusinessException.employeeHasRelatedRecords(employeeId, relatedRecords);
        }
    }

    private void addRelatedRecordIfExists(List<String> relatedRecords, long count, String recordName) {
        if (count > 0) {
            relatedRecords.add(recordName);
        }
    }

    private <T> long countByEmployeeId(BaseMapper<T> mapper,
                                       Class<T> entityClass,
                                       SFunction<T, Long> employeeIdGetter,
                                       Long employeeId) {
        LambdaQueryWrapper<T> wrapper = Wrappers.lambdaQuery(entityClass);
        wrapper.eq(employeeIdGetter, employeeId);
        Long count = mapper.selectCount(wrapper);
        return count == null ? 0L : count;
    }

    private Employee getCurrentEmployeeEntity() {
        Long tenantId = SecurityUtils.getTenantId();
        Long userId = SecurityUtils.getUserId();
        if (userId == null) {
            throw new HrBusinessException("Current user is not logged in");
        }

        LambdaQueryWrapper<Employee> wrapper = Wrappers.lambdaQuery(Employee.class);
        wrapper.eq(Employee::getTenantId, tenantId)
                .eq(Employee::getUserId, userId);
        Employee employee = employeeMapper.selectOne(wrapper);
        if (employee == null) {
            throw new HrBusinessException("Current user is not bound to an HR employee profile");
        }
        return employee;
    }

    private EmployeeVO toEmployeeVO(Employee employee) {
        EmployeeVO vo = new EmployeeVO();
        BeanUtils.copyProperties(employee, vo);

        if (employee.getDeptId() != null) {
            try {
                R<DeptVO> deptResult = authServiceClient.getDeptById(employee.getDeptId());
                if (deptResult != null && deptResult.isSuccess() && deptResult.getData() != null) {
                    vo.setDeptName(deptResult.getData().getDeptName());
                }
            } catch (Exception e) {
                log.error("Failed to load department {}", employee.getDeptId(), e);
            }
        }

        if (employee.getPostId() != null) {
            try {
                R<PostVO> postResult = authServiceClient.getPostById(employee.getPostId());
                if (postResult != null && postResult.isSuccess() && postResult.getData() != null) {
                    vo.setPostName(postResult.getData().getPostName());
                }
            } catch (Exception e) {
                log.error("Failed to load post {}", employee.getPostId(), e);
            }
        }

        return vo;
    }

    private void validateDeptId(Long deptId) {
        try {
            R<DeptVO> result = authServiceClient.getDeptById(deptId);
            DeptVO dept = result == null ? null : result.getData();
            if (result == null || !result.isSuccess() || dept == null
                    || dept.getDeptId() == null || !deptId.equals(dept.getDeptId())) {
                throw HrBusinessException.invalidDeptOrPost("DEPT", deptId);
            }
        } catch (Exception e) {
            log.error("Invalid department id {}", deptId, e);
            throw HrBusinessException.invalidDeptOrPost("DEPT", deptId);
        }
    }

    private void validatePostId(Long postId) {
        try {
            R<PostVO> result = authServiceClient.getPostById(postId);
            PostVO post = result == null ? null : result.getData();
            if (result == null || !result.isSuccess() || post == null
                    || post.getPostId() == null || !postId.equals(post.getPostId())) {
                throw HrBusinessException.invalidDeptOrPost("POST", postId);
            }
        } catch (Exception e) {
            log.error("Invalid post id {}", postId, e);
            throw HrBusinessException.invalidDeptOrPost("POST", postId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long addEmergencyContact(EmergencyContactCreateDTO dto) {
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(dto.getEmployeeId());
        }

        EmergencyContact contact = new EmergencyContact();
        BeanUtils.copyProperties(dto, contact);
        contact.setTenantId(SecurityUtils.getTenantId());
        emergencyContactMapper.insert(contact);
        return contact.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateEmergencyContact(Long id, EmergencyContactUpdateDTO dto) {
        EmergencyContact contact = emergencyContactMapper.selectById(id);
        if (contact == null) {
            throw HrBusinessException.emergencyContactNotFound(id);
        }

        LambdaUpdateWrapper<EmergencyContact> updateWrapper = Wrappers.lambdaUpdate(EmergencyContact.class);
        updateWrapper.eq(EmergencyContact::getId, id)
                .set(EmergencyContact::getContactName, dto.getContactName())
                .set(EmergencyContact::getRelationship, dto.getRelationship())
                .set(EmergencyContact::getPhone, dto.getPhone())
                .set(EmergencyContact::getAddress, dto.getAddress())
                .set(EmergencyContact::getPriority, dto.getPriority())
                .set(EmergencyContact::getUpdateTime, LocalDateTime.now());
        emergencyContactMapper.update(null, updateWrapper);
    }

    @Override
    public List<EmergencyContactVO> listEmergencyContacts(Long employeeId) {
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(employeeId);
        }

        LambdaQueryWrapper<EmergencyContact> wrapper = Wrappers.lambdaQuery(EmergencyContact.class);
        wrapper.eq(EmergencyContact::getTenantId, SecurityUtils.getTenantId())
                .eq(EmergencyContact::getEmployeeId, employeeId)
                .orderByAsc(EmergencyContact::getPriority)
                .orderByDesc(EmergencyContact::getCreateTime);
        return convertContactsToVOList(emergencyContactMapper.selectList(wrapper), employee);
    }

    @Override
    public EmergencyContactVO getEmergencyContact(Long id) {
        EmergencyContact contact = emergencyContactMapper.selectById(id);
        if (contact == null) {
            throw HrBusinessException.emergencyContactNotFound(id);
        }

        Employee employee = employeeMapper.selectById(contact.getEmployeeId());
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(contact.getEmployeeId());
        }
        return convertContactToVO(contact, employee);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteEmergencyContact(Long id) {
        EmergencyContact contact = emergencyContactMapper.selectById(id);
        if (contact == null) {
            throw HrBusinessException.emergencyContactNotFound(id);
        }
        emergencyContactMapper.deleteById(id);
    }

    private List<EmergencyContactVO> convertContactsToVOList(List<EmergencyContact> contacts, Employee employee) {
        List<EmergencyContactVO> voList = new ArrayList<>();
        for (EmergencyContact contact : contacts) {
            voList.add(convertContactToVO(contact, employee));
        }
        return voList;
    }

    private EmergencyContactVO convertContactToVO(EmergencyContact contact, Employee employee) {
        EmergencyContactVO vo = new EmergencyContactVO();
        BeanUtils.copyProperties(contact, vo);
        vo.setEmployeeName(employee.getName());
        vo.setEmployeeNo(employee.getEmployeeNo());
        vo.setRelationshipName(getRelationshipName(contact.getRelationship()));
        return vo;
    }

    private String getRelationshipName(String relationship) {
        if (relationship == null) {
            return "";
        }
        return switch (relationship) {
            case "SPOUSE" -> "Spouse";
            case "PARENT" -> "Parent";
            case "SIBLING" -> "Sibling";
            case "CHILD" -> "Child";
            case "OTHER" -> "Other";
            default -> relationship;
        };
    }
}
