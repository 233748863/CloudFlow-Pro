package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.domain.dto.CandidateCreateDTO;
import com.cloudflow.hr.domain.dto.CandidateQueryDTO;
import com.cloudflow.hr.domain.dto.CandidateUpdateDTO;
import com.cloudflow.hr.domain.entity.Candidate;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.RecruitmentRequest;
import com.cloudflow.hr.domain.vo.CandidateDetailVO;
import com.cloudflow.hr.domain.vo.CandidateVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.CandidateMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.mapper.RecruitmentRequestMapper;
import com.cloudflow.hr.service.CandidateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.List;

/**
 * 候选人服务实现类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CandidateServiceImpl implements CandidateService {

    private final CandidateMapper candidateMapper;
    private final RecruitmentRequestMapper recruitmentRequestMapper;
    private final PositionMapper positionMapper;
    private final AuthServiceClient authServiceClient;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createCandidate(CandidateCreateDTO dto) {
        log.info("创建候选人，招聘需求ID：{}，姓名：{}，手机号：{}", 
                dto.getRequestId(), dto.getName(), dto.getPhone());

        // 1. 获取租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 2. 验证招聘需求是否存在
        RecruitmentRequest request = recruitmentRequestMapper.selectById(dto.getRequestId());
        if (request == null) {
            throw new HrBusinessException("RECRUITMENT_REQUEST_NOT_FOUND", "招聘需求不存在");
        }

        // 3. 验证招聘需求状态（只有招聘中的需求才能添加候选人）
        if (!"RECRUITING".equals(request.getStatus())) {
            throw new HrBusinessException("INVALID_REQUEST_STATUS", "只有招聘中的需求才能添加候选人");
        }

        // 4. 验证手机号是否已存在（同一招聘需求下）
        LambdaQueryWrapper<Candidate> wrapper = Wrappers.lambdaQuery(Candidate.class)
                .eq(Candidate::getRequestId, dto.getRequestId())
                .eq(Candidate::getPhone, dto.getPhone());
        Long count = candidateMapper.selectCount(wrapper);
        if (count > 0) {
            throw new HrBusinessException("CANDIDATE_PHONE_EXISTS", "该手机号已在此招聘需求下存在");
        }

        // 5. 验证性别值
        if (StringUtils.hasText(dto.getGender())) {
            if (!Arrays.asList("MALE", "FEMALE").contains(dto.getGender())) {
                throw new HrBusinessException("INVALID_GENDER", "性别值无效，只能是MALE或FEMALE");
            }
        }

        // 6. 验证来源值
        if (StringUtils.hasText(dto.getSource())) {
            if (!Arrays.asList("WEBSITE", "REFERRAL", "HEADHUNTER", "CAMPUS").contains(dto.getSource())) {
                throw new HrBusinessException("INVALID_SOURCE", "来源值无效");
            }
        }

        // 7. 创建候选人记录
        Candidate candidate = new Candidate();
        BeanUtils.copyProperties(dto, candidate);
        candidate.setTenantId(tenantId);
        candidate.setStatus("NEW");

        candidateMapper.insert(candidate);

        log.info("候选人创建成功，候选人ID：{}", candidate.getId());
        return candidate.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateCandidate(Long id, CandidateUpdateDTO dto) {
        log.info("更新候选人信息，候选人ID：{}", id);

        // 1. 查询候选人
        Candidate candidate = candidateMapper.selectById(id);
        if (candidate == null) {
            throw new HrBusinessException("CANDIDATE_NOT_FOUND", "候选人不存在");
        }

        // 2. 验证性别值
        if (StringUtils.hasText(dto.getGender())) {
            if (!Arrays.asList("MALE", "FEMALE").contains(dto.getGender())) {
                throw new HrBusinessException("INVALID_GENDER", "性别值无效，只能是MALE或FEMALE");
            }
        }

        // 3. 验证来源值
        if (StringUtils.hasText(dto.getSource())) {
            if (!Arrays.asList("WEBSITE", "REFERRAL", "HEADHUNTER", "CAMPUS").contains(dto.getSource())) {
                throw new HrBusinessException("INVALID_SOURCE", "来源值无效");
            }
        }

        // 4. 更新候选人信息
        if (StringUtils.hasText(dto.getName())) {
            candidate.setName(dto.getName());
        }
        if (StringUtils.hasText(dto.getGender())) {
            candidate.setGender(dto.getGender());
        }
        if (StringUtils.hasText(dto.getPhone())) {
            candidate.setPhone(dto.getPhone());
        }
        if (StringUtils.hasText(dto.getEmail())) {
            candidate.setEmail(dto.getEmail());
        }
        if (StringUtils.hasText(dto.getResumeUrl())) {
            candidate.setResumeUrl(dto.getResumeUrl());
        }
        if (StringUtils.hasText(dto.getSource())) {
            candidate.setSource(dto.getSource());
        }

        candidateMapper.updateById(candidate);

        log.info("候选人信息更新成功，候选人ID：{}", id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateCandidateStatus(Long id, String status, String rejectReason) {
        log.info("更新候选人状态，候选人ID：{}，新状态：{}", id, status);

        // 1. 查询候选人
        Candidate candidate = candidateMapper.selectById(id);
        if (candidate == null) {
            throw new HrBusinessException("CANDIDATE_NOT_FOUND", "候选人不存在");
        }

        // 2. 验证状态值
        List<String> validStatuses = Arrays.asList("NEW", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED");
        if (!validStatuses.contains(status)) {
            throw new HrBusinessException("INVALID_STATUS", "状态值无效");
        }

        // 3. 验证拒绝原因（状态为REJECTED时必填）
        if ("REJECTED".equals(status) && !StringUtils.hasText(rejectReason)) {
            throw new HrBusinessException("REJECT_REASON_REQUIRED", "拒绝原因不能为空");
        }

        // 4. 更新候选人状态
        candidate.setStatus(status);
        if ("REJECTED".equals(status)) {
            candidate.setRejectReason(rejectReason);
        }

        candidateMapper.updateById(candidate);

        log.info("候选人状态更新成功，候选人ID：{}，新状态：{}", id, status);
    }

    @Override
    public CandidateDetailVO getCandidate(Long id) {
        log.info("查询候选人详情，候选人ID：{}", id);

        // 1. 查询候选人
        Candidate candidate = candidateMapper.selectById(id);
        if (candidate == null) {
            throw new HrBusinessException("CANDIDATE_NOT_FOUND", "候选人不存在");
        }

        // 2. 转换为VO
        CandidateDetailVO vo = new CandidateDetailVO();
        BeanUtils.copyProperties(candidate, vo);

        // 3. 填充招聘需求信息
        if (candidate.getRequestId() != null) {
            RecruitmentRequest request = recruitmentRequestMapper.selectById(candidate.getRequestId());
            if (request != null) {
                vo.setRequestNo(request.getRequestNo());
                vo.setDeptId(request.getDeptId());
                vo.setPositionId(request.getPositionId());
                vo.setSalaryMin(request.getSalaryMin());
                vo.setSalaryMax(request.getSalaryMax());
                vo.setExpectedDate(request.getExpectedDate());

                // 填充部门名称
                fillDeptName(vo, request.getDeptId());

                // 填充职位名称
                if (request.getPositionId() != null) {
                    Position position = positionMapper.selectById(request.getPositionId());
                    if (position != null) {
                        vo.setPositionName(position.getPositionName());
                    }
                }
            }
        }

        // 4. 填充描述信息
        vo.setGenderDesc(getGenderDesc(candidate.getGender()));
        vo.setSourceDesc(getSourceDesc(candidate.getSource()));
        vo.setStatusDesc(getStatusDesc(candidate.getStatus()));

        return vo;
    }

    @Override
    public Page<CandidateVO> listCandidates(CandidateQueryDTO query) {
        log.info("分页查询候选人列表，查询条件：{}", query);

        // 1. 构建查询条件
        LambdaQueryWrapper<Candidate> wrapper = Wrappers.lambdaQuery(Candidate.class);

        if (query.getRequestId() != null) {
            wrapper.eq(Candidate::getRequestId, query.getRequestId());
        }
        if (StringUtils.hasText(query.getName())) {
            wrapper.like(Candidate::getName, query.getName());
        }
        if (StringUtils.hasText(query.getPhone())) {
            wrapper.eq(Candidate::getPhone, query.getPhone());
        }
        if (StringUtils.hasText(query.getEmail())) {
            wrapper.eq(Candidate::getEmail, query.getEmail());
        }
        if (StringUtils.hasText(query.getSource())) {
            wrapper.eq(Candidate::getSource, query.getSource());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(Candidate::getStatus, query.getStatus());
        }

        wrapper.orderByDesc(Candidate::getCreateTime);

        // 2. 分页查询
        Page<Candidate> page = new Page<>(query.getPageNum(), query.getPageSize());
        Page<Candidate> candidatePage = candidateMapper.selectPage(page, wrapper);

        // 3. 转换为VO
        Page<CandidateVO> voPage = new Page<>(candidatePage.getCurrent(), candidatePage.getSize(), candidatePage.getTotal());
        voPage.setRecords(candidatePage.getRecords().stream().map(candidate -> {
            CandidateVO vo = new CandidateVO();
            BeanUtils.copyProperties(candidate, vo);

            // 填充招聘需求信息
            if (candidate.getRequestId() != null) {
                RecruitmentRequest request = recruitmentRequestMapper.selectById(candidate.getRequestId());
                if (request != null) {
                    vo.setRequestNo(request.getRequestNo());

                    // 填充职位名称
                    if (request.getPositionId() != null) {
                        Position position = positionMapper.selectById(request.getPositionId());
                        if (position != null) {
                            vo.setPositionName(position.getPositionName());
                        }
                    }
                }
            }

            // 填充描述信息
            vo.setGenderDesc(getGenderDesc(candidate.getGender()));
            vo.setSourceDesc(getSourceDesc(candidate.getSource()));
            vo.setStatusDesc(getStatusDesc(candidate.getStatus()));

            return vo;
        }).collect(java.util.stream.Collectors.toList()));

        return voPage;
    }

    // ==================== 私有方法 ====================

    /**
     * 填充部门名称
     */
    private void fillDeptName(CandidateDetailVO vo, Long deptId) {
        if (deptId != null) {
            try {
                R<DeptVO> deptResult = authServiceClient.getDeptById(deptId);
                if (deptResult.isSuccess() && deptResult.getData() != null) {
                    vo.setDeptName(deptResult.getData().getDeptName());
                }
            } catch (Exception e) {
                log.warn("获取部门名称失败，deptId：{}", deptId, e);
            }
        }
    }

    /**
     * 获取性别描述
     */
    private String getGenderDesc(String gender) {
        if (gender == null) {
            return null;
        }
        switch (gender) {
            case "MALE":
                return "男";
            case "FEMALE":
                return "女";
            default:
                return gender;
        }
    }

    /**
     * 获取来源描述
     */
    private String getSourceDesc(String source) {
        if (source == null) {
            return null;
        }
        switch (source) {
            case "WEBSITE":
                return "官网";
            case "REFERRAL":
                return "内推";
            case "HEADHUNTER":
                return "猎头";
            case "CAMPUS":
                return "校招";
            default:
                return source;
        }
    }

    /**
     * 获取状态描述
     */
    private String getStatusDesc(String status) {
        if (status == null) {
            return null;
        }
        switch (status) {
            case "NEW":
                return "新简历";
            case "SCREENING":
                return "筛选中";
            case "INTERVIEW":
                return "面试中";
            case "OFFER":
                return "已发Offer";
            case "HIRED":
                return "已入职";
            case "REJECTED":
                return "已拒绝";
            default:
                return status;
        }
    }
}
