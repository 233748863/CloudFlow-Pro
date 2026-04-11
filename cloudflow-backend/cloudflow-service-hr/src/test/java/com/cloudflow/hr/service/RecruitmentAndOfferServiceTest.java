package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.OfferCreateDTO;
import com.cloudflow.hr.domain.dto.RecruitmentRequestCreateDTO;
import com.cloudflow.hr.domain.entity.Candidate;
import com.cloudflow.hr.domain.entity.Offer;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.RecruitmentRequest;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.CandidateMapper;
import com.cloudflow.hr.mapper.OnboardingApplicationMapper;
import com.cloudflow.hr.mapper.OfferMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.mapper.RecruitmentRequestMapper;
import com.cloudflow.hr.service.impl.OfferServiceImpl;
import com.cloudflow.hr.service.impl.RecruitmentRequestServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 招聘需求与 Offer 主线功能测试。
 */
@ExtendWith(MockitoExtension.class)
class RecruitmentAndOfferServiceTest {

    @Mock
    private RecruitmentRequestMapper recruitmentRequestMapper;

    @Mock
    private PositionMapper positionMapper;

    @Mock
    private AuthServiceClient authServiceClient;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    @Mock
    private OfferMapper offerMapper;

    @Mock
    private CandidateMapper candidateMapper;

    @Mock
    private OnboardingApplicationMapper onboardingApplicationMapper;

    @Mock
    private OnboardingService onboardingService;

    private RecruitmentRequestService recruitmentRequestService;
    private OfferService offerService;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(2001L);

        recruitmentRequestService = new RecruitmentRequestServiceImpl(
                recruitmentRequestMapper,
                candidateMapper,
                positionMapper,
                authServiceClient,
                workflowServiceClient,
                workflowProcessKeyProperties
        );
        offerService = new OfferServiceImpl(
                offerMapper,
                candidateMapper,
                positionMapper,
                onboardingApplicationMapper,
                authServiceClient,
                workflowServiceClient,
                onboardingService,
                workflowProcessKeyProperties
        );
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void testCreateRecruitmentRequestSuccess() {
        AtomicReference<RecruitmentRequest> stored = new AtomicReference<>();
        when(authServiceClient.getDeptById(101L)).thenReturn(R.ok(buildDept(101L, "技术部")));
        when(positionMapper.selectById(301L)).thenReturn(buildPosition(301L, 201L, "Java开发工程师"));
        when(recruitmentRequestMapper.insert(any(RecruitmentRequest.class))).thenAnswer(invocation -> {
            RecruitmentRequest request = invocation.getArgument(0);
            request.setId(11L);
            stored.set(request);
            return 1;
        });

        RecruitmentRequestCreateDTO dto = new RecruitmentRequestCreateDTO();
        dto.setDeptId(101L);
        dto.setPositionId(301L);
        dto.setHeadcount(3);
        dto.setJobRequirements("3年以上Java经验");
        dto.setSalaryMin(new BigDecimal("15000"));
        dto.setSalaryMax(new BigDecimal("25000"));
        dto.setExpectedDate(LocalDate.of(2026, 5, 1));

        Long requestId = recruitmentRequestService.createRecruitmentRequest(dto);

        assertEquals(11L, requestId);
        assertEquals("DRAFT", stored.get().getStatus());
        assertEquals(Integer.valueOf(0), stored.get().getHiredCount());
        assertTrue(stored.get().getRequestNo().startsWith("RR"));
        assertTrue(stored.get().getRequestNo().length() > 18);
    }

    @Test
    void testSubmitAndApproveRecruitmentRequestSuccess() {
        RecruitmentRequest request = buildRecruitmentRequest("DRAFT");
        when(recruitmentRequestMapper.selectById(11L)).thenReturn(request);
        when(positionMapper.selectById(301L)).thenReturn(buildPosition(301L, 201L, "Java开发工程师"));
        when(workflowProcessKeyProperties.getRecruitmentRequest()).thenReturn("biz_recruit");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-recruit-001"));

        recruitmentRequestService.submitRecruitmentRequest(11L);
        assertEquals("APPROVING", request.getStatus());
        assertEquals("proc-recruit-001", request.getProcessInstanceId());

        recruitmentRequestService.approveRecruitmentRequest(11L);
        assertEquals("RECRUITING", request.getStatus());
    }

    @Test
    void testSubmitRecruitmentRequestRejectsWhenWorkflowServiceReturnsNull() {
        RecruitmentRequest request = buildRecruitmentRequest("DRAFT");
        when(recruitmentRequestMapper.selectById(11L)).thenReturn(request);
        when(positionMapper.selectById(301L)).thenReturn(buildPosition(301L, 201L, "Java寮€鍙戝伐绋嬪笀"));
        when(workflowProcessKeyProperties.getRecruitmentRequest()).thenReturn("biz_recruit");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(null);

        HrSystemException exception = assertThrows(
                HrSystemException.class,
                () -> recruitmentRequestService.submitRecruitmentRequest(11L)
        );

        assertTrue(exception.getMessage().contains("Workflow 服务无响应"));
    }

