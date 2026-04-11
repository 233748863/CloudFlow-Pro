package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.ProbationConfirmationCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.ProbationConfirmation;
import com.cloudflow.hr.domain.vo.ProbationConfirmationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.ProbationConfirmationMapper;
import com.cloudflow.hr.service.ProbationConfirmationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 转正申请服务实现类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProbationConfirmationServiceImpl implements ProbationConfirmationService {

    private final ProbationConfirmationMapper probationConfirmationMapper;
    private final EmployeeMapper employeeMapper;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createProbationConfirmation(ProbationConfirmationCreateDTO dto) {
        log.info("创建转正申请，员工ID：{}", dto.getEmployeeId());

        // 1. 获取租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 2. 验证员工是否存在
        Employee employee = getEmployeeOrThrow(dto.getEmployeeId(), tenantId);

        if (employee.getHireDate() != null && dto.getProbationStartDate().isBefore(employee.getHireDate())) {
            throw new HrBusinessException("INVALID_PROBATION_DATE", "试用期开始日期不能早于入职日期");
        }
        if (dto.getProbationStartDate().isAfter(dto.getProbationEndDate())) {
            throw new HrBusinessException("INVALID_PROBATION_DATE", "试用期开始日期不能晚于结束日期");
        }
        if (dto.getExpectedRegularDate().isBefore(dto.getProbationEndDate())) {
            throw new HrBusinessException("INVALID_REGULAR_DATE", "预计转正日期不能早于试用期结束日期");
        }

        // 3. 验证员工状态是否为试用期
        if (!"PROBATION".equals(employee.getEmployeeStatus())) {
            throw new HrBusinessException("INVALID_EMPLOYEE_STATUS", "只有试用期员工才能申请转正");
        }

        // 4. 检查是否已有待处理的转正申请
        LambdaQueryWrapper<ProbationConfirmation> wrapper = Wrappers.lambdaQuery(ProbationConfirmation.class);
        wrapper.eq(ProbationConfirmation::getTenantId, tenantId)
               .eq(ProbationConfirmation::getEmployeeId, dto.getEmployeeId())
               .in(ProbationConfirmation::getStatus, Arrays.asList("DRAFT", "APPROVING"));
        
        Long existingCount = probationConfirmationMapper.selectCount(wrapper);
        if (existingCount > 0) {
            throw new HrBusinessException("PROBATION_CONFIRMATION_EXISTS", "该员工已有待处理的转正申请");
        }

        // 5. 生成申请编号
        String applicationNo = generateApplicationNo();

        // 6. 创建转正申请记录
        ProbationConfirmation confirmation = new ProbationConfirmation();
        BeanUtils.copyProperties(dto, confirmation);
        confirmation.setTenantId(tenantId);
        confirmation.setApplicationNo(applicationNo);
        confirmation.setStatus("DRAFT");

        probationConfirmationMapper.insert(confirmation);

        log.info("转正申请创建成功，申请ID：{}，申请编号：{}", confirmation.getId(), applicationNo);
        return confirmation.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitProbationConfirmation(Long id) {
        log.info("提交转正申请，申请ID：{}", id);

        Long tenantId = SecurityUtils.getTenantId();
        ProbationConfirmation confirmation = getConfirmationOrThrow(id, tenantId);

        // 2. 验证状态
        validateStatus(confirmation, "DRAFT", "提交");

        // 3. 查询员工信息
        Employee employee = getEmployeeOrThrow(confirmation.getEmployeeId(), tenantId);
        if (!"PROBATION".equals(employee.getEmployeeStatus())) {
            throw HrBusinessException.invalidEmployeeStatus(employee.getId(), employee.getEmployeeStatus(), "转正申请提交");
        }

        // 4. 调用工作流服务启动审批流程
        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(confirmation.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getProbationConfirmation());
        processStartDTO.setBusinessType("PROBATION_CONFIRMATION");
        processStartDTO.setBusinessId(confirmation.getId());
        processStartDTO.setBusinessNo(confirmation.getApplicationNo());
        processStartDTO.setProcessTitle("转正申请-" + employee.getName());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        // 设置流程变量
        Map<String, Object> variables = new HashMap<>();
        variables.put("employeeName", employee.getName());
        variables.put("employeeNo", employee.getEmployeeNo());
        variables.put("deptId", employee.getDeptId());
        variables.put("probationStartDate", confirmation.getProbationStartDate().toString());
        variables.put("probationEndDate", confirmation.getProbationEndDate().toString());
        variables.put("expectedRegularDate", confirmation.getExpectedRegularDate().toString());
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (result == null) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：Workflow 服务无响应");
            }
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + result.getMsg());
            }
            if (result.getData() == null || result.getData().isBlank()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：Workflow 未返回流程实例ID");
            }

            String processInstanceId = result.getData();
            log.info("审批流程启动成功，流程实例ID：{}", processInstanceId);

            // 5. 更新申请状态和流程实例ID
            confirmation.setStatus("APPROVING");
            confirmation.setProcessInstanceId(processInstanceId);
            probationConfirmationMapper.updateById(confirmation);

            log.info("转正申请提交成功，申请ID：{}", id);
        } catch (HrSystemException e) {
            throw e;
        } catch (Exception e) {
            log.error("启动审批流程失败", e);
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + e.getMessage(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveProbationConfirmation(Long id) {
        log.info("转正申请审批通过，申请ID：{}", id);

        Long tenantId = SecurityUtils.getTenantId();
        ProbationConfirmation confirmation = getConfirmationOrThrow(id, tenantId);
        validateStatus(confirmation, "APPROVING", "审批通过");

        // 2. 查询员工信息
        Employee employee = getEmployeeOrThrow(confirmation.getEmployeeId(), tenantId);

        // 3. 更新员工状态为正式员工
        employee.setEmployeeStatus("REGULAR");
        employee.setRegularDate(confirmation.getExpectedRegularDate());
        employeeMapper.updateById(employee);

        // 4. 更新申请状态
        confirmation.setStatus("APPROVED");
        probationConfirmationMapper.updateById(confirmation);

        log.info("转正申请审批通过处理完成，申请ID：{}，员工ID：{}", id, employee.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectProbationConfirmation(Long id, String reason, Integer extensionDays) {
        log.info("转正申请审批拒绝，申请ID：{}，拒绝原因：{}，延长天数：{}", id, reason, extensionDays);

        Long tenantId = SecurityUtils.getTenantId();
        ProbationConfirmation confirmation = getConfirmationOrThrow(id, tenantId);
        validateStatus(confirmation, "APPROVING", "审批拒绝");
        validateExtensionDays(extensionDays);

        // 2. 查询员工信息
        Employee employee = getEmployeeOrThrow(confirmation.getEmployeeId(), tenantId);

        // 3. 更新申请状态
        confirmation.setRejectReason(reason);
        confirmation.setExtensionDays(extensionDays);

        if (extensionDays != null && extensionDays > 0) {
            // 延长试用期
            confirmation.setStatus("EXTENDED");
            // 更新试用期结束日期
            LocalDate newProbationEndDate = confirmation.getProbationEndDate().plusDays(extensionDays);
            confirmation.setProbationEndDate(newProbationEndDate);
            confirmation.setExpectedRegularDate(newProbationEndDate);
            
            log.info("延长试用期{}天，新的试用期结束日期：{}", extensionDays, newProbationEndDate);
        } else {
            // 不延长试用期，标记为离职
            confirmation.setStatus("REJECTED");
            employee.setEmployeeStatus("RESIGNED");
            employee.setResignDate(LocalDate.now());
            employeeMapper.updateById(employee);
            
            log.info("转正申请被拒绝，员工状态更新为离职");
        }

        probationConfirmationMapper.updateById(confirmation);

        log.info("转正申请审批拒绝处理完成，申请ID：{}", id);
    }

    @Override
    public ProbationConfirmationVO getProbationConfirmation(Long id) {
        log.info("查询转正申请详情，申请ID：{}", id);

        Long tenantId = SecurityUtils.getTenantId();
        ProbationConfirmation confirmation = getConfirmationOrThrow(id, tenantId);

        // 2. 转换为VO
        ProbationConfirmationVO vo = new ProbationConfirmationVO();
        BeanUtils.copyProperties(confirmation, vo);

        // 3. 填充员工信息
        Employee employee = employeeMapper.selectById(confirmation.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
            vo.setEmployeeNo(employee.getEmployeeNo());
        }

        // 4. 填充状态描述
        vo.setStatusDesc(getStatusDesc(confirmation.getStatus()));

        return vo;
    }

    @Override
    public List<ProbationConfirmationVO> listByEmployeeId(Long employeeId) {
        log.info("查询员工的转正申请列表，员工ID：{}", employeeId);

        Long tenantId = SecurityUtils.getTenantId();
        Employee employee = getEmployeeOrThrow(employeeId, tenantId);

        // 1. 查询转正申请列表
        LambdaQueryWrapper<ProbationConfirmation> wrapper = Wrappers.lambdaQuery(ProbationConfirmation.class);
        wrapper.eq(ProbationConfirmation::getTenantId, tenantId)
               .eq(ProbationConfirmation::getEmployeeId, employeeId)
               .orderByDesc(ProbationConfirmation::getCreateTime);

        List<ProbationConfirmation> confirmations = probationConfirmationMapper.selectList(wrapper);

        // 2. 转换为VO
        return confirmations.stream().map(confirmation -> {
            ProbationConfirmationVO vo = new ProbationConfirmationVO();
            BeanUtils.copyProperties(confirmation, vo);
            
            if (employee != null) {
                vo.setEmployeeName(employee.getName());
                vo.setEmployeeNo(employee.getEmployeeNo());
            }
            
            vo.setStatusDesc(getStatusDesc(confirmation.getStatus()));
            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    @Scheduled(cron = "0 0 9 * * ?") // 每天早上9点执行
    public void sendProbationReminders() {
        log.info("开始执行转正提醒定时任务");

        try {
            // 1. 获取所有租户（这里简化处理，实际应该查询所有租户）
            Long tenantId = SecurityUtils.getTenantId();

            // 2. 查询试用期到期前15天的员工
            LocalDate today = LocalDate.now();
            LocalDate startDate = today.plusDays(15);
            LocalDate endDate = today.plusDays(15);

            List<ProbationConfirmation> expiringProbations = 
                probationConfirmationMapper.selectExpiringProbations(tenantId, startDate, endDate);

            log.info("查询到{}个即将到期的试用期员工", expiringProbations.size());

            // 3. 发送提醒通知（这里简化处理，实际应该调用通知服务）
            for (ProbationConfirmation confirmation : expiringProbations) {
                Employee employee = employeeMapper.selectById(confirmation.getEmployeeId());
                if (employee != null) {
                    log.info("发送转正提醒：员工{}（工号：{}）的试用期将于{}到期", 
                            employee.getName(), employee.getEmployeeNo(), confirmation.getProbationEndDate());
                    
                    // TODO: 调用通知服务发送提醒
                    // notificationService.sendProbationReminder(employee, confirmation);
                }
            }

            log.info("转正提醒定时任务执行完成");
        } catch (Exception e) {
            log.error("转正提醒定时任务执行失败", e);
        }
    }

    // ==================== 私有方法 ====================

    /**
     * 生成申请编号
     */
    private String generateApplicationNo() {
        return "PC" + IdUtils.snowflakeIdStr();
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
            case "EXTENDED":
                return "延长试用期";
            default:
                return status;
        }
    }

    private Employee getEmployeeOrThrow(Long employeeId, Long tenantId) {
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !Objects.equals(tenantId, employee.getTenantId())) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }
        return employee;
    }

    private ProbationConfirmation getConfirmationOrThrow(Long id, Long tenantId) {
        ProbationConfirmation confirmation = probationConfirmationMapper.selectById(id);
        if (confirmation == null || !Objects.equals(tenantId, confirmation.getTenantId())) {
            throw new HrBusinessException("PROBATION_CONFIRMATION_NOT_FOUND", "转正申请不存在");
        }
        return confirmation;
    }

    private void validateStatus(ProbationConfirmation confirmation, String expectedStatus, String action) {
        if (!expectedStatus.equals(confirmation.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS",
                    "只有" + getStatusDesc(expectedStatus) + "状态的申请才能" + action);
        }
    }

    private void validateExtensionDays(Integer extensionDays) {
        if (extensionDays != null && extensionDays <= 0) {
            throw new HrBusinessException("INVALID_EXTENSION_DAYS", "延长天数必须大于0");
        }
    }
}
