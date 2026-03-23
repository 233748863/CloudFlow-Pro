package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.domain.dto.TransferApplicationCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.TransferApplication;
import com.cloudflow.hr.domain.vo.TransferApplicationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.mapper.TransferApplicationMapper;
import com.cloudflow.hr.service.TransferService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 调岗申请服务实现类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TransferServiceImpl implements TransferService {

    private final TransferApplicationMapper transferApplicationMapper;
    private final EmployeeMapper employeeMapper;
    private final PositionMapper positionMapper;
    private final AuthServiceClient authServiceClient;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createTransferApplication(TransferApplicationCreateDTO dto) {
        log.info("创建调岗申请，员工ID：{}", dto.getEmployeeId());

        // 1. 获取租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 2. 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }

        if (Objects.equals(employee.getDeptId(), dto.getToDeptId())
                && Objects.equals(employee.getPostId(), dto.getToPostId())
                && Objects.equals(employee.getPositionId(), dto.getToPositionId())) {
            throw new HrBusinessException("TRANSFER_TARGET_UNCHANGED", "目标部门、岗位、职位与当前信息一致，无需发起调岗申请");
        }

        // 3. 验证员工状态（只有在职员工才能调岗）
        if ("RESIGNED".equals(employee.getEmployeeStatus())) {
            throw new HrBusinessException("INVALID_EMPLOYEE_STATUS", "已离职员工不能申请调岗");
        }

        // 4. 验证目标部门和岗位
        validateDeptId(dto.getToDeptId());
        validatePostId(dto.getToPostId());

        // 5. 验证目标职位（如果提供）
        if (dto.getToPositionId() != null) {
            Position position = positionMapper.selectById(dto.getToPositionId());
            if (position == null) {
                throw new HrBusinessException("POSITION_NOT_FOUND", "目标职位不存在");
            }
        }

        // 6. 检查是否已有待处理的调岗申请
        LambdaQueryWrapper<TransferApplication> wrapper = Wrappers.lambdaQuery(TransferApplication.class);
        wrapper.eq(TransferApplication::getTenantId, tenantId)
               .eq(TransferApplication::getEmployeeId, dto.getEmployeeId())
               .in(TransferApplication::getStatus, Arrays.asList("DRAFT", "APPROVING", "APPROVED"));
        
        Long existingCount = transferApplicationMapper.selectCount(wrapper);
        if (existingCount > 0) {
            throw new HrBusinessException("TRANSFER_APPLICATION_EXISTS", "该员工已有待处理的调岗申请");
        }

        // 7. 生成申请编号
        String applicationNo = generateApplicationNo();

        // 8. 创建调岗申请记录
        TransferApplication application = new TransferApplication();
        BeanUtils.copyProperties(dto, application);
        application.setTenantId(tenantId);
        application.setApplicationNo(applicationNo);
        
        // 记录原部门、岗位、职位信息
        application.setFromDeptId(employee.getDeptId());
        application.setFromPostId(employee.getPostId());
        application.setFromPositionId(employee.getPositionId());
        
        application.setStatus("DRAFT");

        transferApplicationMapper.insert(application);

        log.info("调岗申请创建成功，申请ID：{}，申请编号：{}", application.getId(), applicationNo);
        return application.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitTransferApplication(Long id) {
        log.info("提交调岗申请，申请ID：{}", id);

        // 1. 查询调岗申请
        TransferApplication application = transferApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("TRANSFER_APPLICATION_NOT_FOUND", "调岗申请不存在");
        }

        // 2. 验证状态
        if (!"DRAFT".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有草稿状态的申请才能提交");
        }

        // 3. 查询员工信息
        Employee employee = employeeMapper.selectById(application.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }

        // 4. 调用工作流服务启动审批流程
        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(application.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getTransfer());
        processStartDTO.setBusinessType("TRANSFER");
        processStartDTO.setBusinessId(application.getId());
        processStartDTO.setBusinessNo(application.getApplicationNo());
        processStartDTO.setProcessTitle("调岗申请-" + employee.getName());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        // 设置流程变量
        Map<String, Object> variables = new HashMap<>();
        variables.put("employeeName", employee.getName());
        variables.put("employeeNo", employee.getEmployeeNo());
        variables.put("fromDeptId", application.getFromDeptId());
        variables.put("toDeptId", application.getToDeptId());
        variables.put("transferType", application.getTransferType());
        variables.put("effectiveDate", application.getEffectiveDate().toString());
        variables.put("salaryChange", application.getSalaryChange());
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + result.getMsg());
            }

            String processInstanceId = result.getData();
            log.info("审批流程启动成功，流程实例ID：{}", processInstanceId);

            // 5. 更新申请状态和流程实例ID
            application.setStatus("APPROVING");
            application.setProcessInstanceId(processInstanceId);
            transferApplicationMapper.updateById(application);

            log.info("调岗申请提交成功，申请ID：{}", id);
        } catch (Exception e) {
            log.error("启动审批流程失败", e);
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + e.getMessage(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveTransfer(Long id) {
        log.info("调岗申请审批通过，申请ID：{}", id);

        // 1. 查询调岗申请
        TransferApplication application = transferApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("TRANSFER_APPLICATION_NOT_FOUND", "调岗申请不存在");
        }
        if (!"APPROVING".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批中的调岗申请才能审批通过");
        }

        // 2. 查询员工信息
        Employee employee = employeeMapper.selectById(application.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }

        // 3. 更新申请状态
        application.setStatus("APPROVED");
        transferApplicationMapper.updateById(application);

        log.info("调岗申请审批通过处理完成，申请ID：{}，等待生效日期：{}", id, application.getEffectiveDate());
        
        // 4. 如果生效日期是今天或之前，立即生效
        if (!application.getEffectiveDate().isAfter(LocalDate.now())) {
            effectiveTransfer(id);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectTransfer(Long id) {
        log.info("审批拒绝调岗申请，id: {}", id);

        TransferApplication application = transferApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("TRANSFER_APPLICATION_NOT_FOUND", "调岗申请不存在");
        }
        if (!"APPROVING".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批中的调岗申请才能拒绝");
        }

        application.setStatus("REJECTED");
        transferApplicationMapper.updateById(application);

        log.info("调岗申请审批拒绝处理完成，id: {}", id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void effectiveTransfer(Long id) {
        log.info("调岗生效，申请ID：{}", id);

        // 1. 查询调岗申请
        TransferApplication application = transferApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("TRANSFER_APPLICATION_NOT_FOUND", "调岗申请不存在");
        }

        // 2. 验证状态
        if (!"APPROVED".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批通过的申请才能生效");
        }

        // 3. 查询员工信息
        Employee employee = employeeMapper.selectById(application.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }

        // 4. 更新员工的部门、岗位、职位信息
        employee.setDeptId(application.getToDeptId());
        employee.setPostId(application.getToPostId());
        employee.setPositionId(application.getToPositionId());
        employeeMapper.updateById(employee);

        // 5. 更新申请状态为已生效
        application.setStatus("EFFECTIVE");
        transferApplicationMapper.updateById(application);

        log.info("调岗生效完成，申请ID：{}，员工ID：{}", id, employee.getId());

        // 6. 如果涉及薪资变更，记录日志（实际应该触发调薪流程）
        if (Boolean.TRUE.equals(application.getSalaryChange())) {
            log.info("调岗涉及薪资变更，需要同步触发调薪流程，员工ID：{}", employee.getId());
            // TODO: 调用调薪服务创建调薪申请
            // salaryAdjustmentService.createAdjustmentForTransfer(application);
        }
    }

    @Override
    public TransferApplicationVO getTransferApplication(Long id) {
        log.info("查询调岗申请详情，申请ID：{}", id);

        // 1. 查询调岗申请
        TransferApplication application = transferApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("TRANSFER_APPLICATION_NOT_FOUND", "调岗申请不存在");
        }

        // 2. 转换为VO
        TransferApplicationVO vo = new TransferApplicationVO();
        BeanUtils.copyProperties(application, vo);

        // 3. 填充员工信息
        Employee employee = employeeMapper.selectById(application.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
            vo.setEmployeeNo(employee.getEmployeeNo());
        }

        // 4. 填充部门和岗位名称
        fillDeptAndPostNames(vo);

        // 5. 填充职位名称
        fillPositionNames(vo);

        // 6. 填充状态和类型描述
        vo.setStatusDesc(getStatusDesc(application.getStatus()));
        vo.setTransferTypeDesc(getTransferTypeDesc(application.getTransferType()));

        return vo;
    }

    @Override
    public List<TransferApplicationVO> listByEmployeeId(Long employeeId) {
        log.info("查询员工的调岗申请列表，员工ID：{}", employeeId);

        // 1. 查询调岗申请列表
        LambdaQueryWrapper<TransferApplication> wrapper = Wrappers.lambdaQuery(TransferApplication.class);
        wrapper.eq(TransferApplication::getEmployeeId, employeeId)
               .orderByDesc(TransferApplication::getCreateTime);

        List<TransferApplication> applications = transferApplicationMapper.selectList(wrapper);

        // 2. 转换为VO
        Employee employee = employeeMapper.selectById(employeeId);
        
        return applications.stream().map(application -> {
            TransferApplicationVO vo = new TransferApplicationVO();
            BeanUtils.copyProperties(application, vo);
            
            if (employee != null) {
                vo.setEmployeeName(employee.getName());
                vo.setEmployeeNo(employee.getEmployeeNo());
            }
            
            fillDeptAndPostNames(vo);
            fillPositionNames(vo);
            vo.setStatusDesc(getStatusDesc(application.getStatus()));
            vo.setTransferTypeDesc(getTransferTypeDesc(application.getTransferType()));
            
            return vo;
        }).collect(Collectors.toList());
    }

    // ==================== 私有方法 ====================

    /**
     * 生成申请编号
     */
    private String generateApplicationNo() {
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String random = String.format("%04d", new Random().nextInt(10000));
        return "TR" + date + random;
    }

    /**
     * 验证部门ID
     */
    private void validateDeptId(Long deptId) {
        try {
            R<DeptVO> result = authServiceClient.getDeptById(deptId);
            if (!result.isSuccess() || result.getData() == null) {
                throw new HrBusinessException("INVALID_DEPT", "目标部门不存在或无效");
            }
        } catch (Exception e) {
            log.error("验证部门ID失败，deptId：{}", deptId, e);
            throw new HrSystemException("VALIDATE_DEPT_FAILED", "验证部门ID失败", e);
        }
    }

    /**
     * 验证岗位ID
     */
    private void validatePostId(Long postId) {
        try {
            R<PostVO> result = authServiceClient.getPostById(postId);
            if (!result.isSuccess() || result.getData() == null) {
                throw new HrBusinessException("INVALID_POST", "目标岗位不存在或无效");
            }
        } catch (Exception e) {
            log.error("验证岗位ID失败，postId：{}", postId, e);
            throw new HrSystemException("VALIDATE_POST_FAILED", "验证岗位ID失败", e);
        }
    }

    /**
     * 填充部门和岗位名称
     */
    private void fillDeptAndPostNames(TransferApplicationVO vo) {
        // 填充原部门名称
        if (vo.getFromDeptId() != null) {
            try {
                R<DeptVO> deptResult = authServiceClient.getDeptById(vo.getFromDeptId());
                if (deptResult.isSuccess() && deptResult.getData() != null) {
                    vo.setFromDeptName(deptResult.getData().getDeptName());
                }
            } catch (Exception e) {
                log.warn("获取原部门名称失败，deptId：{}", vo.getFromDeptId(), e);
            }
        }

        // 填充目标部门名称
        if (vo.getToDeptId() != null) {
            try {
                R<DeptVO> deptResult = authServiceClient.getDeptById(vo.getToDeptId());
                if (deptResult.isSuccess() && deptResult.getData() != null) {
                    vo.setToDeptName(deptResult.getData().getDeptName());
                }
            } catch (Exception e) {
                log.warn("获取目标部门名称失败，deptId：{}", vo.getToDeptId(), e);
            }
        }

        // 填充原岗位名称
        if (vo.getFromPostId() != null) {
            try {
                R<PostVO> postResult = authServiceClient.getPostById(vo.getFromPostId());
                if (postResult.isSuccess() && postResult.getData() != null) {
                    vo.setFromPostName(postResult.getData().getPostName());
                }
            } catch (Exception e) {
                log.warn("获取原岗位名称失败，postId：{}", vo.getFromPostId(), e);
            }
        }

        // 填充目标岗位名称
        if (vo.getToPostId() != null) {
            try {
                R<PostVO> postResult = authServiceClient.getPostById(vo.getToPostId());
                if (postResult.isSuccess() && postResult.getData() != null) {
                    vo.setToPostName(postResult.getData().getPostName());
                }
            } catch (Exception e) {
                log.warn("获取目标岗位名称失败，postId：{}", vo.getToPostId(), e);
            }
        }
    }

    /**
     * 填充职位名称
     */
    private void fillPositionNames(TransferApplicationVO vo) {
        // 填充原职位名称
        if (vo.getFromPositionId() != null) {
            Position position = positionMapper.selectById(vo.getFromPositionId());
            if (position != null) {
                vo.setFromPositionName(position.getPositionName());
            }
        }

        // 填充目标职位名称
        if (vo.getToPositionId() != null) {
            Position position = positionMapper.selectById(vo.getToPositionId());
            if (position != null) {
                vo.setToPositionName(position.getPositionName());
            }
        }
    }

    /**
     * 获取状态描述
     */
    private String getStatusDesc(String status) {
        switch (status) {
            case "DRAFT":
                return "草稿";
            case "APPROVING":
                return "审批中";
            case "APPROVED":
                return "已通过";
            case "REJECTED":
                return "已拒绝";
            case "EFFECTIVE":
                return "已生效";
            default:
                return status;
        }
    }

    /**
     * 获取调岗类型描述
     */
    private String getTransferTypeDesc(String transferType) {
        switch (transferType) {
            case "DEPT":
                return "部门调动";
            case "POST":
                return "岗位调整";
            case "PROMOTION":
                return "晋升";
            case "DEMOTION":
                return "降级";
            default:
                return transferType;
        }
    }
}