    @Test
    void testCreateOfferSuccess() {
        AtomicReference<Offer> stored = new AtomicReference<>();
        when(candidateMapper.selectById(501L)).thenReturn(buildCandidate());
        when(positionMapper.selectById(301L)).thenReturn(buildPosition(301L, 201L, "Java开发工程师"));
        when(offerMapper.insert(any(Offer.class))).thenAnswer(invocation -> {
            Offer offer = invocation.getArgument(0);
            offer.setId(21L);
            stored.set(offer);
            return 1;
        });

        OfferCreateDTO dto = new OfferCreateDTO();
        dto.setCandidateId(501L);
        dto.setDeptId(101L);
        dto.setPositionId(301L);
        dto.setSalary(new BigDecimal("22000"));
        dto.setExpectedDate(LocalDate.of(2026, 5, 10));
        dto.setExpiryDate(LocalDate.of(2026, 5, 20));
        dto.setOfferContent("标准 Offer");

        Long offerId = offerService.createOffer(dto);

        assertEquals(21L, offerId);
        assertEquals("DRAFT", stored.get().getStatus());
        assertEquals(2001L, stored.get().getTenantId());
        assertTrue(stored.get().getOfferNo().startsWith("OFFER"));
        assertTrue(stored.get().getOfferNo().length() > 20);
    }

    @Test
    void testSubmitApproveSendAcceptAndConvertOfferSuccess() {
        Offer offer = buildOffer("DRAFT");
        Candidate candidate = buildCandidate();
        Position position = buildPosition(301L, 201L, "Java开发工程师");

        when(offerMapper.selectById(21L)).thenReturn(offer);
        when(workflowProcessKeyProperties.getOffer()).thenReturn("offer_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-offer-001"));
        when(candidateMapper.selectById(501L)).thenReturn(candidate);
        when(positionMapper.selectById(301L)).thenReturn(position);
        when(onboardingService.createOnboardingApplication(any())).thenReturn(77L);

        offerService.submitOffer(21L);
        assertEquals("APPROVING", offer.getStatus());
        assertEquals("proc-offer-001", offer.getProcessInstanceId());

        offerService.approveOffer(21L);
        assertEquals("APPROVED", offer.getStatus());

        offerService.sendOffer(21L);
        assertEquals("SENT", offer.getStatus());

        offerService.acceptOffer(21L);
        assertEquals("ACCEPTED", offer.getStatus());
        assertEquals("OFFER", candidate.getStatus());

        Long onboardingId = offerService.convertToOnboarding(21L);
        assertEquals(77L, onboardingId);
        assertEquals("HIRED", candidate.getStatus());
        verify(onboardingService, times(1)).createOnboardingApplication(any());
    }

    @Test
    void testSubmitOfferRejectsWhenWorkflowServiceReturnsNull() {
        Offer offer = buildOffer("DRAFT");
        when(offerMapper.selectById(21L)).thenReturn(offer);
        when(workflowProcessKeyProperties.getOffer()).thenReturn("offer_approval");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(null);

        HrSystemException exception = assertThrows(
                HrSystemException.class,
                () -> offerService.submitOffer(21L)
        );

        assertTrue(exception.getMessage().contains("Workflow 服务无响应"));
    }

    @Test
    void testRejectOfferFromApprovalFlowSuccess() {
        Offer offer = buildOffer("APPROVING");
        when(offerMapper.selectById(21L)).thenReturn(offer);

        offerService.rejectOffer(21L);

        assertEquals("REJECTED", offer.getStatus());
        verify(offerMapper, times(1)).updateById(offer);
    }

    private RecruitmentRequest buildRecruitmentRequest(String status) {
        RecruitmentRequest request = new RecruitmentRequest();
        request.setId(11L);
        request.setTenantId(2001L);
        request.setRequestNo("RR202603220001");
        request.setDeptId(101L);
        request.setPositionId(301L);
        request.setHeadcount(3);
        request.setSalaryMin(new BigDecimal("15000"));
        request.setSalaryMax(new BigDecimal("25000"));
        request.setStatus(status);
        request.setHiredCount(0);
        return request;
    }

    private Candidate buildCandidate() {
        Candidate candidate = new Candidate();
        candidate.setId(501L);
        candidate.setTenantId(2001L);
        candidate.setName("候选人A");
        candidate.setGender("MALE");
        candidate.setPhone("13900000000");
        candidate.setEmail("candidate@test.com");
        candidate.setStatus("INTERVIEW");
        return candidate;
    }

    private Offer buildOffer(String status) {
        Offer offer = new Offer();
        offer.setId(21L);
        offer.setTenantId(2001L);
        offer.setOfferNo("OFFER20260322000001");
        offer.setCandidateId(501L);
        offer.setDeptId(101L);
        offer.setPositionId(301L);
        offer.setSalary(new BigDecimal("22000"));
        offer.setExpectedDate(LocalDate.of(2026, 5, 10));
        offer.setExpiryDate(LocalDate.now().plusDays(10));
        offer.setStatus(status);
        return offer;
    }

    private Position buildPosition(Long id, Long postId, String name) {
        Position position = new Position();
        position.setId(id);
        position.setPostId(postId);
        position.setPositionName(name);
        return position;
    }

    private DeptVO buildDept(Long deptId, String deptName) {
        DeptVO dept = new DeptVO();
        dept.setDeptId(deptId);
        dept.setDeptName(deptName);
        return dept;
    }
}
