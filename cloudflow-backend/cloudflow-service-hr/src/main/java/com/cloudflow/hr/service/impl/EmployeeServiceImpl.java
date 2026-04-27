package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.domain.dto.EmployeeContractCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeContractUpdateDTO;
import com.cloudflow.hr.domain.dto.EmployeeCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeDocumentCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeDocumentUpdateDTO;
import com.cloudflow.hr.domain.dto.EmployeeQueryDTO;
import com.cloudflow.hr.domain.dto.EmployeeUpdateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactCreateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactUpdateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.EmployeeContract;
import com.cloudflow.hr.domain.entity.EmployeeContractAttachment;
import com.cloudflow.hr.domain.entity.EmployeeDocument;
import com.cloudflow.hr.domain.entity.EmployeeDocumentAttachment;
import com.cloudflow.hr.domain.entity.EmergencyContact;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.vo.EmployeeContractVO;
import com.cloudflow.hr.domain.vo.EmployeeDocumentVO;
import com.cloudflow.hr.domain.vo.EmployeeVO;
import com.cloudflow.hr.domain.vo.EmergencyContactVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.cloudflow.hr.service.EmployeeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

    private static final int MAX_ARCHIVE_ATTACHMENT_COUNT = 5;
    
    private final EmployeeMapper employeeMapper;
    private final PositionMapper positionMapper;
    private final AuthServiceClient authServiceClient;
    private final EmployeeContractMapper employeeContractMapper;
    private final EmployeeContractAttachmentMapper employeeContractAttachmentMapper;
    private final EmployeeDocumentMapper employeeDocumentMapper;
    private final EmployeeDocumentAttachmentMapper employeeDocumentAttachmentMapper;
    private final EmergencyContactMapper emergencyContactMapper;
    private final EmployeeSalaryMapper employeeSalaryMapper;
    private final EmployeeInsuranceMapper employeeInsuranceMapper;
    private final EmployeeTaxDeductionMapper employeeTaxDeductionMapper;
    private final AttendanceRecordMapper attendanceRecordMapper;
    private final AttendanceMonthlyMapper attendanceMonthlyMapper;
    private final LeaveApplicationMapper leaveApplicationMapper;
    private final LeaveQuotaMapper leaveQuotaMapper;
    private final OvertimeApplicationMapper overtimeApplicationMapper;
    private final SalaryAdjustmentMapper salaryAdjustmentMapper;
    private final OnboardingApplicationMapper onboardingApplicationMapper;
    private final ProbationConfirmationMapper probationConfirmationMapper;
    private final ResignationApplicationMapper resignationApplicationMapper;
    private final TransferApplicationMapper transferApplicationMapper;
    private final ReportingLineMapper reportingLineMapper;
    private final EmployeeUserSyncService employeeUserSyncService;
    
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
        validateHireDate(dto.getEmployeeStatus(), dto.getHireDate());
        employeeUserSyncService.validateUserBindable(tenantId, dto.getUserId(), null);
        
        // 4. 创建员工记录
        Employee employee = new Employee();
        BeanUtils.copyProperties(dto, employee);
        employee.setTenantId(tenantId);
        
        employeeMapper.insert(employee);
        employeeUserSyncService.syncLinkedUser(employee);
        
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

        String targetEmployeeStatus = dto.getEmployeeStatus() != null ? dto.getEmployeeStatus() : employee.getEmployeeStatus();
        LocalDate targetHireDate = dto.getHireDate() != null ? dto.getHireDate() : employee.getHireDate();
        validateHireDate(targetEmployeeStatus, targetHireDate);
        if (dto.getUserId() != null) {
            employeeUserSyncService.validateUserBindable(employee.getTenantId(), dto.getUserId(), id);
        }
        
        // 4. 使用显式 set 更新，确保前端把字段清空为 null 时能真实落库，同时刷新更新时间。
        LambdaUpdateWrapper<Employee> updateWrapper = Wrappers.lambdaUpdate(Employee.class);
        updateWrapper.eq(Employee::getId, id)
                .set(Employee::getName, dto.getName())
                .set(Employee::getGender, dto.getGender())
                .set(Employee::getBirthDate, dto.getBirthDate())
                .set(Employee::getPhone, dto.getPhone())
                .set(Employee::getEmail, dto.getEmail())
                .set(Employee::getDeptId, dto.getDeptId())
                .set(Employee::getPostId, dto.getPostId())
                .set(Employee::getPositionId, dto.getPositionId())
                .set(Employee::getEmployeeType, dto.getEmployeeType())
                .set(Employee::getEmployeeStatus, dto.getEmployeeStatus())
                .set(Employee::getHireDate, dto.getHireDate())
                .set(Employee::getRegularDate, dto.getRegularDate())
                .set(Employee::getResignDate, dto.getResignDate())
                .set(dto.getUserId() != null, Employee::getUserId, dto.getUserId())
                .set(Employee::getUpdateTime, LocalDateTime.now());
        employeeMapper.update(null, updateWrapper);
        employeeUserSyncService.syncLinkedUser(employeeMapper.selectById(id));
        
        log.info("员工档案更新成功，员工ID：{}", id);
    }

    /**
     * 除待入职外，其余员工状态都必须具备入职日期，否则年假、工龄等规则无法计算。
     */
    private void validateHireDate(String employeeStatus, LocalDate hireDate) {
        if (employeeStatus == null || "PENDING".equals(employeeStatus)) {
            return;
        }
        if (hireDate == null) {
            throw new HrBusinessException("员工状态为[" + employeeStatus + "]时，入职日期不能为空");
        }
    }
    
    @Override
    public EmployeeVO getEmployee(Long id) {
        log.info("查询员工详情，员工ID：{}", id);
        
        // 1. 查询员工
        Employee employee = employeeMapper.selectById(id);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(id);
        }

        return toEmployeeVO(employee);
    }

    @Override
    public EmployeeVO getCurrentEmployee() {
        log.info("查询当前登录员工档案");
        return toEmployeeVO(getCurrentEmployeeEntity());
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
            voList.add(toEmployeeVO(employee));
        }
        
        return voList;
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteEmployee(Long id) {
        log.info("删除员工档案，员工ID：{}", id);
        
        Employee employee = employeeMapper.selectById(id);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(id);
        }
        
        if (!"PENDING".equals(employee.getEmployeeStatus()) && 
            !"RESIGNED".equals(employee.getEmployeeStatus())) {
            throw HrBusinessException.cannotDeleteActiveEmployee(id);
        }
        
        ensureEmployeeHasNoRelatedRecords(id);
        employeeUserSyncService.disableLinkedUser(employee);
        employeeMapper.deleteById(id);
        
        log.info("员工档案删除成功，员工ID：{}", id);
    }

    private void ensureEmployeeHasNoRelatedRecords(Long employeeId) {
        List<String> relatedRecords = new ArrayList<>();

        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(employeeContractMapper, EmployeeContract.class, EmployeeContract::getEmployeeId, employeeId),
                "合同");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(employeeDocumentMapper, EmployeeDocument.class, EmployeeDocument::getEmployeeId, employeeId),
                "证件");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(emergencyContactMapper, EmergencyContact.class, EmergencyContact::getEmployeeId, employeeId),
                "紧急联系人");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(employeeSalaryMapper, com.cloudflow.hr.domain.entity.EmployeeSalary.class,
                        com.cloudflow.hr.domain.entity.EmployeeSalary::getEmployeeId, employeeId),
                "员工薪资");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(employeeInsuranceMapper, com.cloudflow.hr.domain.entity.EmployeeInsurance.class,
                        com.cloudflow.hr.domain.entity.EmployeeInsurance::getEmployeeId, employeeId),
                "员工社保公积金");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(employeeTaxDeductionMapper, com.cloudflow.hr.domain.entity.EmployeeTaxDeduction.class,
                        com.cloudflow.hr.domain.entity.EmployeeTaxDeduction::getEmployeeId, employeeId),
                "专项附加扣除");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(attendanceRecordMapper, com.cloudflow.hr.domain.entity.AttendanceRecord.class,
                        com.cloudflow.hr.domain.entity.AttendanceRecord::getEmployeeId, employeeId),
                "考勤记录");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(attendanceMonthlyMapper, com.cloudflow.hr.domain.entity.AttendanceMonthly.class,
                        com.cloudflow.hr.domain.entity.AttendanceMonthly::getEmployeeId, employeeId),
                "月度考勤汇总");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(leaveApplicationMapper, com.cloudflow.hr.domain.entity.LeaveApplication.class,
                        com.cloudflow.hr.domain.entity.LeaveApplication::getEmployeeId, employeeId),
                "请假申请");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(leaveQuotaMapper, com.cloudflow.hr.domain.entity.LeaveQuota.class,
                        com.cloudflow.hr.domain.entity.LeaveQuota::getEmployeeId, employeeId),
                "假期额度");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(overtimeApplicationMapper, com.cloudflow.hr.domain.entity.OvertimeApplication.class,
                        com.cloudflow.hr.domain.entity.OvertimeApplication::getEmployeeId, employeeId),
                "加班申请");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(salaryAdjustmentMapper, com.cloudflow.hr.domain.entity.SalaryAdjustment.class,
                        com.cloudflow.hr.domain.entity.SalaryAdjustment::getEmployeeId, employeeId),
                "调薪申请");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(onboardingApplicationMapper, com.cloudflow.hr.domain.entity.OnboardingApplication.class,
                        com.cloudflow.hr.domain.entity.OnboardingApplication::getEmployeeId, employeeId),
                "入职申请");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(probationConfirmationMapper, com.cloudflow.hr.domain.entity.ProbationConfirmation.class,
                        com.cloudflow.hr.domain.entity.ProbationConfirmation::getEmployeeId, employeeId),
                "转正申请");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(resignationApplicationMapper, com.cloudflow.hr.domain.entity.ResignationApplication.class,
                        com.cloudflow.hr.domain.entity.ResignationApplication::getEmployeeId, employeeId),
                "离职申请");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(transferApplicationMapper, com.cloudflow.hr.domain.entity.TransferApplication.class,
                        com.cloudflow.hr.domain.entity.TransferApplication::getEmployeeId, employeeId),
                "调动申请");
        addRelatedRecordIfExists(relatedRecords,
                countByEmployeeId(reportingLineMapper, com.cloudflow.hr.domain.entity.ReportingLine.class,
                        com.cloudflow.hr.domain.entity.ReportingLine::getEmployeeId, employeeId),
                "汇报关系");

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
            throw new HrBusinessException("未找到当前登录用户，无法定位员工档案");
        }

        LambdaQueryWrapper<Employee> wrapper = Wrappers.lambdaQuery(Employee.class);
        wrapper.eq(Employee::getTenantId, tenantId)
                .eq(Employee::getUserId, userId);
        Employee employee = employeeMapper.selectOne(wrapper);
        if (employee == null) {
            throw new HrBusinessException("当前登录用户未关联 HR 员工档案");
        }
        return employee;
    }

    private EmployeeVO toEmployeeVO(Employee employee) {
        EmployeeVO vo = new EmployeeVO();
        BeanUtils.copyProperties(employee, vo);

        // 补齐展示所需的部门、岗位、职位名称，避免前端再次额外请求。
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

        if (employee.getPositionId() != null) {
            Position position = positionMapper.selectById(employee.getPositionId());
            if (position != null) {
                vo.setPositionName(position.getPositionName());
            }
        }

        return vo;
    }
    
    /**
     * 验证部门ID是否有效
     */
    private void validateDeptId(Long deptId) {
        try {
            R<DeptVO> result = authServiceClient.getDeptById(deptId);
            DeptVO dept = result == null ? null : result.getData();
            if (result == null || !result.isSuccess() || dept == null
                    || dept.getDeptId() == null || !deptId.equals(dept.getDeptId())) {
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
            PostVO post = result == null ? null : result.getData();
            if (result == null || !result.isSuccess() || post == null
                    || post.getPostId() == null || !postId.equals(post.getPostId())) {
                throw HrBusinessException.invalidDeptOrPost("POST", postId);
            }
        } catch (Exception e) {
            log.error("验证岗位ID失败，岗位ID：{}", postId, e);
            throw HrBusinessException.invalidDeptOrPost("POST", postId);
        }
    }
    
    // ==================== 合同管理实现 ====================
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long addContract(EmployeeContractCreateDTO dto) {
        log.info("添加员工合同，员工ID：{}，合同编号：{}", dto.getEmployeeId(), dto.getContractNo());
        
        // 1. 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(dto.getEmployeeId());
        }
        
        // 2. 验证合同编号唯一性
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<EmployeeContract> wrapper = Wrappers.lambdaQuery(EmployeeContract.class);
        wrapper.eq(EmployeeContract::getTenantId, tenantId)
               .eq(EmployeeContract::getContractNo, dto.getContractNo());
        
        if (employeeContractMapper.selectCount(wrapper) > 0) {
            throw HrBusinessException.duplicateContractNo(dto.getContractNo());
        }

        List<String> attachmentUrls = normalizeAttachmentUrls(
                dto.getAttachmentUrls(),
                "员工合同附件"
        );
        
        // 3. 创建合同记录
        EmployeeContract contract = new EmployeeContract();
        BeanUtils.copyProperties(dto, contract);
        contract.setTenantId(tenantId);
        
        // 如果未指定状态，默认为草稿
        if (contract.getStatus() == null || contract.getStatus().isEmpty()) {
            contract.setStatus("DRAFT");
        }
        
        employeeContractMapper.insert(contract);
        replaceContractAttachments(contract.getId(), tenantId, attachmentUrls);
        
        log.info("员工合同添加成功，合同ID：{}，合同编号：{}", contract.getId(), contract.getContractNo());
        return contract.getId();
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateContract(Long id, EmployeeContractUpdateDTO dto) {
        log.info("更新员工合同，合同ID：{}", id);
        
        // 1. 查询合同
        Long tenantId = SecurityUtils.getTenantId();
        EmployeeContract contract = employeeContractMapper.selectContractById(tenantId, id);
        if (contract == null) {
            throw HrBusinessException.contractNotFound(id);
        }
        
        // 2. 验证合同编号唯一性（如果修改了合同编号）
        if (dto.getContractNo() != null && !dto.getContractNo().equals(contract.getContractNo())) {
            LambdaQueryWrapper<EmployeeContract> wrapper = Wrappers.lambdaQuery(EmployeeContract.class);
            wrapper.eq(EmployeeContract::getTenantId, contract.getTenantId())
                   .eq(EmployeeContract::getContractNo, dto.getContractNo())
                   .ne(EmployeeContract::getId, id);
            
            if (employeeContractMapper.selectCount(wrapper) > 0) {
                throw HrBusinessException.duplicateContractNo(dto.getContractNo());
            }
        }

        List<String> attachmentUrls = normalizeAttachmentUrls(
                dto.getAttachmentUrls(),
                "员工合同附件"
        );
        
        // 3. 显式写入可空字段，保证附件地址、期限等字段可以被清空。
        LambdaUpdateWrapper<EmployeeContract> updateWrapper = Wrappers.lambdaUpdate(EmployeeContract.class);
        updateWrapper.eq(EmployeeContract::getId, id)
                .set(EmployeeContract::getContractType, dto.getContractType())
                .set(EmployeeContract::getContractNo, dto.getContractNo())
                .set(EmployeeContract::getSignDate, dto.getSignDate())
                .set(EmployeeContract::getStartDate, dto.getStartDate())
                .set(EmployeeContract::getEndDate, dto.getEndDate())
                .set(EmployeeContract::getDuration, dto.getDuration())
                .set(EmployeeContract::getStatus, dto.getStatus())
                .set(EmployeeContract::getUpdateTime, LocalDateTime.now());
        employeeContractMapper.update(null, updateWrapper);
        replaceContractAttachments(id, contract.getTenantId(), attachmentUrls);
        
        log.info("员工合同更新成功，合同ID：{}", id);
    }
    
    @Override
    public List<EmployeeContractVO> listContracts(Long employeeId) {
        log.info("查询员工的所有合同，员工ID：{}", employeeId);
        
        // 1. 验证员工是否存在
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(employeeId);
        }
        
        // 2. 查询合同列表
        Long tenantId = SecurityUtils.getTenantId();
        List<EmployeeContract> contracts = employeeContractMapper.selectContractsByEmployeeId(tenantId, employeeId);
        Map<Long, List<String>> attachmentUrlMap = getContractAttachmentUrlMap(contracts);
        
        // 3. 转换为VO列表
        return convertToVOList(contracts, employee, attachmentUrlMap);
    }
    
    @Override
    public List<EmployeeContractVO> listExpiringContracts(Integer days) {
        log.info("查询即将到期的合同，天数：{}", days);
        
        // 1. 查询即将到期的合同
        LocalDate currentDate = LocalDate.now();
        List<EmployeeContract> contracts = employeeContractMapper.selectExpiringContracts(days, currentDate);
        
        // 2. 批量查询员工信息
        Map<Long, Employee> employeeMap = new HashMap<>();
        for (EmployeeContract contract : contracts) {
            if (!employeeMap.containsKey(contract.getEmployeeId())) {
                Employee employee = employeeMapper.selectById(contract.getEmployeeId());
                if (employee != null) {
                    employeeMap.put(employee.getId(), employee);
                }
            }
        }
        
        // 3. 转换为VO列表
        Map<Long, List<String>> attachmentUrlMap = getContractAttachmentUrlMap(contracts);
        List<EmployeeContractVO> voList = new ArrayList<>();
        for (EmployeeContract contract : contracts) {
            Employee employee = employeeMap.get(contract.getEmployeeId());
            if (employee != null) {
                EmployeeContractVO vo = convertToVO(
                        contract,
                        employee,
                        attachmentUrlMap.get(contract.getId())
                );
                voList.add(vo);
            }
        }
        
        return voList;
    }
    
    @Override
    public EmployeeContractVO getContract(Long id) {
        log.info("查询合同详情，合同ID：{}", id);
        
        // 1. 查询合同
        Long tenantId = SecurityUtils.getTenantId();
        EmployeeContract contract = employeeContractMapper.selectContractById(tenantId, id);
        if (contract == null) {
            throw HrBusinessException.contractNotFound(id);
        }
        
        // 2. 查询员工信息
        Employee employee = employeeMapper.selectById(contract.getEmployeeId());
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(contract.getEmployeeId());
        }
        
        // 3. 转换为VO
        return convertToVO(contract, employee, getContractAttachmentUrls(contract));
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteContract(Long id) {
        log.info("删除员工合同，合同ID：{}", id);
        
        // 1. 查询合同
        Long tenantId = SecurityUtils.getTenantId();
        EmployeeContract contract = employeeContractMapper.selectContractById(tenantId, id);
        if (contract == null) {
            throw HrBusinessException.contractNotFound(id);
        }
        
        // 2. 验证合同状态（只能删除草稿状态的合同）
        if (!"DRAFT".equals(contract.getStatus())) {
            throw HrBusinessException.cannotDeleteActiveContract(id);
        }
        
        // 3. 删除合同
        deleteContractAttachments(List.of(id));
        employeeContractMapper.deleteById(id);
        
        log.info("员工合同删除成功，合同ID：{}", id);
    }
    
    /**
     * 转换合同列表为VO列表
     */
    private List<EmployeeContractVO> convertToVOList(
            List<EmployeeContract> contracts,
            Employee employee,
            Map<Long, List<String>> attachmentUrlMap
    ) {
        List<EmployeeContractVO> voList = new ArrayList<>();
        for (EmployeeContract contract : contracts) {
            EmployeeContractVO vo = convertToVO(
                    contract,
                    employee,
                    attachmentUrlMap.get(contract.getId())
            );
            voList.add(vo);
        }
        return voList;
    }
    
    /**
     * 转换合同为VO
     */
    private EmployeeContractVO convertToVO(
            EmployeeContract contract,
            Employee employee,
            List<String> attachmentUrls
    ) {
        EmployeeContractVO vo = new EmployeeContractVO();
        BeanUtils.copyProperties(contract, vo);
        List<String> normalizedAttachmentUrls = normalizeAttachmentUrls(
                attachmentUrls,
                "员工合同附件"
        );
        vo.setAttachmentUrls(normalizedAttachmentUrls);
        
        // 设置员工信息
        vo.setEmployeeName(employee.getName());
        vo.setEmployeeNo(employee.getEmployeeNo());
        
        // 设置合同类型名称
        vo.setContractTypeName(getContractTypeName(contract.getContractType()));
        
        // 设置状态名称
        vo.setStatusName(getContractStatusName(contract.getStatus()));
        
        // 计算剩余天数
        if (contract.getEndDate() != null) {
            LocalDate currentDate = LocalDate.now();
            long remainingDays = ChronoUnit.DAYS.between(currentDate, contract.getEndDate());
            vo.setRemainingDays(remainingDays);
        }
        
        return vo;
    }
    
    /**
     * 获取合同类型名称
     */
    private String getContractTypeName(String contractType) {
        if (contractType == null) {
            return "";
        }
        switch (contractType) {
            case "LABOR":
                return "劳动合同";
            case "SERVICE":
                return "劳务合同";
            case "INTERN":
                return "实习协议";
            default:
                return contractType;
        }
    }
    
    /**
     * 获取合同状态名称
     */
    private String getContractStatusName(String status) {
        if (status == null) {
            return "";
        }
        switch (status) {
            case "DRAFT":
                return "草稿";
            case "ACTIVE":
                return "生效中";
            case "EXPIRED":
                return "已过期";
            case "TERMINATED":
                return "已终止";
            default:
                return status;
        }
    }
    
    // ==================== 证件管理实现 ====================
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long addDocument(EmployeeDocumentCreateDTO dto) {
        log.info("添加员工证件，员工ID：{}，证件类型：{}", dto.getEmployeeId(), dto.getDocumentType());
        
        // 1. 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(dto.getEmployeeId());
        }
        
        // 2. 创建证件记录
        List<String> attachmentUrls = normalizeAttachmentUrls(
                dto.getAttachmentUrls(),
                "员工证件附件"
        );

        EmployeeDocument document = new EmployeeDocument();
        BeanUtils.copyProperties(dto, document);
        document.setTenantId(SecurityUtils.getTenantId());
        
        employeeDocumentMapper.insert(document);
        replaceDocumentAttachments(document.getId(), document.getTenantId(), attachmentUrls);
        
        log.info("员工证件添加成功，证件ID：{}", document.getId());
        return document.getId();
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateDocument(Long id, EmployeeDocumentUpdateDTO dto) {
        log.info("更新员工证件，证件ID：{}", id);
        
        // 1. 查询证件
        Long tenantId = SecurityUtils.getTenantId();
        EmployeeDocument document = employeeDocumentMapper.selectDocumentById(tenantId, id);
        if (document == null) {
            throw HrBusinessException.documentNotFound(id);
        }

        List<String> attachmentUrls = normalizeAttachmentUrls(
                dto.getAttachmentUrls(),
                "员工证件附件"
        );
        
        // 2. 显式写入可空字段，保证扫描件地址等信息可被清空。
        LambdaUpdateWrapper<EmployeeDocument> updateWrapper = Wrappers.lambdaUpdate(EmployeeDocument.class);
        updateWrapper.eq(EmployeeDocument::getId, id)
                .set(EmployeeDocument::getDocumentType, dto.getDocumentType())
                .set(EmployeeDocument::getDocumentNo, dto.getDocumentNo())
                .set(EmployeeDocument::getIssueDate, dto.getIssueDate())
                .set(EmployeeDocument::getExpiryDate, dto.getExpiryDate())
                .set(EmployeeDocument::getUpdateTime, LocalDateTime.now());
        employeeDocumentMapper.update(null, updateWrapper);
        replaceDocumentAttachments(id, document.getTenantId(), attachmentUrls);
        
        log.info("员工证件更新成功，证件ID：{}", id);
    }
    
    @Override
    public List<EmployeeDocumentVO> listDocuments(Long employeeId) {
        log.info("查询员工的所有证件，员工ID：{}", employeeId);
        
        // 1. 验证员工是否存在
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(employeeId);
        }
        
        // 2. 查询证件列表
        Long tenantId = SecurityUtils.getTenantId();
        List<EmployeeDocument> documents = employeeDocumentMapper.selectDocumentsByEmployeeId(tenantId, employeeId);
        Map<Long, List<String>> attachmentUrlMap = getDocumentAttachmentUrlMap(documents);
        
        // 3. 转换为VO列表
        return convertDocumentsToVOList(documents, employee, attachmentUrlMap);
    }
    
    @Override
    public EmployeeDocumentVO getDocument(Long id) {
        log.info("查询证件详情，证件ID：{}", id);
        
        // 1. 查询证件
        Long tenantId = SecurityUtils.getTenantId();
        EmployeeDocument document = employeeDocumentMapper.selectDocumentById(tenantId, id);
        if (document == null) {
            throw HrBusinessException.documentNotFound(id);
        }
        
        // 2. 查询员工信息
        Employee employee = employeeMapper.selectById(document.getEmployeeId());
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(document.getEmployeeId());
        }
        
        // 3. 转换为VO
        return convertDocumentToVO(document, employee, getDocumentAttachmentUrls(document));
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDocument(Long id) {
        log.info("删除员工证件，证件ID：{}", id);
        
        // 1. 查询证件
        Long tenantId = SecurityUtils.getTenantId();
        EmployeeDocument document = employeeDocumentMapper.selectDocumentById(tenantId, id);
        if (document == null) {
            throw HrBusinessException.documentNotFound(id);
        }
        
        // 2. 删除证件
        deleteDocumentAttachments(List.of(id));
        employeeDocumentMapper.deleteById(id);
        
        log.info("员工证件删除成功，证件ID：{}", id);
    }
    
    // ==================== 紧急联系人管理实现 ====================
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long addEmergencyContact(EmergencyContactCreateDTO dto) {
        log.info("添加紧急联系人，员工ID：{}，联系人姓名：{}", dto.getEmployeeId(), dto.getContactName());
        
        // 1. 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(dto.getEmployeeId());
        }
        
        // 2. 创建紧急联系人记录
        EmergencyContact contact = new EmergencyContact();
        BeanUtils.copyProperties(dto, contact);
        contact.setTenantId(SecurityUtils.getTenantId());
        
        emergencyContactMapper.insert(contact);
        
        log.info("紧急联系人添加成功，联系人ID：{}", contact.getId());
        return contact.getId();
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateEmergencyContact(Long id, EmergencyContactUpdateDTO dto) {
        log.info("更新紧急联系人，联系人ID：{}", id);
        
        // 1. 查询紧急联系人
        EmergencyContact contact = emergencyContactMapper.selectById(id);
        if (contact == null) {
            throw HrBusinessException.emergencyContactNotFound(id);
        }
        
        // 2. 显式写入可空字段，保证联系地址等辅助信息可以被清空。
        LambdaUpdateWrapper<EmergencyContact> updateWrapper = Wrappers.lambdaUpdate(EmergencyContact.class);
        updateWrapper.eq(EmergencyContact::getId, id)
                .set(EmergencyContact::getContactName, dto.getContactName())
                .set(EmergencyContact::getRelationship, dto.getRelationship())
                .set(EmergencyContact::getPhone, dto.getPhone())
                .set(EmergencyContact::getAddress, dto.getAddress())
                .set(EmergencyContact::getPriority, dto.getPriority())
                .set(EmergencyContact::getUpdateTime, LocalDateTime.now());
        emergencyContactMapper.update(null, updateWrapper);
        
        log.info("紧急联系人更新成功，联系人ID：{}", id);
    }
    
    @Override
    public List<EmergencyContactVO> listEmergencyContacts(Long employeeId) {
        log.info("查询员工的所有紧急联系人，员工ID：{}", employeeId);
        
        // 1. 验证员工是否存在
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(employeeId);
        }
        
        // 2. 查询紧急联系人列表
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<EmergencyContact> wrapper = Wrappers.lambdaQuery(EmergencyContact.class);
        wrapper.eq(EmergencyContact::getTenantId, tenantId)
               .eq(EmergencyContact::getEmployeeId, employeeId)
               .orderByAsc(EmergencyContact::getPriority)
               .orderByDesc(EmergencyContact::getCreateTime);
        
        List<EmergencyContact> contacts = emergencyContactMapper.selectList(wrapper);
        
        // 3. 转换为VO列表
        return convertContactsToVOList(contacts, employee);
    }
    
    @Override
    public EmergencyContactVO getEmergencyContact(Long id) {
        log.info("查询紧急联系人详情，联系人ID：{}", id);
        
        // 1. 查询紧急联系人
        EmergencyContact contact = emergencyContactMapper.selectById(id);
        if (contact == null) {
            throw HrBusinessException.emergencyContactNotFound(id);
        }
        
        // 2. 查询员工信息
        Employee employee = employeeMapper.selectById(contact.getEmployeeId());
        if (employee == null) {
            throw HrBusinessException.employeeNotFound(contact.getEmployeeId());
        }
        
        // 3. 转换为VO
        return convertContactToVO(contact, employee);
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteEmergencyContact(Long id) {
        log.info("删除紧急联系人，联系人ID：{}", id);
        
        // 1. 查询紧急联系人
        EmergencyContact contact = emergencyContactMapper.selectById(id);
        if (contact == null) {
            throw HrBusinessException.emergencyContactNotFound(id);
        }
        
        // 2. 删除紧急联系人
        emergencyContactMapper.deleteById(id);
        
        log.info("紧急联系人删除成功，联系人ID：{}", id);
    }
    
    // ==================== 私有辅助方法 ====================
    
    /**
     * 转换证件列表为VO列表
     */
    private List<EmployeeDocumentVO> convertDocumentsToVOList(
            List<EmployeeDocument> documents,
            Employee employee,
            Map<Long, List<String>> attachmentUrlMap
    ) {
        List<EmployeeDocumentVO> voList = new ArrayList<>();
        for (EmployeeDocument document : documents) {
            EmployeeDocumentVO vo = convertDocumentToVO(
                    document,
                    employee,
                    attachmentUrlMap.get(document.getId())
            );
            voList.add(vo);
        }
        return voList;
    }
    
    /**
     * 转换证件为VO
     */
    private EmployeeDocumentVO convertDocumentToVO(
            EmployeeDocument document,
            Employee employee,
            List<String> attachmentUrls
    ) {
        EmployeeDocumentVO vo = new EmployeeDocumentVO();
        BeanUtils.copyProperties(document, vo);
        List<String> normalizedAttachmentUrls = normalizeAttachmentUrls(
                attachmentUrls,
                "员工证件附件"
        );
        vo.setAttachmentUrls(normalizedAttachmentUrls);
        
        // 设置员工信息
        vo.setEmployeeName(employee.getName());
        vo.setEmployeeNo(employee.getEmployeeNo());
        
        // 设置证件类型名称
        vo.setDocumentTypeName(getDocumentTypeName(document.getDocumentType()));
        
        return vo;
    }
    
    /**
     * 获取证件类型名称
     */
    private String getDocumentTypeName(String documentType) {
        if (documentType == null) {
            return "";
        }
        switch (documentType) {
            case "ID_CARD":
                return "身份证";
            case "PASSPORT":
                return "护照";
            case "DIPLOMA":
                return "学历证书";
            case "DEGREE":
                return "学位证书";
            default:
                return documentType;
        }
    }

    private Map<Long, List<String>> getContractAttachmentUrlMap(List<EmployeeContract> contracts) {
        Map<Long, List<String>> attachmentUrlMap = new HashMap<>();
        if (CollectionUtils.isEmpty(contracts)) {
            return attachmentUrlMap;
        }

        List<Long> contractIds = new ArrayList<>();
        for (EmployeeContract contract : contracts) {
            contractIds.add(contract.getId());
        }

        LambdaQueryWrapper<EmployeeContractAttachment> wrapper = Wrappers.lambdaQuery(EmployeeContractAttachment.class);
        wrapper.in(EmployeeContractAttachment::getContractId, contractIds)
                .orderByAsc(EmployeeContractAttachment::getSortOrder)
                .orderByAsc(EmployeeContractAttachment::getId);
        List<EmployeeContractAttachment> attachments = employeeContractAttachmentMapper.selectList(wrapper);
        for (EmployeeContractAttachment attachment : attachments) {
            attachmentUrlMap.computeIfAbsent(attachment.getContractId(), key -> new ArrayList<>())
                    .add(attachment.getFileUrl());
        }

        for (Long contractId : contractIds) {
            attachmentUrlMap.put(
                    contractId,
                    normalizeAttachmentUrls(
                            attachmentUrlMap.get(contractId),
                            "员工合同附件"
                    )
            );
        }
        return attachmentUrlMap;
    }

    private List<String> getContractAttachmentUrls(EmployeeContract contract) {
        if (contract == null || contract.getId() == null) {
            return new ArrayList<>();
        }
        return getContractAttachmentUrlMap(List.of(contract)).getOrDefault(contract.getId(), new ArrayList<>());
    }

    private void replaceContractAttachments(Long contractId, Long tenantId, List<String> attachmentUrls) {
        if (contractId == null) {
            return;
        }

        deleteContractAttachments(List.of(contractId));
        if (CollectionUtils.isEmpty(attachmentUrls)) {
            return;
        }

        int sortOrder = 0;
        for (String attachmentUrl : attachmentUrls) {
            EmployeeContractAttachment attachment = new EmployeeContractAttachment();
            attachment.setTenantId(tenantId);
            attachment.setContractId(contractId);
            attachment.setFileName(extractFileName(attachmentUrl));
            attachment.setFileUrl(attachmentUrl);
            attachment.setSortOrder(sortOrder++);
            employeeContractAttachmentMapper.insert(attachment);
        }
    }

    private void deleteContractAttachments(Collection<Long> contractIds) {
        if (CollectionUtils.isEmpty(contractIds)) {
            return;
        }
        LambdaQueryWrapper<EmployeeContractAttachment> wrapper = Wrappers.lambdaQuery(EmployeeContractAttachment.class);
        wrapper.in(EmployeeContractAttachment::getContractId, contractIds);
        employeeContractAttachmentMapper.delete(wrapper);
    }

    private Map<Long, List<String>> getDocumentAttachmentUrlMap(List<EmployeeDocument> documents) {
        Map<Long, List<String>> attachmentUrlMap = new HashMap<>();
        if (CollectionUtils.isEmpty(documents)) {
            return attachmentUrlMap;
        }

        List<Long> documentIds = new ArrayList<>();
        for (EmployeeDocument document : documents) {
            documentIds.add(document.getId());
        }

        LambdaQueryWrapper<EmployeeDocumentAttachment> wrapper = Wrappers.lambdaQuery(EmployeeDocumentAttachment.class);
        wrapper.in(EmployeeDocumentAttachment::getDocumentId, documentIds)
                .orderByAsc(EmployeeDocumentAttachment::getSortOrder)
                .orderByAsc(EmployeeDocumentAttachment::getId);
        List<EmployeeDocumentAttachment> attachments = employeeDocumentAttachmentMapper.selectList(wrapper);
        for (EmployeeDocumentAttachment attachment : attachments) {
            attachmentUrlMap.computeIfAbsent(attachment.getDocumentId(), key -> new ArrayList<>())
                    .add(attachment.getFileUrl());
        }

        for (Long documentId : documentIds) {
            attachmentUrlMap.put(
                    documentId,
                    normalizeAttachmentUrls(
                            attachmentUrlMap.get(documentId),
                            "员工证件附件"
                    )
            );
        }
        return attachmentUrlMap;
    }

    private List<String> getDocumentAttachmentUrls(EmployeeDocument document) {
        if (document == null || document.getId() == null) {
            return new ArrayList<>();
        }
        return getDocumentAttachmentUrlMap(List.of(document)).getOrDefault(document.getId(), new ArrayList<>());
    }

    private void replaceDocumentAttachments(Long documentId, Long tenantId, List<String> attachmentUrls) {
        if (documentId == null) {
            return;
        }

        deleteDocumentAttachments(List.of(documentId));
        if (CollectionUtils.isEmpty(attachmentUrls)) {
            return;
        }

        int sortOrder = 0;
        for (String attachmentUrl : attachmentUrls) {
            EmployeeDocumentAttachment attachment = new EmployeeDocumentAttachment();
            attachment.setTenantId(tenantId);
            attachment.setDocumentId(documentId);
            attachment.setFileName(extractFileName(attachmentUrl));
            attachment.setFileUrl(attachmentUrl);
            attachment.setSortOrder(sortOrder++);
            employeeDocumentAttachmentMapper.insert(attachment);
        }
    }

    private void deleteDocumentAttachments(Collection<Long> documentIds) {
        if (CollectionUtils.isEmpty(documentIds)) {
            return;
        }
        LambdaQueryWrapper<EmployeeDocumentAttachment> wrapper = Wrappers.lambdaQuery(EmployeeDocumentAttachment.class);
        wrapper.in(EmployeeDocumentAttachment::getDocumentId, documentIds);
        employeeDocumentAttachmentMapper.delete(wrapper);
    }

    private List<String> normalizeAttachmentUrls(
            List<String> attachmentUrls,
            String fieldLabel
    ) {
        Set<String> normalizedUrls = new LinkedHashSet<>();
        if (!CollectionUtils.isEmpty(attachmentUrls)) {
            for (String attachmentUrl : attachmentUrls) {
                addAttachmentUrl(normalizedUrls, attachmentUrl);
            }
        }
        if (normalizedUrls.size() > MAX_ARCHIVE_ATTACHMENT_COUNT) {
            throw new IllegalArgumentException(fieldLabel + "最多上传 " + MAX_ARCHIVE_ATTACHMENT_COUNT + " 个文件");
        }
        return new ArrayList<>(normalizedUrls);
    }

    private void addAttachmentUrl(Set<String> normalizedUrls, String attachmentUrl) {
        if (StringUtils.hasText(attachmentUrl)) {
            normalizedUrls.add(attachmentUrl.trim());
        }
    }

    private String extractFileName(String fileUrl) {
        if (!StringUtils.hasText(fileUrl)) {
            return null;
        }

        String normalizedUrl = fileUrl.trim();
        int queryIndex = normalizedUrl.indexOf('?');
        if (queryIndex >= 0) {
            normalizedUrl = normalizedUrl.substring(0, queryIndex);
        }

        int slashIndex = normalizedUrl.lastIndexOf('/');
        String fileName = slashIndex >= 0 ? normalizedUrl.substring(slashIndex + 1) : normalizedUrl;
        return URLDecoder.decode(fileName, StandardCharsets.UTF_8);
    }
    
    /**
     * 转换紧急联系人列表为VO列表
     */
    private List<EmergencyContactVO> convertContactsToVOList(List<EmergencyContact> contacts, Employee employee) {
        List<EmergencyContactVO> voList = new ArrayList<>();
        for (EmergencyContact contact : contacts) {
            EmergencyContactVO vo = convertContactToVO(contact, employee);
            voList.add(vo);
        }
        return voList;
    }
    
    /**
     * 转换紧急联系人为VO
     */
    private EmergencyContactVO convertContactToVO(EmergencyContact contact, Employee employee) {
        EmergencyContactVO vo = new EmergencyContactVO();
        BeanUtils.copyProperties(contact, vo);
        
        // 设置员工信息
        vo.setEmployeeName(employee.getName());
        vo.setEmployeeNo(employee.getEmployeeNo());
        
        // 设置关系名称
        vo.setRelationshipName(getRelationshipName(contact.getRelationship()));
        
        return vo;
    }
    
    /**
     * 获取关系名称
     */
    private String getRelationshipName(String relationship) {
        if (relationship == null) {
            return "";
        }
        switch (relationship) {
            case "SPOUSE":
                return "配偶";
            case "PARENT":
                return "父母";
            case "SIBLING":
                return "兄弟姐妹";
            case "CHILD":
                return "子女";
            case "OTHER":
                return "其他";
            default:
                return relationship;
        }
    }
}
