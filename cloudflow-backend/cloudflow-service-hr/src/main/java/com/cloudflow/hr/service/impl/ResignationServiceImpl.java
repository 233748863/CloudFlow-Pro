package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.HandoverCompleteDTO;
import com.cloudflow.hr.domain.dto.ResignationApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.ResignationConfirmDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.ResignationApplication;
import com.cloudflow.hr.domain.entity.ResignationHandover;
import com.cloudflow.hr.domain.vo.ResignationApplicationVO;
import com.cloudflow.hr.domain.vo.ResignationHandoverVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.ResignationApplicationMapper;
import com.cloudflow.hr.mapper.ResignationHandoverMapper;
import com.cloudflow.hr.service.ResignationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 离职申请服务实现类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ResignationServiceImpl implements ResignationService {

    private final ResignationApplicationMapper resignationApplicationMapper;
    private final ResignationHandoverMapper resignationHandoverMapper;
    private final EmployeeMapper employeeMapper;
    private final AuthServiceClient authServiceClient;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createResignationApplication(ResignationApplicationCreateDTO dto) {
        log.info("创建离职申请，员工ID：{}", dto.getEmployeeId());

        // 1. 获取租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 2. 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }

        // 3. 验证员工状态（只有在职员工才能申请离职）
        if ("RESIGNED".equals(employee.getEmployeeStatus())) {
            throw new HrBusinessException("INVALID_EMPLOYEE_STATUS", "员工已离职，无法再次申请");
        }

        // 4. 检查是否已有待处理的离职申请
        LambdaQueryWrapper<ResignationApplication> wrapper = Wrappers.lambdaQuery(ResignationApplication.class);
        wrapper.eq(ResignationApplication::getTenantId, tenantId)
               .eq(ResignationApplication::getEmployeeId, dto.getEmployeeId())
               .in(ResignationApplication::getStatus, Arrays.asList("DRAFT", "APPROVING", "APPROVED"));
        
        Long existingCount = resignationApplicationMapper.selectCount(wrapper);
        if (existingCount > 0) {
            throw new HrBusinessException("RESIGNATION_APPLICATION_EXISTS", "该员工已有待处理的离职申请");
        }

        // 5. 生成申请编号
        String applicationNo = generateApplicationNo();

        // 6. 创建离职申请记录
        ResignationApplication application = new ResignationApplication();
        BeanUtils.copyProperties(dto, application);
        application.setTenantId(tenantId);
        application.setApplicationNo(applicationNo);
        application.setStatus("DRAFT");

        resignationApplicationMapper.insert(application);

        log.info("离职申请创建成功，申请ID：{}，申请编号：{}", application.getId(), applicationNo);
        return application.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitResignationApplication(Long id) {
        log.info("提交离职申请，申请ID：{}", id);

        // 1. 查询离职申请
        ResignationApplication application = resignationApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("RESIGNATION_APPLICATION_NOT_FOUND", "离职申请不存在");
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
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getResignation());
        processStartDTO.setBusinessType("RESIGNATION");
        processStartDTO.setBusinessId(application.getId());
        processStartDTO.setBusinessNo(application.getApplicationNo());
        processStartDTO.setProcessTitle("离职申请-" + employee.getName());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        // 设置流程变量
        Map<String, Object> variables = new HashMap<>();
        variables.put("employeeName", employee.getName());
        variables.put("employeeNo", employee.getEmployeeNo());
        variables.put("resignationType", application.getResignationType());
        variables.put("expectedDate", application.getExpectedDate().toString());
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
            resignationApplicationMapper.updateById(application);

            log.info("离职申请提交成功，申请ID：{}", id);
        } catch (Exception e) {
            log.error("启动审批流程失败", e);
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + e.getMessage(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveResignation(Long id) {
        log.info("离职申请审批通过，申请ID：{}", id);

        // 1. 查询离职申请
        ResignationApplication application = resignationApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("RESIGNATION_APPLICATION_NOT_FOUND", "离职申请不存在");
        }
        if (!"APPROVING".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批中的离职申请才能审批通过");
        }

        // 2. 更新申请状态
        application.setStatus("APPROVED");
        resignationApplicationMapper.updateById(application);

        // 3. 生成离职交接清单
        generateHandoverList(application);

        log.info("离职申请审批通过处理完成，申请ID：{}", id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectResignation(Long id) {
        log.info("审批拒绝离职申请，id: {}", id);

        ResignationApplication application = resignationApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("RESIGNATION_APPLICATION_NOT_FOUND", "离职申请不存在");
        }
        if (!"APPROVING".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批中的离职申请才能拒绝");
        }

        application.setStatus("REJECTED");
        resignationApplicationMapper.updateById(application);

        log.info("离职申请审批拒绝处理完成，id: {}", id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void conductExitInterview(Long id, String interviewContent) {
        log.info("完成离职面谈，申请ID：{}", id);

        // 1. 查询离职申请
        ResignationApplication application = resignationApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("RESIGNATION_APPLICATION_NOT_FOUND", "离职申请不存在");
        }
        if (!Arrays.asList("DRAFT", "APPROVING", "APPROVED").contains(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有草稿、审批中或已通过的申请才能记录离职面谈");
        }

        // 2. 记录面谈内容
        application.setInterviewContent(normalizeInterviewContent(interviewContent));
        resignationApplicationMapper.updateById(application);

        log.info("离职面谈记录完成，申请ID：{}", id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void completeHandover(HandoverCompleteDTO dto) {
        log.info("完成交接，交接ID：{}", dto.getHandoverId());

        // 1. 查询交接记录
        ResignationHandover handover = resignationHandoverMapper.selectById(dto.getHandoverId());
        if (handover == null) {
            throw new HrBusinessException("HANDOVER_NOT_FOUND", "交接记录不存在");
        }

        // 2. 验证状态
        if ("COMPLETED".equals(handover.getStatus())) {
            throw new HrBusinessException("HANDOVER_ALREADY_COMPLETED", "交接已完成");
        }

        // 3. 更新交接状态
        handover.setStatus("COMPLETED");
        handover.setCompletedTime(LocalDateTime.now());
        handover.setRemark(dto.getRemark());
        resignationHandoverMapper.updateById(handover);

        log.info("交接完成，交接ID：{}", dto.getHandoverId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void confirmResignation(ResignationConfirmDTO dto) {
        log.info("确认离职，申请ID：{}，实际离职日期：{}", dto.getApplicationId(), dto.getActualDate());

        // 1. 查询离职申请
        ResignationApplication application = resignationApplicationMapper.selectById(dto.getApplicationId());
        if (application == null) {
            throw new HrBusinessException("RESIGNATION_APPLICATION_NOT_FOUND", "离职申请不存在");
        }

        // 2. 验证状态
        if (!"APPROVED".equals(application.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批通过的申请才能确认离职");
        }

        LambdaQueryWrapper<ResignationHandover> handoverWrapper = Wrappers.lambdaQuery(ResignationHandover.class);
        handoverWrapper.eq(ResignationHandover::getApplicationId, dto.getApplicationId())
                .ne(ResignationHandover::getStatus, "COMPLETED");
        Long pendingCount = resignationHandoverMapper.selectCount(handoverWrapper);
        if (pendingCount != null && pendingCount > 0) {
            throw new HrBusinessException("HANDOVER_INCOMPLETE", "交接项未全部完成，不能确认离职");
        }

        // 3. 查询员工信息
        Employee employee = employeeMapper.selectById(application.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }

        // 4. 更新员工状态为已离职
        employee.setEmployeeStatus("RESIGNED");
        employee.setResignDate(dto.getActualDate());
        employeeMapper.updateById(employee);

        // 5. 更新申请状态和实际离职日期
        application.setStatus("COMPLETED");
        application.setActualDate(dto.getActualDate());
        resignationApplicationMapper.updateById(application);

        // 6. 调用Auth服务注销用户账号
        if (employee.getUserId() != null) {
            disableUserAccount(employee.getUserId());
        }

        log.info("确认离职成功，申请ID：{}，员工ID：{}", dto.getApplicationId(), employee.getId());
    }

    @Override
    public ResignationApplicationVO getResignationApplication(Long id) {
        log.info("查询离职申请详情，申请ID：{}", id);

        // 1. 查询离职申请
        ResignationApplication application = resignationApplicationMapper.selectById(id);
        if (application == null) {
            throw new HrBusinessException("RESIGNATION_APPLICATION_NOT_FOUND", "离职申请不存在");
        }

        // 2. 转换为VO
        ResignationApplicationVO vo = new ResignationApplicationVO();
        BeanUtils.copyProperties(application, vo);

        // 3. 填充员工信息
        Employee employee = employeeMapper.selectById(application.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
            vo.setEmployeeNo(employee.getEmployeeNo());
        }

        // 4. 填充状态和类型描述
        vo.setStatusDesc(getStatusDesc(application.getStatus()));
        vo.setResignationTypeDesc(getResignationTypeDesc(application.getResignationType()));

        return vo;
    }

    @Override
    public List<ResignationApplicationVO> listByEmployeeId(Long employeeId) {
        log.info("查询员工的离职申请列表，员工ID：{}", employeeId);

        // 1. 查询离职申请列表
        LambdaQueryWrapper<ResignationApplication> wrapper = Wrappers.lambdaQuery(ResignationApplication.class);
        wrapper.eq(ResignationApplication::getEmployeeId, employeeId)
               .orderByDesc(ResignationApplication::getCreateTime);

        List<ResignationApplication> applications = resignationApplicationMapper.selectList(wrapper);

        // 2. 转换为VO
        Employee employee = employeeMapper.selectById(employeeId);
        
        return applications.stream().map(application -> {
            ResignationApplicationVO vo = new ResignationApplicationVO();
            BeanUtils.copyProperties(application, vo);
            
            if (employee != null) {
                vo.setEmployeeName(employee.getName());
                vo.setEmployeeNo(employee.getEmployeeNo());
            }
            
            vo.setStatusDesc(getStatusDesc(application.getStatus()));
            vo.setResignationTypeDesc(getResignationTypeDesc(application.getResignationType()));
            
            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    public List<ResignationHandoverVO> listHandovers(Long applicationId) {
        log.info("查询离职交接清单，申请ID：{}", applicationId);

        // 1. 查询交接清单
        LambdaQueryWrapper<ResignationHandover> wrapper = Wrappers.lambdaQuery(ResignationHandover.class);
        wrapper.eq(ResignationHandover::getApplicationId, applicationId)
               .orderByAsc(ResignationHandover::getCreateTime);

        List<ResignationHandover> handovers = resignationHandoverMapper.selectList(wrapper);

        // 2. 转换为VO
        return handovers.stream().map(handover -> {
            ResignationHandoverVO vo = new ResignationHandoverVO();
            BeanUtils.copyProperties(handover, vo);
            
            // 填充交接对象姓名
            if (handover.getHandoverToId() != null) {
                Employee employee = employeeMapper.selectById(handover.getHandoverToId());
                if (employee != null) {
                    vo.setHandoverToName(employee.getName());
                }
            }
            
            vo.setHandoverTypeDesc(getHandoverTypeDesc(handover.getHandoverType()));
            vo.setStatusDesc(getHandoverStatusDesc(handover.getStatus()));
            
            return vo;
        }).collect(Collectors.toList());
    }

    // ==================== 私有方法 ====================

    /**
     * 生成申请编号
     */
    private String generateApplicationNo() {
        return "RS" + IdUtils.snowflakeIdStr();
    }

    private String normalizeInterviewContent(String interviewContent) {
        if (!StringUtils.hasText(interviewContent)) {
            return interviewContent;
        }

        String normalized = interviewContent.trim();
        if (normalized.length() >= 2 && normalized.startsWith("\"") && normalized.endsWith("\"")) {
            try {
                return objectMapper.readValue(normalized, String.class);
            } catch (JsonProcessingException ex) {
                log.debug("解析离职面谈 JSON 字符串失败，保留原始内容", ex);
            }
        }
        return normalized;
    }

    /**
     * 生成离职交接清单
     */
    private void generateHandoverList(ResignationApplication application) {
        log.info("生成离职交接清单，申请ID：{}", application.getId());

        List<ResignationHandover> handovers = new ArrayList<>();

        // 交接项1：工作交接
        ResignationHandover workHandover = new ResignationHandover();
        workHandover.setTenantId(application.getTenantId());
        workHandover.setApplicationId(application.getId());
        workHandover.setHandoverItem("工作内容交接");
        workHandover.setHandoverType("WORK");
        workHandover.setStatus("PENDING");
        handovers.add(workHandover);

        // 交接项2：资产归还
        ResignationHandover assetHandover = new ResignationHandover();
        assetHandover.setTenantId(application.getTenantId());
        assetHandover.setApplicationId(application.getId());
        assetHandover.setHandoverItem("公司资产归还（电脑、工牌等）");
        assetHandover.setHandoverType("ASSET");
        assetHandover.setStatus("PENDING");
        handovers.add(assetHandover);

        // 交接项3：文档交接
        ResignationHandover documentHandover = new ResignationHandover();
        documentHandover.setTenantId(application.getTenantId());
        documentHandover.setApplicationId(application.getId());
        documentHandover.setHandoverItem("工作文档和资料交接");
        documentHandover.setHandoverType("DOCUMENT");
        documentHandover.setStatus("PENDING");
        handovers.add(documentHandover);

        // 交接项4：账号注销
        ResignationHandover accountHandover = new ResignationHandover();
        accountHandover.setTenantId(application.getTenantId());
        accountHandover.setApplicationId(application.getId());
        accountHandover.setHandoverItem("系统账号注销");
        accountHandover.setHandoverType("ACCOUNT");
        accountHandover.setStatus("PENDING");
        handovers.add(accountHandover);

        // 批量插入交接清单
        handovers.forEach(resignationHandoverMapper::insert);

        log.info("离职交接清单生成完成，共{}个交接项", handovers.size());
    }

    /**
     * 注销用户账号
     */
    private void disableUserAccount(Long userId) {
        log.info("注销用户账号，用户ID：{}", userId);

        try {
            R<Void> result = authServiceClient.disableUser(userId);
            if (!result.isSuccess()) {
                log.error("注销用户账号失败：{}", result.getMsg());
                throw new HrSystemException("DISABLE_USER_FAILED", "注销用户账号失败：" + result.getMsg());
            }

            log.info("用户账号注销成功，用户ID：{}", userId);
        } catch (Exception e) {
            log.error("注销用户账号失败", e);
            throw new HrSystemException("DISABLE_USER_FAILED", "注销用户账号失败：" + e.getMessage(), e);
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
            case "COMPLETED":
                return "已完成";
            default:
                return status;
        }
    }

    /**
     * 获取离职类型描述
     */
    private String getResignationTypeDesc(String resignationType) {
        switch (resignationType) {
            case "VOLUNTARY":
                return "主动离职";
            case "INVOLUNTARY":
                return "被动离职";
            case "CONTRACT_EXPIRY":
                return "合同到期";
            default:
                return resignationType;
        }
    }

    /**
     * 获取交接类型描述
     */
    private String getHandoverTypeDesc(String handoverType) {
        switch (handoverType) {
            case "WORK":
                return "工作交接";
            case "ASSET":
                return "资产归还";
            case "DOCUMENT":
                return "文档交接";
            case "ACCOUNT":
                return "账号注销";
            default:
                return handoverType;
        }
    }

    /**
     * 获取交接状态描述
     */
    private String getHandoverStatusDesc(String status) {
        switch (status) {
            case "PENDING":
                return "待交接";
            case "COMPLETED":
                return "已完成";
            default:
                return status;
        }
    }
}
