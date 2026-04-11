package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.OfferCreateDTO;
import com.cloudflow.hr.domain.dto.OfferQueryDTO;
import com.cloudflow.hr.domain.dto.OnboardingApplicationCreateDTO;
import com.cloudflow.hr.domain.entity.Candidate;
import com.cloudflow.hr.domain.entity.Offer;
import com.cloudflow.hr.domain.entity.OnboardingApplication;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.vo.OfferVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.CandidateMapper;
import com.cloudflow.hr.mapper.OnboardingApplicationMapper;
import com.cloudflow.hr.mapper.OfferMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.service.OfferService;
import com.cloudflow.hr.service.OnboardingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Offer 服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OfferServiceImpl implements OfferService {

    private static final Map<String, String> OFFER_STATUS_MAP = new HashMap<>();
    private static final List<String> ACTIVE_OFFER_STATUSES = List.of("DRAFT", "APPROVING", "APPROVED", "SENT", "ACCEPTED");

    static {
        OFFER_STATUS_MAP.put("DRAFT", "草稿");
        OFFER_STATUS_MAP.put("APPROVING", "审批中");
        OFFER_STATUS_MAP.put("APPROVED", "已通过");
        OFFER_STATUS_MAP.put("SENT", "已发送");
        OFFER_STATUS_MAP.put("ACCEPTED", "已接受");
        OFFER_STATUS_MAP.put("REJECTED", "已拒绝");
        OFFER_STATUS_MAP.put("EXPIRED", "已过期");
    }

    private final OfferMapper offerMapper;
    private final CandidateMapper candidateMapper;
    private final PositionMapper positionMapper;
    private final OnboardingApplicationMapper onboardingApplicationMapper;
    private final AuthServiceClient authServiceClient;
    private final WorkflowServiceClient workflowServiceClient;
    private final OnboardingService onboardingService;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createOffer(OfferCreateDTO dto) {
        log.info("创建 Offer，候选人ID：{}，职位ID：{}", dto.getCandidateId(), dto.getPositionId());

        Candidate candidate = candidateMapper.selectById(dto.getCandidateId());
        if (candidate == null) {
            throw new HrBusinessException("CANDIDATE_NOT_FOUND", "候选人不存在");
        }
        if (!"INTERVIEW".equals(candidate.getStatus())) {
            throw new HrBusinessException("INVALID_CANDIDATE_STATUS", "只有面试中的候选人才能创建 Offer");
        }

        Offer existingOffer = findActiveOfferByCandidateId(candidate.getId());
        if (existingOffer != null) {
            throw new HrBusinessException("OFFER_ALREADY_EXISTS",
                    String.format("候选人已存在进行中的 Offer：%s", existingOffer.getOfferNo()));
        }

        OnboardingApplication existingApplication = findExistingOnboardingApplication(candidate.getId());
        if (existingApplication != null) {
            throw new HrBusinessException("ONBOARDING_ALREADY_EXISTS",
                    String.format("候选人已存在入职申请 #%d，不能重复创建 Offer", existingApplication.getId()));
        }

        Position position = positionMapper.selectById(dto.getPositionId());
        if (position == null) {
            throw new HrBusinessException("POSITION_NOT_FOUND", "职位不存在");
        }

        if (dto.getExpiryDate().isBefore(dto.getExpectedDate())) {
            throw new HrBusinessException("INVALID_OFFER_DATE", "Offer 有效期不能早于预计入职日期");
        }

        Offer offer = new Offer();
        BeanUtils.copyProperties(dto, offer);
        offer.setTenantId(candidate.getTenantId());
        offer.setOfferNo(generateOfferNo());
        offer.setStatus("DRAFT");

        offerMapper.insert(offer);
        log.info("Offer 创建成功，ID：{}，编号：{}", offer.getId(), offer.getOfferNo());
        return offer.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitOffer(Long id) {
        log.info("提交 Offer 审批，ID：{}", id);

        Offer offer = offerMapper.selectById(id);
        if (offer == null) {
            throw new RuntimeException("Offer 不存在");
        }
        if (!"DRAFT".equals(offer.getStatus())) {
            throw new RuntimeException("只有草稿状态的 Offer 才能提交审批");
        }

        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(offer.getTenantId());
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getOffer());
        processStartDTO.setBusinessType("OFFER");
        processStartDTO.setBusinessId(offer.getId());
        processStartDTO.setBusinessNo(offer.getOfferNo());
        processStartDTO.setProcessTitle("Offer审批-" + offer.getOfferNo());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        Map<String, Object> variables = new HashMap<>();
        variables.put("offerId", offer.getId());
        variables.put("offerNo", offer.getOfferNo());
        variables.put("candidateId", offer.getCandidateId());
        variables.put("salary", offer.getSalary());
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (result == null) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动 Offer 审批流程失败：Workflow 服务无响应");
            }
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动 Offer 审批流程失败：" + result.getMsg());
            }

            offer.setStatus("APPROVING");
            offer.setProcessInstanceId(result.getData());
            offerMapper.updateById(offer);
            log.info("Offer 审批流程启动成功，流程实例ID：{}", result.getData());
        } catch (HrSystemException e) {
            throw e;
        } catch (Exception e) {
            log.error("启动 Offer 审批流程失败，offerId：{}", id, e);
            throw new RuntimeException("启动审批流程失败：" + e.getMessage(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveOffer(Long id) {
        log.info("Offer 审批通过，ID：{}", id);

        Offer offer = offerMapper.selectById(id);
        if (offer == null) {
            throw new RuntimeException("Offer 不存在");
        }
        if (!"APPROVING".equals(offer.getStatus())) {
            throw new RuntimeException("只有审批中的 Offer 才能审批通过");
        }

        offer.setStatus("APPROVED");
        offerMapper.updateById(offer);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void sendOffer(Long id) {
        log.info("发送 Offer，ID：{}", id);

        Offer offer = offerMapper.selectById(id);
        if (offer == null) {
            throw new RuntimeException("Offer 不存在");
        }
        if (!"APPROVED".equals(offer.getStatus())) {
            throw new RuntimeException("只有已审批通过的 Offer 才能发送");
        }

        if (offer.getExpiryDate().isBefore(LocalDate.now())) {
            offer.setStatus("EXPIRED");
            offerMapper.updateById(offer);
            throw new RuntimeException("Offer 已过期，无法发送");
        }

        offer.setStatus("SENT");
        offerMapper.updateById(offer);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void acceptOffer(Long id) {
        log.info("候选人接受 Offer，ID：{}", id);

        Offer offer = offerMapper.selectById(id);
        if (offer == null) {
            throw new RuntimeException("Offer 不存在");
        }
        if (!"SENT".equals(offer.getStatus())) {
            throw new RuntimeException("只有已发送的 Offer 才能接受");
        }

        if (offer.getExpiryDate().isBefore(LocalDate.now())) {
            offer.setStatus("EXPIRED");
            offerMapper.updateById(offer);
            throw new RuntimeException("Offer 已过期");
        }

        offer.setStatus("ACCEPTED");
        offerMapper.updateById(offer);

        Candidate candidate = candidateMapper.selectById(offer.getCandidateId());
        if (candidate != null) {
            candidate.setStatus("OFFER");
            candidateMapper.updateById(candidate);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectOffer(Long id) {
        log.info("候选人拒绝 Offer，ID：{}", id);

        Offer offer = offerMapper.selectById(id);
        if (offer == null) {
            throw new RuntimeException("Offer 不存在");
        }

        if ("APPROVING".equals(offer.getStatus())) {
            offer.setStatus("REJECTED");
            offerMapper.updateById(offer);
            return;
        }

        if (!"SENT".equals(offer.getStatus())) {
            throw new RuntimeException("只有已发送或审批中的 Offer 才能拒绝");
        }

        offer.setStatus("REJECTED");
        offerMapper.updateById(offer);

        Candidate candidate = candidateMapper.selectById(offer.getCandidateId());
        if (candidate != null) {
            candidate.setStatus("REJECTED");
            candidate.setRejectReason("候选人拒绝 Offer");
            candidateMapper.updateById(candidate);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long convertToOnboarding(Long id) {
        log.info("将 Offer 转为入职流程，ID：{}", id);

        Offer offer = offerMapper.selectById(id);
        if (offer == null) {
            throw new RuntimeException("Offer 不存在");
        }
        if (!"ACCEPTED".equals(offer.getStatus())) {
            throw new RuntimeException("只有已接受的 Offer 才能转换为入职流程");
        }

        Candidate candidate = candidateMapper.selectById(offer.getCandidateId());
        if (candidate == null) {
            throw new RuntimeException("候选人不存在");
        }

        Position position = positionMapper.selectById(offer.getPositionId());
        if (position == null) {
            throw new RuntimeException("职位不存在");
        }

        OnboardingApplication existingApplication = findExistingOnboardingApplication(candidate.getId());
        if (existingApplication != null) {
            if (!"HIRED".equals(candidate.getStatus())) {
                candidate.setStatus("HIRED");
                candidateMapper.updateById(candidate);
            }
            log.warn("Offer 已存在入职申请，直接复用，offerId：{}，candidateId：{}，onboardingId：{}，status：{}",
                    id, candidate.getId(), existingApplication.getId(), existingApplication.getStatus());
            return existingApplication.getId();
        }

        OnboardingApplicationCreateDTO onboardingDTO = new OnboardingApplicationCreateDTO();
        onboardingDTO.setCandidateId(candidate.getId());
        onboardingDTO.setName(candidate.getName());
        onboardingDTO.setGender(candidate.getGender());
        onboardingDTO.setPhone(candidate.getPhone());
        onboardingDTO.setEmail(candidate.getEmail());
        onboardingDTO.setDeptId(offer.getDeptId());
        onboardingDTO.setPostId(position.getPostId());
        onboardingDTO.setPositionId(offer.getPositionId());
        onboardingDTO.setExpectedDate(offer.getExpectedDate());

        Long onboardingId = onboardingService.createOnboardingApplication(onboardingDTO);
        candidate.setStatus("HIRED");
        candidateMapper.updateById(candidate);
        return onboardingId;
    }

    private OnboardingApplication findExistingOnboardingApplication(Long candidateId) {
        LambdaQueryWrapper<OnboardingApplication> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OnboardingApplication::getCandidateId, candidateId)
                .ne(OnboardingApplication::getStatus, "REJECTED")
                .orderByDesc(OnboardingApplication::getId);

        return onboardingApplicationMapper.selectList(wrapper).stream()
                .max(Comparator
                        .comparingInt((OnboardingApplication application) -> getOnboardingStatusPriority(application.getStatus()))
                        .thenComparing(OnboardingApplication::getId, Comparator.nullsLast(Long::compareTo)))
                .orElse(null);
    }

    private Offer findActiveOfferByCandidateId(Long candidateId) {
        LambdaQueryWrapper<Offer> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Offer::getCandidateId, candidateId)
                .in(Offer::getStatus, ACTIVE_OFFER_STATUSES)
                .orderByDesc(Offer::getId);

        return offerMapper.selectList(wrapper).stream().findFirst().orElse(null);
    }

    private int getOnboardingStatusPriority(String status) {
        if ("ONBOARDED".equals(status)) {
            return 4;
        }
        if ("APPROVED".equals(status)) {
            return 3;
        }
        if ("APPROVING".equals(status)) {
            return 2;
        }
        if ("DRAFT".equals(status)) {
            return 1;
        }
        return 0;
    }

    @Override
    public List<OfferVO> listOffers(OfferQueryDTO query) {
        log.info("查询 Offer 列表，条件：{}", query);

        LambdaQueryWrapper<Offer> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(query.getCandidateId() != null, Offer::getCandidateId, query.getCandidateId())
                .eq(query.getDeptId() != null, Offer::getDeptId, query.getDeptId())
                .eq(query.getPositionId() != null, Offer::getPositionId, query.getPositionId())
                .eq(StringUtils.hasText(query.getStatus()), Offer::getStatus, query.getStatus())
                .orderByDesc(Offer::getCreateTime);

        return offerMapper.selectList(wrapper).stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    @Override
    public OfferVO getOffer(Long id) {
        log.info("查询 Offer 详情，ID：{}", id);

        Offer offer = offerMapper.selectById(id);
        if (offer == null) {
            throw new RuntimeException("Offer 不存在");
        }
        return convertToVO(offer);
    }

    private String generateOfferNo() {
        // 保留日期前缀便于人工识别，同时拼接雪花 ID 避免并发创建 Offer 时撞唯一索引。
        String dateStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        return "OFFER" + dateStr + IdUtils.snowflakeIdStr();
    }

    private OfferVO convertToVO(Offer offer) {
        OfferVO vo = new OfferVO();
        BeanUtils.copyProperties(offer, vo);
        vo.setStatusDesc(OFFER_STATUS_MAP.getOrDefault(offer.getStatus(), offer.getStatus()));

        Candidate candidate = candidateMapper.selectById(offer.getCandidateId());
        if (candidate != null) {
            vo.setCandidateName(candidate.getName());
        }

        if (offer.getDeptId() != null) {
            try {
                R<DeptVO> deptResult = authServiceClient.getDeptById(offer.getDeptId());
                if (deptResult != null && deptResult.isSuccess() && deptResult.getData() != null) {
                    vo.setDeptName(deptResult.getData().getDeptName());
                }
            } catch (Exception e) {
                log.warn("获取 Offer 部门名称失败，deptId：{}", offer.getDeptId(), e);
            }
        }

        Position position = positionMapper.selectById(offer.getPositionId());
        if (position != null) {
            vo.setPositionName(position.getPositionName());
        }

        return vo;
    }
}
