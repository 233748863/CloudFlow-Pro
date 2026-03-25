package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.domain.dto.RecruitmentRequestCreateDTO;
import com.cloudflow.hr.domain.dto.RecruitmentRequestQueryDTO;
import com.cloudflow.hr.domain.entity.Candidate;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.RecruitmentRequest;
import com.cloudflow.hr.domain.vo.RecruitmentRequestVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.CandidateMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.mapper.RecruitmentRequestMapper;
import com.cloudflow.hr.service.RecruitmentRequestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/**
 * 招聘需求服务实现类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RecruitmentRequestServiceImpl implements RecruitmentRequestService {

    private final RecruitmentRequestMapper recruitmentRequestMapper;
    private final CandidateMapper candidateMapper;
    private final PositionMapper positionMapper;
    private final AuthServiceClient authServiceClient;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createRecruitmentRequest(RecruitmentRequestCreateDTO dto) {
        log.info("创建招聘需求，部门ID：{}，职位ID：{}，招聘人数：{}", 
                dto.getDeptId(), dto.getPositionId(), dto.getHeadcount());

        // 1. 获取租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 2. 验证部门ID
        validateDeptId(dto.getDeptId());

        // 3. 验证职位ID
        Position position = positionMapper.selectById(dto.getPositionId());
        if (position == null) {
            throw HrBusinessException.positionNotFound(dto.getPositionId());
        }

        // 4. 验证薪资范围
        if (dto.getSalaryMin() != null && dto.getSalaryMax() != null) {
            if (dto.getSalaryMin().compareTo(dto.getSalaryMax()) > 0) {
                throw new HrBusinessException("INVALID_SALARY_RANGE", "最低薪资不能大于最高薪资");
            }
        }

        // 5. 生成需求编号
        String requestNo = generateRequestNo();

        // 6. 创建招聘需求记录
        RecruitmentRequest request = new RecruitmentRequest();
        BeanUtils.copyProperties(dto, request);
        request.setTenantId(tenantId);
        request.setRequestNo(requestNo);
        request.setStatus("DRAFT");
        request.setHiredCount(0);

        recruitmentRequestMapper.insert(request);

        log.info("招聘需求创建成功，需求ID：{}，需求编号：{}", request.getId(), requestNo);
        return request.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitRecruitmentRequest(Long requestId) {
        log.info("提交招聘需求审批，需求ID：{}", requestId);

        // 1. 查询招聘需求
        RecruitmentRequest request = recruitmentRequestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("RECRUITMENT_REQUEST_NOT_FOUND", "招聘需求不存在");
        }

        // 2. 验证状态
        if (!"DRAFT".equals(request.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有草稿状态的需求才能提交");
        }

        // 3. 获取职位信息
        Position position = positionMapper.selectById(request.getPositionId());
        if (position == null) {
            throw new HrBusinessException("POSITION_NOT_FOUND", "职位不存在");
        }

        // 4. 调用工作流服务启动审批流程
        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(request.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getRecruitmentRequest());
        processStartDTO.setBusinessType("RECRUITMENT_REQUEST");
        processStartDTO.setBusinessId(request.getId());
        processStartDTO.setBusinessNo(request.getRequestNo());
        processStartDTO.setProcessTitle("招聘需求-" + position.getPositionName());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        // 设置流程变量
        Map<String, Object> variables = new HashMap<>();
        variables.put("deptId", request.getDeptId());
        variables.put("positionId", request.getPositionId());
        variables.put("positionName", position.getPositionName());
        variables.put("headcount", request.getHeadcount());
        if (request.getSalaryMin() != null) {
            variables.put("salaryMin", request.getSalaryMin().toString());
        }
        if (request.getSalaryMax() != null) {
            variables.put("salaryMax", request.getSalaryMax().toString());
        }
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + result.getMsg());
            }

            String processInstanceId = result.getData();
            log.info("审批流程启动成功，流程实例ID：{}", processInstanceId);

            // 5. 更新需求状态和流程实例ID
            request.setStatus("APPROVING");
            request.setProcessInstanceId(processInstanceId);
            recruitmentRequestMapper.updateById(request);

            log.info("招聘需求提交成功，需求ID：{}", requestId);
        } catch (Exception e) {
            log.error("启动审批流程失败", e);
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败：" + e.getMessage(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveRecruitmentRequest(Long requestId) {
        log.info("招聘需求审批通过，需求ID：{}", requestId);

        // 1. 查询招聘需求
        RecruitmentRequest request = recruitmentRequestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("RECRUITMENT_REQUEST_NOT_FOUND", "招聘需求不存在");
        }

        // 2. 验证状态
        if (!"APPROVING".equals(request.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批中的需求才能审批通过");
        }

        // 3. 更新需求状态为"招聘中"
        request.setStatus("RECRUITING");
        recruitmentRequestMapper.updateById(request);

        log.info("招聘需求审批通过处理完成，需求ID：{}，状态更新为招聘中", requestId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectRecruitmentRequest(Long requestId) {
        log.info("审批拒绝招聘需求，requestId: {}", requestId);

        RecruitmentRequest request = recruitmentRequestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("RECRUITMENT_REQUEST_NOT_FOUND", "招聘需求不存在");
        }
        if (!"APPROVING".equals(request.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有审批中的招聘需求才能拒绝");
        }

        request.setStatus("REJECTED");
        recruitmentRequestMapper.updateById(request);

        log.info("招聘需求审批拒绝处理完成，requestId: {}", requestId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void completeRecruitmentRequest(Long requestId) {
        log.info("完成招聘需求，需求ID：{}", requestId);

        // 1. 查询招聘需求
        RecruitmentRequest request = recruitmentRequestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("RECRUITMENT_REQUEST_NOT_FOUND", "招聘需求不存在");
        }

        // 2. 验证状态
        if (!"RECRUITING".equals(request.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "只有招聘中的需求才能完成");
        }

        // 3. 招聘未招满时不允许标记为完成，避免与“取消需求”语义混淆
        int hiredCount = countHiredCandidates(request.getId());
        if (hiredCount < request.getHeadcount()) {
            throw new HrBusinessException("HEADCOUNT_NOT_MET",
                    String.format("招聘人数未达标，当前 %d/%d，不能完成需求", hiredCount, request.getHeadcount()));
        }

        // 4. 更新需求状态为"已完成"
        request.setStatus("COMPLETED");
        recruitmentRequestMapper.updateById(request);

        log.info("招聘需求完成，需求ID：{}，已招聘人数：{}/{}", 
                requestId, hiredCount, request.getHeadcount());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancelRecruitmentRequest(Long requestId) {
        log.info("取消招聘需求，需求ID：{}", requestId);

        // 1. 查询招聘需求
        RecruitmentRequest request = recruitmentRequestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("RECRUITMENT_REQUEST_NOT_FOUND", "招聘需求不存在");
        }

        // 2. 验证状态（已完成的需求不能取消）
        if ("COMPLETED".equals(request.getStatus())) {
            throw new HrBusinessException("INVALID_STATUS", "已完成的需求不能取消");
        }

        // 3. 更新需求状态为"已取消"
        request.setStatus("CANCELLED");
        recruitmentRequestMapper.updateById(request);

        log.info("招聘需求已取消，需求ID：{}", requestId);
    }

    @Override
    public RecruitmentRequestVO getRecruitmentRequest(Long requestId) {
        log.info("查询招聘需求详情，需求ID：{}", requestId);

        // 1. 查询招聘需求
        RecruitmentRequest request = recruitmentRequestMapper.selectById(requestId);
        if (request == null) {
            throw new HrBusinessException("RECRUITMENT_REQUEST_NOT_FOUND", "招聘需求不存在");
        }

        // 2. 转换为VO
        RecruitmentRequestVO vo = new RecruitmentRequestVO();
        BeanUtils.copyProperties(request, vo);
        vo.setHiredCount(countHiredCandidates(request.getId()));

        // 3. 填充部门名称
        fillDeptName(vo);

        // 4. 填充职位名称
        if (request.getPositionId() != null) {
            Position position = positionMapper.selectById(request.getPositionId());
            if (position != null) {
                vo.setPositionName(position.getPositionName());
            }
        }

        // 5. 填充状态描述
        vo.setStatusDesc(getStatusDesc(request.getStatus()));

        return vo;
    }

    @Override
    public Page<RecruitmentRequestVO> listRecruitmentRequests(RecruitmentRequestQueryDTO query) {
        log.info("分页查询招聘需求列表，查询条件：{}", query);

        // 1. 构建查询条件
        LambdaQueryWrapper<RecruitmentRequest> wrapper = Wrappers.lambdaQuery(RecruitmentRequest.class);
        
        if (query.getDeptId() != null) {
            wrapper.eq(RecruitmentRequest::getDeptId, query.getDeptId());
        }
        if (query.getPositionId() != null) {
            wrapper.eq(RecruitmentRequest::getPositionId, query.getPositionId());
        }
        if (query.getStatus() != null && !query.getStatus().isEmpty()) {
            wrapper.eq(RecruitmentRequest::getStatus, query.getStatus());
        }
        
        wrapper.orderByDesc(RecruitmentRequest::getCreateTime);

        // 2. 分页查询
        Page<RecruitmentRequest> page = new Page<>(query.getPageNum(), query.getPageSize());
        Page<RecruitmentRequest> requestPage = recruitmentRequestMapper.selectPage(page, wrapper);

        // 3. 转换为VO
        Page<RecruitmentRequestVO> voPage = new Page<>(requestPage.getCurrent(), requestPage.getSize(), requestPage.getTotal());
        voPage.setRecords(requestPage.getRecords().stream().map(request -> {
            RecruitmentRequestVO vo = new RecruitmentRequestVO();
            BeanUtils.copyProperties(request, vo);
            vo.setHiredCount(countHiredCandidates(request.getId()));
            
            // 填充部门名称
            fillDeptName(vo);
            
            // 填充职位名称
            if (request.getPositionId() != null) {
                Position position = positionMapper.selectById(request.getPositionId());
                if (position != null) {
                    vo.setPositionName(position.getPositionName());
                }
            }
            
            // 填充状态描述
            vo.setStatusDesc(getStatusDesc(request.getStatus()));
            
            return vo;
        }).collect(java.util.stream.Collectors.toList()));

        return voPage;
    }

    // ==================== 私有方法 ====================

    /**
     * 生成需求编号
     */
    private String generateRequestNo() {
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String random = String.format("%04d", new Random().nextInt(10000));
        return "RR" + date + random;
    }

    /**
     * 验证部门ID
     */
    private void validateDeptId(Long deptId) {
        try {
            R<DeptVO> result = authServiceClient.getDeptById(deptId);
            if (!result.isSuccess() || result.getData() == null) {
                throw HrBusinessException.invalidDeptOrPost("DEPT", deptId);
            }
        } catch (Exception e) {
            log.error("验证部门ID失败，deptId：{}", deptId, e);
            throw new HrSystemException("VALIDATE_DEPT_FAILED", "验证部门ID失败", e);
        }
    }

    /**
     * 填充部门名称
     */
    private void fillDeptName(RecruitmentRequestVO vo) {
        if (vo.getDeptId() != null) {
            try {
                R<DeptVO> deptResult = authServiceClient.getDeptById(vo.getDeptId());
                if (deptResult.isSuccess() && deptResult.getData() != null) {
                    vo.setDeptName(deptResult.getData().getDeptName());
                }
            } catch (Exception e) {
                log.warn("获取部门名称失败，deptId：{}", vo.getDeptId(), e);
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
            case "RECRUITING":
                return "招聘中";
            case "COMPLETED":
                return "已完成";
            case "CANCELLED":
                return "已取消";
            default:
                return status;
        }
    }

    /**
     * 统计某个招聘需求下已入职候选人数，避免依赖可能滞后的冗余字段。
     */
    private int countHiredCandidates(Long requestId) {
        if (requestId == null) {
            return 0;
        }

        LambdaQueryWrapper<Candidate> wrapper = Wrappers.lambdaQuery(Candidate.class)
                .eq(Candidate::getRequestId, requestId)
                .eq(Candidate::getStatus, "HIRED");
        Long count = candidateMapper.selectCount(wrapper);
        return count == null ? 0 : count.intValue();
    }
}
