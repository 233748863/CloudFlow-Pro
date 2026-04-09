package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.LeaveApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.LeaveQuotaAdjustDTO;
import com.cloudflow.hr.domain.dto.OvertimeApplicationCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.LeaveApplication;
import com.cloudflow.hr.domain.entity.LeaveQuota;
import com.cloudflow.hr.domain.entity.LeaveType;
import com.cloudflow.hr.domain.entity.OvertimeApplication;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.InsufficientQuotaException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.LeaveApplicationMapper;
import com.cloudflow.hr.mapper.LeaveQuotaMapper;
import com.cloudflow.hr.mapper.LeaveTypeMapper;
import com.cloudflow.hr.domain.vo.LeaveQuotaVO;
import com.cloudflow.hr.mapper.OvertimeApplicationMapper;
import com.cloudflow.hr.service.impl.LeaveServiceImpl;
import com.cloudflow.hr.service.impl.OvertimeServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 请假和加班主线功能测试。
 */
@ExtendWith(MockitoExtension.class)
class LeaveAndOvertimeServiceTest {

    @Mock
    private LeaveTypeMapper leaveTypeMapper;

    @Mock
    private LeaveQuotaMapper leaveQuotaMapper;

    @Mock
    private LeaveApplicationMapper leaveApplicationMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    @Mock
    private WorkflowServiceClient workflowServiceClient;

    @Mock
    private OvertimeApplicationMapper overtimeApplicationMapper;

    @Mock
    private HrWorkflowProcessKeyProperties workflowProcessKeyProperties;

    private LeaveService leaveService;
    private OvertimeService overtimeService;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(2001L);

        leaveService = new LeaveServiceImpl(
                leaveTypeMapper,
                leaveQuotaMapper,
                leaveApplicationMapper,
                employeeMapper,
                workflowServiceClient,
                new ObjectMapper(),
                workflowProcessKeyProperties
        );
        overtimeService = new OvertimeServiceImpl(
                overtimeApplicationMapper,
                employeeMapper,
                leaveTypeMapper,
                leaveQuotaMapper,
                workflowServiceClient,
                workflowProcessKeyProperties,
                new ObjectMapper()
        );
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void testCreateLeaveApplicationSuccess() {
        AtomicReference<LeaveApplication> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(buildLeaveQuota(new BigDecimal("10.00"), BigDecimal.ZERO, BigDecimal.ZERO));
        when(leaveApplicationMapper.insert(any(LeaveApplication.class))).thenAnswer(invocation -> {
            LeaveApplication application = invocation.getArgument(0);
            application.setId(11L);
            stored.set(application);
            return 1;
        });

        LeaveApplicationCreateDTO dto = buildLeaveCreateDto();
        Long applicationId = leaveService.createLeaveApplication(dto);

        assertEquals(11L, applicationId);
        assertEquals("DRAFT", stored.get().getStatus());
        assertTrue(stored.get().getApplicationNo().startsWith("LEAVE"));
        assertEquals(new BigDecimal("2.00"), stored.get().getDuration());
    }

    @Test
    void testSubmitLeaveApplicationFreezesQuotaAndStartsWorkflow() {
        LeaveApplication application = buildLeaveApplication("DRAFT");
        LeaveQuota quota = buildLeaveQuota(new BigDecimal("10.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);
        when(workflowProcessKeyProperties.getLeave()).thenReturn("leave_request");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-leave-001"));

        leaveService.submitLeaveApplication(11L);

        ArgumentCaptor<ProcessStartDTO> processCaptor = ArgumentCaptor.forClass(ProcessStartDTO.class);
        verify(workflowServiceClient, times(1)).startProcess(processCaptor.capture());
        ProcessStartDTO processStartDTO = processCaptor.getValue();

        assertEquals("leave_request", processStartDTO.getProcessDefinitionKey());
        assertEquals("LEAVE", processStartDTO.getBusinessType());
        assertEquals(11L, processStartDTO.getBusinessId());
        assertEquals("请假申请-LEAVE202603220001", processStartDTO.getProcessTitle());
        assertEquals("APPROVING", application.getStatus());
        assertEquals("proc-leave-001", application.getProcessInstanceId());
        assertEquals(new BigDecimal("2.00"), quota.getFrozenQuota());
        assertEquals(new BigDecimal("8.00"), quota.getAvailableQuota());
    }

    @Test
    void testApproveLeaveApplicationConsumesFrozenQuota() {
        LeaveApplication application = buildLeaveApplication("APPROVING");
        LeaveQuota quota = buildLeaveQuota(new BigDecimal("10.00"), BigDecimal.ZERO, new BigDecimal("2.00"));
        quota.setAvailableQuota(new BigDecimal("8.00"));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);

        leaveService.approveLeaveApplication(11L);

        assertEquals("APPROVED", application.getStatus());
        assertEquals(BigDecimal.ZERO.setScale(2), quota.getFrozenQuota().setScale(2));
        assertEquals(new BigDecimal("2.00"), quota.getUsedQuota());
    }

    @Test
    void testRejectLeaveApplicationReleasesFrozenQuota() {
        LeaveApplication application = buildLeaveApplication("APPROVING");
        LeaveQuota quota = buildLeaveQuota(new BigDecimal("10.00"), BigDecimal.ZERO, new BigDecimal("2.00"));
        quota.setAvailableQuota(new BigDecimal("8.00"));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);

        leaveService.rejectLeaveApplication(11L);

        assertEquals("REJECTED", application.getStatus());
        assertEquals(BigDecimal.ZERO.setScale(2), quota.getFrozenQuota().setScale(2));
        assertEquals(new BigDecimal("10.00"), quota.getAvailableQuota());
    }

    @Test
    void testCreateLeaveApplicationValidatesCrossYearQuotaByYear() {
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any()))
                .thenReturn(buildLeaveQuotaForYear(2026, new BigDecimal("5.00"), BigDecimal.ZERO, BigDecimal.ZERO))
                .thenReturn(buildLeaveQuotaForYear(2027, new BigDecimal("0.50"), BigDecimal.ZERO, BigDecimal.ZERO));

        InsufficientQuotaException exception = assertThrows(
                InsufficientQuotaException.class,
                () -> leaveService.createLeaveApplication(buildCrossYearLeaveCreateDto())
        );

        assertTrue(exception.getMessage().contains("2027"));
    }

    @Test
    void testSubmitLeaveApplicationSplitsCrossYearQuotaFreeze() {
        LeaveApplication application = buildCrossYearLeaveApplication("DRAFT");
        LeaveQuota quota2026 = buildLeaveQuotaForYear(2026, new BigDecimal("5.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        LeaveQuota quota2027 = buildLeaveQuotaForYear(2027, new BigDecimal("5.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any()))
                .thenReturn(quota2026)
                .thenReturn(quota2027)
                .thenReturn(quota2026)
                .thenReturn(quota2027);
        when(workflowProcessKeyProperties.getLeave()).thenReturn("leave_request");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-leave-cross-year"));

        leaveService.submitLeaveApplication(11L);

        assertEquals("APPROVING", application.getStatus());
        assertEquals(new BigDecimal("1.00"), quota2026.getFrozenQuota());
        assertEquals(new BigDecimal("1.00"), quota2027.getFrozenQuota());
        assertEquals(new BigDecimal("4.00"), quota2026.getAvailableQuota());
        assertEquals(new BigDecimal("4.00"), quota2027.getAvailableQuota());
    }

    @Test
    void testApproveLeaveApplicationConsumesCrossYearFrozenQuota() {
        LeaveApplication application = buildCrossYearLeaveApplication("APPROVING");
        LeaveQuota quota2026 = buildLeaveQuotaForYear(2026, new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("1.00"));
        LeaveQuota quota2027 = buildLeaveQuotaForYear(2027, new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("1.00"));
        quota2026.setAvailableQuota(new BigDecimal("4.00"));
        quota2027.setAvailableQuota(new BigDecimal("4.00"));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any()))
                .thenReturn(quota2026)
                .thenReturn(quota2027);

        leaveService.approveLeaveApplication(11L);

        assertEquals("APPROVED", application.getStatus());
        assertEquals(BigDecimal.ZERO.setScale(2), quota2026.getFrozenQuota().setScale(2));
        assertEquals(BigDecimal.ZERO.setScale(2), quota2027.getFrozenQuota().setScale(2));
        assertEquals(new BigDecimal("1.00"), quota2026.getUsedQuota());
        assertEquals(new BigDecimal("1.00"), quota2027.getUsedQuota());
    }

    @Test
    void testCancelApprovedLeaveApplicationRestoresCrossYearUsedQuota() {
        LeaveApplication application = buildCrossYearLeaveApplication("APPROVED");
        LeaveQuota quota2026 = buildLeaveQuotaForYear(2026, new BigDecimal("5.00"), new BigDecimal("1.00"), BigDecimal.ZERO);
        LeaveQuota quota2027 = buildLeaveQuotaForYear(2027, new BigDecimal("5.00"), new BigDecimal("1.00"), BigDecimal.ZERO);
        quota2026.setAvailableQuota(new BigDecimal("4.00"));
        quota2027.setAvailableQuota(new BigDecimal("4.00"));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectOne(any()))
                .thenReturn(quota2026)
                .thenReturn(quota2027);

        leaveService.cancelLeaveApplication(11L);

        assertEquals("CANCELLED", application.getStatus());
        assertEquals(BigDecimal.ZERO.setScale(2), quota2026.getUsedQuota().setScale(2));
        assertEquals(BigDecimal.ZERO.setScale(2), quota2027.getUsedQuota().setScale(2));
        assertEquals(new BigDecimal("5.00"), quota2026.getAvailableQuota());
        assertEquals(new BigDecimal("5.00"), quota2027.getAvailableQuota());
    }

    @Test
    void testCreateCompensatoryLeaveApplicationRejectsWhenActiveQuotaInsufficient() {
        LeaveQuota activeQuota = buildLeaveQuotaForYear(2026, new BigDecimal("1.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        activeQuota.setId(802L);
        activeQuota.setLeaveTypeId(401L);
        activeQuota.setExpiryDate(LocalDate.of(2026, 5, 31));

        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(java.util.List.of(activeQuota));

        InsufficientQuotaException exception = assertThrows(
                InsufficientQuotaException.class,
                () -> leaveService.createLeaveApplication(buildCompensatoryLeaveCreateDto())
        );

        assertTrue(exception.getMessage().contains("调休"));
    }

    @Test
    void testSubmitCompensatoryLeaveApplicationFreezesEarliestExpiryBuckets() {
        LeaveApplication application = buildCompensatoryLeaveApplication("DRAFT");
        LeaveQuota firstBucket = buildLeaveQuotaForYear(2025, new BigDecimal("2.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        firstBucket.setId(801L);
        firstBucket.setLeaveTypeId(401L);
        firstBucket.setExpiryDate(LocalDate.of(2026, 4, 15));
        LeaveQuota secondBucket = buildLeaveQuotaForYear(2026, new BigDecimal("5.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        secondBucket.setId(802L);
        secondBucket.setLeaveTypeId(401L);
        secondBucket.setExpiryDate(LocalDate.of(2026, 5, 31));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(java.util.List.of(firstBucket, secondBucket));
        when(leaveQuotaMapper.selectById(801L)).thenReturn(firstBucket);
        when(leaveQuotaMapper.selectById(802L)).thenReturn(secondBucket);
        when(workflowProcessKeyProperties.getLeave()).thenReturn("leave_request");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-comp-leave-001"));

        leaveService.submitLeaveApplication(11L);

        assertEquals("APPROVING", application.getStatus());
        assertEquals(new BigDecimal("2.00"), firstBucket.getFrozenQuota());
        assertEquals(BigDecimal.ZERO.setScale(2), firstBucket.getAvailableQuota().setScale(2));
        assertEquals(new BigDecimal("1.00"), secondBucket.getFrozenQuota());
        assertEquals(new BigDecimal("4.00"), secondBucket.getAvailableQuota());
        assertNotNull(application.getQuotaAllocation());
        assertTrue(application.getQuotaAllocation().contains("801"));
        assertTrue(application.getQuotaAllocation().contains("802"));
    }

    @Test
    void testSubmitCompensatoryLeaveApplicationPrefersExpiringBucketBeforeNonExpiringBucket() {
        LeaveApplication application = buildCompensatoryLeaveApplication("DRAFT");
        LeaveQuota permanentBucket = buildLeaveQuotaForYear(2026, new BigDecimal("5.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        permanentBucket.setId(803L);
        permanentBucket.setLeaveTypeId(401L);
        permanentBucket.setExpiryDate(null);

        LeaveQuota expiringBucket = buildLeaveQuotaForYear(2025, new BigDecimal("2.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        expiringBucket.setId(804L);
        expiringBucket.setLeaveTypeId(401L);
        expiringBucket.setExpiryDate(LocalDate.of(2026, 4, 15));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(java.util.List.of(permanentBucket, expiringBucket));
        when(leaveQuotaMapper.selectById(803L)).thenReturn(permanentBucket);
        when(leaveQuotaMapper.selectById(804L)).thenReturn(expiringBucket);
        when(workflowProcessKeyProperties.getLeave()).thenReturn("leave_request");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-comp-leave-002"));

        leaveService.submitLeaveApplication(11L);

        assertEquals(new BigDecimal("2.00"), expiringBucket.getFrozenQuota());
        assertEquals(BigDecimal.ZERO.setScale(2), expiringBucket.getAvailableQuota().setScale(2));
        assertEquals(new BigDecimal("1.00"), permanentBucket.getFrozenQuota());
        assertEquals(new BigDecimal("4.00"), permanentBucket.getAvailableQuota());
    }

    @Test
    void testCreateCompensatoryLeaveApplicationRejectsQuotaExpiringBeforeLeaveEnds() {
        LeaveQuota expiringBucket = buildLeaveQuotaForYear(2026, new BigDecimal("4.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        expiringBucket.setId(805L);
        expiringBucket.setLeaveTypeId(401L);
        expiringBucket.setExpiryDate(LocalDate.of(2026, 4, 10));

        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(java.util.List.of(expiringBucket));

        InsufficientQuotaException exception = assertThrows(
                InsufficientQuotaException.class,
                () -> leaveService.createLeaveApplication(buildCrossExpiryCompensatoryLeaveCreateDto())
        );

        assertNotNull(exception);
        verify(leaveApplicationMapper, times(0)).insert(any(LeaveApplication.class));
    }

    @Test
    void testApproveCompensatoryLeaveApplicationConsumesStoredQuotaAllocation() {
        LeaveApplication application = buildCompensatoryLeaveApplication("APPROVING");
        application.setQuotaAllocation("{\"801\":2.00,\"802\":1.00}");

        LeaveQuota firstBucket = buildLeaveQuotaForYear(2025, new BigDecimal("2.00"), BigDecimal.ZERO, new BigDecimal("2.00"));
        firstBucket.setId(801L);
        firstBucket.setLeaveTypeId(401L);
        firstBucket.setExpiryDate(LocalDate.of(2026, 4, 15));
        firstBucket.setAvailableQuota(BigDecimal.ZERO);
        LeaveQuota secondBucket = buildLeaveQuotaForYear(2026, new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("1.00"));
        secondBucket.setId(802L);
        secondBucket.setLeaveTypeId(401L);
        secondBucket.setExpiryDate(LocalDate.of(2026, 5, 31));
        secondBucket.setAvailableQuota(new BigDecimal("4.00"));

        when(leaveApplicationMapper.selectById(11L)).thenReturn(application);
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectById(801L)).thenReturn(firstBucket);
        when(leaveQuotaMapper.selectById(802L)).thenReturn(secondBucket);

        leaveService.approveLeaveApplication(11L);

        assertEquals("APPROVED", application.getStatus());
        assertEquals(BigDecimal.ZERO.setScale(2), firstBucket.getFrozenQuota().setScale(2));
        assertEquals(new BigDecimal("2.00"), firstBucket.getUsedQuota());
        assertEquals(BigDecimal.ZERO.setScale(2), secondBucket.getFrozenQuota().setScale(2));
        assertEquals(new BigDecimal("1.00"), secondBucket.getUsedQuota());
    }

    @Test
    void testAdjustCompensatoryLeaveQuotaCreatesBucket() {
        AtomicReference<LeaveQuota> stored = new AtomicReference<>();
        LeaveQuotaAdjustDTO dto = new LeaveQuotaAdjustDTO();
        dto.setEmployeeId(1L);
        dto.setLeaveTypeId(401L);
        dto.setYear(2026);
        dto.setAdjustmentAmount(new BigDecimal("3.50"));
        dto.setExpiryDate(LocalDate.of(2026, 7, 31));

        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(null);
        when(leaveQuotaMapper.insert(any(LeaveQuota.class))).thenAnswer(invocation -> {
            LeaveQuota quota = invocation.getArgument(0);
            stored.set(quota);
            return 1;
        });

        leaveService.adjustLeaveQuota(dto);

        assertEquals(new BigDecimal("3.50"), stored.get().getTotalQuota());
        assertEquals(new BigDecimal("3.50"), stored.get().getAvailableQuota());
        assertEquals(LocalDate.of(2026, 7, 31), stored.get().getExpiryDate());
    }

    @Test
    void testAdjustCompensatoryLeaveQuotaRejectsReduceBeyondAvailable() {
        LeaveQuotaAdjustDTO dto = new LeaveQuotaAdjustDTO();
        dto.setEmployeeId(1L);
        dto.setLeaveTypeId(401L);
        dto.setYear(2026);
        dto.setAdjustmentAmount(new BigDecimal("-3.50"));
        dto.setExpiryDate(LocalDate.of(2026, 7, 31));

        LeaveQuota bucket = buildLeaveQuotaForYear(2026, new BigDecimal("5.00"), new BigDecimal("2.00"), BigDecimal.ZERO);
        bucket.setLeaveTypeId(401L);
        bucket.setExpiryDate(LocalDate.of(2026, 7, 31));
        bucket.setAvailableQuota(new BigDecimal("3.00"));

        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectOne(any())).thenReturn(bucket);

        HrBusinessException exception = assertThrows(
                HrBusinessException.class,
                () -> leaveService.adjustLeaveQuota(dto)
        );

        assertTrue(exception.getMessage().contains("可用额度不足"));
    }

    @Test
    void testGetLeaveQuotaAggregatesCompensatoryCarryOverBucketsForRequestedYear() {
        LeaveQuota carryOverBucket = buildLeaveQuotaForYear(2025, new BigDecimal("2.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        carryOverBucket.setId(806L);
        carryOverBucket.setLeaveTypeId(401L);
        carryOverBucket.setExpiryDate(LocalDate.of(2026, 2, 15));

        LeaveQuota currentBucket = buildLeaveQuotaForYear(2026, new BigDecimal("4.00"), new BigDecimal("1.00"), BigDecimal.ZERO);
        currentBucket.setId(807L);
        currentBucket.setLeaveTypeId(401L);
        currentBucket.setExpiryDate(LocalDate.of(2026, 4, 30));
        currentBucket.setAvailableQuota(new BigDecimal("3.00"));

        LeaveQuota expiredBucket = buildLeaveQuotaForYear(2025, new BigDecimal("6.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        expiredBucket.setId(808L);
        expiredBucket.setLeaveTypeId(401L);
        expiredBucket.setExpiryDate(LocalDate.of(2025, 12, 31));

        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(List.of(carryOverBucket, currentBucket, expiredBucket));

        LeaveQuotaVO quota = leaveService.getLeaveQuota(1L, 401L, 2026);

        assertEquals(2026, quota.getYear());
        assertEquals(new BigDecimal("6.00"), quota.getTotalQuota());
        assertEquals(new BigDecimal("1.00"), quota.getUsedQuota());
        assertEquals(new BigDecimal("5.00"), quota.getAvailableQuota());
        assertEquals(LocalDate.of(2026, 2, 15), quota.getExpiryDate());
    }

    @Test
    void testInitLeaveQuotaSupportsSpecificLeaveType() {
        AtomicReference<LeaveQuota> stored = new AtomicReference<>();
        LeaveType marriageLeaveType = buildMarriageLeaveType();
        marriageLeaveType.setQuotaRule("{\"quota\":3}");

        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(302L)).thenReturn(marriageLeaveType);
        when(leaveQuotaMapper.selectOne(any())).thenReturn(null);
        when(leaveQuotaMapper.insert(any(LeaveQuota.class))).thenAnswer(invocation -> {
            LeaveQuota leaveQuota = invocation.getArgument(0);
            stored.set(leaveQuota);
            return 1;
        });

        leaveService.initLeaveQuota(1L, 2026, 302L);

        assertNotNull(stored.get());
        assertEquals(Long.valueOf(302L), stored.get().getLeaveTypeId());
        assertEquals(new BigDecimal("3.00"), stored.get().getTotalQuota());
        assertEquals(LocalDate.of(2026, 12, 31), stored.get().getExpiryDate());
        verify(leaveTypeMapper, times(1)).selectById(302L);
        verify(leaveTypeMapper, times(0)).selectList(any());
        verify(leaveQuotaMapper, times(1)).insert(any(LeaveQuota.class));
    }

    @Test
    void testInitLeaveQuotaKeepsBatchBehaviorWhenLeaveTypeIdMissing() {
        AtomicReference<LeaveQuota> stored = new AtomicReference<>();
        LeaveType marriageLeaveType = buildMarriageLeaveType();
        marriageLeaveType.setQuotaRule("{\"quota\":5}");

        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectList(any())).thenReturn(List.of(marriageLeaveType, buildCompensatoryLeaveType()));
        when(leaveQuotaMapper.selectOne(any())).thenReturn(null);
        when(leaveQuotaMapper.insert(any(LeaveQuota.class))).thenAnswer(invocation -> {
            LeaveQuota leaveQuota = invocation.getArgument(0);
            stored.set(leaveQuota);
            return 1;
        });

        leaveService.initLeaveQuota(1L, 2026, null);

        assertNotNull(stored.get());
        assertEquals(Long.valueOf(302L), stored.get().getLeaveTypeId());
        assertEquals(new BigDecimal("5.00"), stored.get().getTotalQuota());
        verify(leaveTypeMapper, times(1)).selectList(any());
        verify(leaveQuotaMapper, times(1)).insert(any(LeaveQuota.class));
    }

    @Test
    void testInitLeaveQuotaRejectsSpecificCompensatoryType() {
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());

        HrBusinessException exception = assertThrows(
                HrBusinessException.class,
                () -> leaveService.initLeaveQuota(1L, 2026, 401L)
        );

        assertTrue(exception.getMessage().contains("不支持补齐年度额度"));
    }

    @Test
    void testGetLeaveQuotaReturnsPendingSummaryForNonCompensatoryTypeWithoutInitialization() {
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(302L)).thenReturn(buildMarriageLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(List.of());

        LeaveQuotaVO quota = leaveService.getLeaveQuota(1L, 302L, 2026);

        assertEquals("婚假", quota.getLeaveTypeName());
        assertEquals("测试员工", quota.getEmployeeName());
        assertEquals(2026, quota.getYear());
        assertEquals(new BigDecimal("0.00"), quota.getTotalQuota());
        assertEquals(new BigDecimal("0.00"), quota.getAvailableQuota());
        assertEquals(null, quota.getId());
    }

    @Test
    void testListLeaveQuotasAggregatesCompensatoryCarryOverBucketsForRequestedYear() {
        LeaveQuotaVO annualQuota = new LeaveQuotaVO();
        annualQuota.setId(901L);
        annualQuota.setEmployeeId(1L);
        annualQuota.setEmployeeName("测试员工");
        annualQuota.setLeaveTypeId(301L);
        annualQuota.setLeaveTypeName("年假");
        annualQuota.setYear(2026);
        annualQuota.setTotalQuota(new BigDecimal("5.00"));
        annualQuota.setUsedQuota(new BigDecimal("1.00"));
        annualQuota.setFrozenQuota(BigDecimal.ZERO);
        annualQuota.setAvailableQuota(new BigDecimal("4.00"));
        annualQuota.setExpiryDate(LocalDate.of(2026, 12, 31));

        LeaveQuotaVO rawCompQuota = new LeaveQuotaVO();
        rawCompQuota.setId(902L);
        rawCompQuota.setEmployeeId(1L);
        rawCompQuota.setEmployeeName("测试员工");
        rawCompQuota.setLeaveTypeId(401L);
        rawCompQuota.setLeaveTypeName("调休");
        rawCompQuota.setYear(2026);
        rawCompQuota.setTotalQuota(new BigDecimal("4.00"));
        rawCompQuota.setUsedQuota(new BigDecimal("1.00"));
        rawCompQuota.setFrozenQuota(BigDecimal.ZERO);
        rawCompQuota.setAvailableQuota(new BigDecimal("3.00"));
        rawCompQuota.setExpiryDate(LocalDate.of(2026, 4, 30));

        LeaveQuota carryOverBucket = buildLeaveQuotaForYear(2025, new BigDecimal("2.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        carryOverBucket.setId(806L);
        carryOverBucket.setLeaveTypeId(401L);
        carryOverBucket.setExpiryDate(LocalDate.of(2026, 2, 15));

        LeaveQuota currentBucket = buildLeaveQuotaForYear(2026, new BigDecimal("4.00"), new BigDecimal("1.00"), BigDecimal.ZERO);
        currentBucket.setId(807L);
        currentBucket.setLeaveTypeId(401L);
        currentBucket.setExpiryDate(LocalDate.of(2026, 4, 30));
        currentBucket.setAvailableQuota(new BigDecimal("3.00"));

        when(leaveQuotaMapper.selectLeaveQuotaList(2001L, 1L, 2026)).thenReturn(List.of(annualQuota, rawCompQuota));
        when(leaveTypeMapper.selectOne(any())).thenReturn(buildCompensatoryLeaveType());
        when(leaveTypeMapper.selectList(any())).thenReturn(List.of(buildAnnualLeaveType(), buildCompensatoryLeaveType()));
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveQuotaMapper.selectList(any())).thenReturn(List.of(carryOverBucket, currentBucket));

        List<LeaveQuotaVO> quotaList = leaveService.listLeaveQuotas(1L, 2026);

        assertEquals(2, quotaList.size());
        LeaveQuotaVO compensatoryQuota = quotaList.stream()
                .filter(item -> Long.valueOf(401L).equals(item.getLeaveTypeId()))
                .findFirst()
                .orElseThrow();
        assertEquals(2026, compensatoryQuota.getYear());
        assertEquals(new BigDecimal("6.00"), compensatoryQuota.getTotalQuota());
        assertEquals(new BigDecimal("1.00"), compensatoryQuota.getUsedQuota());
        assertEquals(new BigDecimal("5.00"), compensatoryQuota.getAvailableQuota());
        assertEquals(LocalDate.of(2026, 2, 15), compensatoryQuota.getExpiryDate());
    }

    @Test
    void testListLeaveQuotasIncludesPendingNonCompensatoryTypesWithoutInitializedQuota() {
        LeaveQuotaVO annualQuota = new LeaveQuotaVO();
        annualQuota.setId(901L);
        annualQuota.setEmployeeId(1L);
        annualQuota.setEmployeeName("测试员工");
        annualQuota.setLeaveTypeId(301L);
        annualQuota.setLeaveTypeName("年假");
        annualQuota.setYear(2026);
        annualQuota.setTotalQuota(new BigDecimal("5.00"));
        annualQuota.setUsedQuota(new BigDecimal("1.00"));
        annualQuota.setFrozenQuota(BigDecimal.ZERO);
        annualQuota.setAvailableQuota(new BigDecimal("4.00"));
        annualQuota.setExpiryDate(LocalDate.of(2026, 12, 31));

        LeaveType marriageLeaveType = buildMarriageLeaveType();

        when(leaveQuotaMapper.selectLeaveQuotaList(2001L, 1L, 2026)).thenReturn(List.of(annualQuota));
        when(leaveTypeMapper.selectOne(any())).thenReturn(buildCompensatoryLeaveType());
        when(leaveTypeMapper.selectList(any())).thenReturn(List.of(buildAnnualLeaveType(), buildCompensatoryLeaveType(), marriageLeaveType));
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveQuotaMapper.selectList(any())).thenReturn(List.of());

        List<LeaveQuotaVO> quotaList = leaveService.listLeaveQuotas(1L, 2026);

        assertEquals(2, quotaList.size());
        LeaveQuotaVO pendingQuota = quotaList.stream()
                .filter(item -> Long.valueOf(302L).equals(item.getLeaveTypeId()))
                .findFirst()
                .orElseThrow();
        assertEquals("婚假", pendingQuota.getLeaveTypeName());
        assertEquals(2026, pendingQuota.getYear());
        assertEquals(new BigDecimal("0.00"), pendingQuota.getTotalQuota());
        assertEquals(new BigDecimal("0.00"), pendingQuota.getAvailableQuota());
        assertEquals("测试员工", pendingQuota.getEmployeeName());
        assertEquals(null, pendingQuota.getId());
    }

    @Test
    void testListLeaveQuotaBucketsReturnsCompensatoryCarryOverBucketsForRequestedYear() {
        LeaveQuota carryOverBucket = buildLeaveQuotaForYear(2025, new BigDecimal("2.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        carryOverBucket.setId(806L);
        carryOverBucket.setLeaveTypeId(401L);
        carryOverBucket.setExpiryDate(LocalDate.of(2026, 2, 15));

        LeaveQuota currentBucket = buildLeaveQuotaForYear(2026, new BigDecimal("4.00"), new BigDecimal("1.00"), BigDecimal.ZERO);
        currentBucket.setId(807L);
        currentBucket.setLeaveTypeId(401L);
        currentBucket.setExpiryDate(LocalDate.of(2026, 4, 30));
        currentBucket.setAvailableQuota(new BigDecimal("3.00"));

        LeaveQuota expiredBucket = buildLeaveQuotaForYear(2025, new BigDecimal("6.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        expiredBucket.setId(808L);
        expiredBucket.setLeaveTypeId(401L);
        expiredBucket.setExpiryDate(LocalDate.of(2025, 12, 31));

        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(List.of(carryOverBucket, currentBucket, expiredBucket));

        List<LeaveQuotaVO> bucketList = leaveService.listLeaveQuotaBuckets(1L, 401L, 2026);

        assertEquals(2, bucketList.size());
        assertEquals(Long.valueOf(806L), bucketList.get(0).getId());
        assertEquals(Long.valueOf(807L), bucketList.get(1).getId());
        assertEquals(2025, bucketList.get(0).getYear());
        assertEquals(2026, bucketList.get(1).getYear());
        assertEquals(new BigDecimal("2.00"), bucketList.get(0).getAvailableQuota());
        assertEquals(new BigDecimal("3.00"), bucketList.get(1).getAvailableQuota());
    }

    @Test
    void testListLeaveQuotaBucketsReturnsEmptyListWhenCompensatoryBucketsNotGeneratedYet() {
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(401L)).thenReturn(buildCompensatoryLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(List.of());

        List<LeaveQuotaVO> bucketList = leaveService.listLeaveQuotaBuckets(1L, 401L, 2026);

        assertTrue(bucketList.isEmpty());
    }

    @Test
    void testListLeaveQuotaBucketsReturnsEmptyListWhenAnnualQuotaNotInitializedYet() {
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(leaveTypeMapper.selectById(301L)).thenReturn(buildAnnualLeaveType());
        when(leaveQuotaMapper.selectList(any())).thenReturn(List.of());

        List<LeaveQuotaVO> bucketList = leaveService.listLeaveQuotaBuckets(1L, 301L, 2026);

        assertTrue(bucketList.isEmpty());
    }

    @Test
    void testCreateOvertimeApplicationSuccess() {
        AtomicReference<OvertimeApplication> stored = new AtomicReference<>();
        when(employeeMapper.selectById(1L)).thenReturn(buildEmployee());
        when(overtimeApplicationMapper.insert(any(OvertimeApplication.class))).thenAnswer(invocation -> {
            OvertimeApplication application = invocation.getArgument(0);
            application.setId(21L);
            stored.set(application);
            return 1;
        });

        OvertimeApplicationCreateDTO dto = buildOvertimeCreateDto();
        Long applicationId = overtimeService.createOvertimeApplication(dto);

        assertEquals(21L, applicationId);
        assertEquals("DRAFT", stored.get().getStatus());
        assertEquals(new BigDecimal("2.00"), stored.get().getDuration());
        assertEquals(new BigDecimal("3.00"), stored.get().getCompensationHours());
        assertTrue(stored.get().getApplicationNo().startsWith("OT"));
    }

    @Test
    void testSubmitOvertimeApplicationSuccess() {
        OvertimeApplication application = buildOvertimeApplication("DRAFT");
        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(workflowProcessKeyProperties.getOvertime()).thenReturn("overtime_request");
        when(workflowServiceClient.startProcess(any(ProcessStartDTO.class))).thenReturn(R.ok("proc-overtime-001"));

        overtimeService.submitOvertimeApplication(21L);

        assertEquals("APPROVING", application.getStatus());
        assertEquals("proc-overtime-001", application.getProcessInstanceId());
        verify(workflowServiceClient, times(1)).startProcess(any(ProcessStartDTO.class));
    }

    @Test
    void testApproveOvertimeApplicationAddsTimeOffQuota() {
        OvertimeApplication application = buildOvertimeApplication("APPROVING");
        LeaveType compensatoryType = buildCompensatoryLeaveType();
        LeaveQuota quota = buildLeaveQuota(new BigDecimal("5.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        quota.setLeaveTypeId(401L);
        quota.setExpiryDate(LocalDate.of(2026, 6, 20));

        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(leaveTypeMapper.selectOne(any())).thenReturn(compensatoryType);
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);

        overtimeService.approveOvertimeApplication(21L);

        assertEquals("APPROVED", application.getStatus());
        assertEquals(new BigDecimal("8.00"), quota.getTotalQuota());
        assertEquals(new BigDecimal("8.00"), quota.getAvailableQuota());
    }

    @Test
    void testApproveOvertimeApplicationUsesOvertimeYearForTimeOffQuota() {
        AtomicReference<LeaveQuota> stored = new AtomicReference<>();
        OvertimeApplication application = buildOvertimeApplication("APPROVING");
        application.setStartTime(LocalDateTime.of(2025, 12, 31, 18, 0));
        application.setEndTime(LocalDateTime.of(2025, 12, 31, 20, 0));

        LeaveType compensatoryType = buildCompensatoryLeaveType();

        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(leaveTypeMapper.selectOne(any())).thenReturn(compensatoryType);
        when(leaveQuotaMapper.selectOne(any())).thenReturn(null);
        when(leaveQuotaMapper.insert(any(LeaveQuota.class))).thenAnswer(invocation -> {
            LeaveQuota quota = invocation.getArgument(0);
            stored.set(quota);
            return 1;
        });

        overtimeService.approveOvertimeApplication(21L);

        assertEquals("APPROVED", application.getStatus());
        assertEquals(2025, stored.get().getYear());
        assertEquals(new BigDecimal("3.00"), stored.get().getTotalQuota());
        assertEquals(new BigDecimal("3.00"), stored.get().getAvailableQuota());
        assertEquals(LocalDate.of(2026, 3, 31), stored.get().getExpiryDate());
    }

    @Test
    void testApproveOvertimeApplicationSplitsCrossYearTimeOffQuota() {
        OvertimeApplication application = buildCrossYearOvertimeApplication("APPROVING");

        LeaveType compensatoryType = buildCompensatoryLeaveType();

        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(leaveTypeMapper.selectOne(any())).thenReturn(compensatoryType);
        when(leaveQuotaMapper.selectOne(any())).thenReturn((LeaveQuota) null, (LeaveQuota) null);
        when(leaveQuotaMapper.insert(any(LeaveQuota.class))).thenReturn(1);

        overtimeService.approveOvertimeApplication(21L);

        ArgumentCaptor<LeaveQuota> quotaCaptor = ArgumentCaptor.forClass(LeaveQuota.class);
        verify(leaveQuotaMapper, times(2)).insert(quotaCaptor.capture());
        java.util.List<LeaveQuota> inserted = quotaCaptor.getAllValues();

        assertEquals("APPROVED", application.getStatus());
        assertEquals(2025, inserted.get(0).getYear());
        assertEquals(new BigDecimal("2.00"), inserted.get(0).getTotalQuota());
        assertEquals(new BigDecimal("2.00"), inserted.get(0).getAvailableQuota());
        assertEquals(LocalDate.of(2026, 4, 1), inserted.get(0).getExpiryDate());
        assertEquals(2026, inserted.get(1).getYear());
        assertEquals(new BigDecimal("2.00"), inserted.get(1).getTotalQuota());
        assertEquals(new BigDecimal("2.00"), inserted.get(1).getAvailableQuota());
        assertEquals(LocalDate.of(2026, 4, 1), inserted.get(1).getExpiryDate());
    }

    @Test
    void testRejectOvertimeApplicationSuccess() {
        OvertimeApplication application = buildOvertimeApplication("APPROVING");
        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);

        overtimeService.rejectOvertimeApplication(21L);

        assertEquals("REJECTED", application.getStatus());
    }

    @Test
    void testCancelApprovingOvertimeApplicationCancelsWorkflow() {
        OvertimeApplication application = buildOvertimeApplication("APPROVING");
        application.setProcessInstanceId("proc-overtime-001");

        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(workflowServiceClient.cancelProcess("proc-overtime-001")).thenReturn(R.ok());

        overtimeService.cancelOvertimeApplication(21L);

        assertEquals("CANCELLED", application.getStatus());
        verify(workflowServiceClient, times(1)).cancelProcess("proc-overtime-001");
    }

    @Test
    void testCancelApprovedOvertimeApplicationRestoresTimeOffQuota() {
        OvertimeApplication application = buildOvertimeApplication("APPROVED");

        LeaveType compensatoryType = new LeaveType();
        compensatoryType.setId(401L);
        compensatoryType.setTenantId(2001L);
        compensatoryType.setLeaveCode("COMPENSATORY");

        LeaveQuota quota = buildLeaveQuota(new BigDecimal("8.00"), BigDecimal.ZERO, BigDecimal.ZERO);
        quota.setLeaveTypeId(401L);

        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(leaveTypeMapper.selectOne(any())).thenReturn(compensatoryType);
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);

        overtimeService.cancelOvertimeApplication(21L);

        assertEquals("CANCELLED", application.getStatus());
        assertEquals(new BigDecimal("5.00"), quota.getTotalQuota());
        assertEquals(new BigDecimal("5.00"), quota.getAvailableQuota());
    }

    @Test
    void testCancelApprovedOvertimeApplicationFailsWhenTimeOffAlreadyUsed() {
        OvertimeApplication application = buildOvertimeApplication("APPROVED");

        LeaveType compensatoryType = new LeaveType();
        compensatoryType.setId(401L);
        compensatoryType.setTenantId(2001L);
        compensatoryType.setLeaveCode("COMPENSATORY");

        LeaveQuota quota = buildLeaveQuota(new BigDecimal("8.00"), new BigDecimal("2.00"), BigDecimal.ZERO);
        quota.setLeaveTypeId(401L);
        quota.setAvailableQuota(new BigDecimal("1.00"));

        when(overtimeApplicationMapper.selectById(21L)).thenReturn(application);
        when(leaveTypeMapper.selectOne(any())).thenReturn(compensatoryType);
        when(leaveQuotaMapper.selectOne(any())).thenReturn(quota);

        HrBusinessException exception = assertThrows(
                HrBusinessException.class,
                () -> overtimeService.cancelOvertimeApplication(21L)
        );

        assertTrue(exception.getMessage().contains("已被占用"));
    }

    private Employee buildEmployee() {
        Employee employee = new Employee();
        employee.setId(1L);
        employee.setTenantId(2001L);
        employee.setName("测试员工");
        employee.setEmployeeNo("EMP001");
        employee.setEmployeeStatus("REGULAR");
        return employee;
    }

    private LeaveType buildAnnualLeaveType() {
        LeaveType leaveType = new LeaveType();
        leaveType.setId(301L);
        leaveType.setTenantId(2001L);
        leaveType.setLeaveCode("ANNUAL");
        leaveType.setLeaveName("年假");
        leaveType.setNeedQuota(true);
        leaveType.setStatus(1);
        return leaveType;
    }

    private LeaveType buildMarriageLeaveType() {
        LeaveType leaveType = new LeaveType();
        leaveType.setId(302L);
        leaveType.setTenantId(2001L);
        leaveType.setLeaveCode("MARRIAGE");
        leaveType.setLeaveName("婚假");
        leaveType.setNeedQuota(true);
        leaveType.setUnit("DAY");
        leaveType.setStatus(1);
        return leaveType;
    }

    private LeaveType buildCompensatoryLeaveType() {
        LeaveType leaveType = new LeaveType();
        leaveType.setId(401L);
        leaveType.setTenantId(2001L);
        leaveType.setLeaveCode("COMPENSATORY");
        leaveType.setLeaveName("调休");
        leaveType.setNeedQuota(true);
        leaveType.setUnit("HOUR");
        leaveType.setExpiryRule("{\"expiryType\":\"FIXED_DAYS\",\"days\":90}");
        leaveType.setStatus(1);
        return leaveType;
    }

    private LeaveQuota buildLeaveQuota(BigDecimal totalQuota, BigDecimal usedQuota, BigDecimal frozenQuota) {
        LeaveQuota quota = new LeaveQuota();
        quota.setId(501L);
        quota.setTenantId(2001L);
        quota.setEmployeeId(1L);
        quota.setLeaveTypeId(301L);
        quota.setYear(2026);
        quota.setTotalQuota(totalQuota);
        quota.setUsedQuota(usedQuota);
        quota.setFrozenQuota(frozenQuota);
        quota.setAvailableQuota(totalQuota.subtract(usedQuota).subtract(frozenQuota));
        quota.setExpiryDate(LocalDate.of(2026, 12, 31));
        return quota;
    }

    /**
     * 跨年额度测试需要区分不同年份的额度记录，避免断言混到同一条数据。
     */
    private LeaveQuota buildLeaveQuotaForYear(int year, BigDecimal totalQuota, BigDecimal usedQuota, BigDecimal frozenQuota) {
        LeaveQuota quota = buildLeaveQuota(totalQuota, usedQuota, frozenQuota);
        quota.setId(500L + year);
        quota.setYear(year);
        quota.setExpiryDate(LocalDate.of(year, 12, 31));
        return quota;
    }

    private LeaveApplicationCreateDTO buildLeaveCreateDto() {
        LeaveApplicationCreateDTO dto = new LeaveApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setLeaveTypeId(301L);
        dto.setStartTime(LocalDateTime.of(2026, 3, 22, 9, 0));
        dto.setEndTime(LocalDateTime.of(2026, 3, 23, 18, 0));
        dto.setDuration(new BigDecimal("2.00"));
        dto.setUnit("DAY");
        dto.setReason("个人事务");
        return dto;
    }

    private LeaveApplicationCreateDTO buildCrossYearLeaveCreateDto() {
        LeaveApplicationCreateDTO dto = new LeaveApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setLeaveTypeId(301L);
        dto.setStartTime(LocalDateTime.of(2026, 12, 31, 9, 0));
        dto.setEndTime(LocalDateTime.of(2027, 1, 1, 18, 0));
        dto.setDuration(new BigDecimal("2.00"));
        dto.setUnit("DAY");
        dto.setReason("璺ㄥ勾椤圭洰鏀跺熬");
        return dto;
    }

    private LeaveApplicationCreateDTO buildCompensatoryLeaveCreateDto() {
        LeaveApplicationCreateDTO dto = new LeaveApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setLeaveTypeId(401L);
        dto.setStartTime(LocalDateTime.of(2026, 4, 10, 9, 0));
        dto.setEndTime(LocalDateTime.of(2026, 4, 10, 12, 0));
        dto.setDuration(new BigDecimal("3.00"));
        dto.setUnit("HOUR");
        dto.setReason("补休");
        return dto;
    }

    private LeaveApplicationCreateDTO buildCrossExpiryCompensatoryLeaveCreateDto() {
        LeaveApplicationCreateDTO dto = new LeaveApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setLeaveTypeId(401L);
        dto.setStartTime(LocalDateTime.of(2026, 4, 10, 22, 0));
        dto.setEndTime(LocalDateTime.of(2026, 4, 11, 2, 0));
        dto.setDuration(new BigDecimal("4.00"));
        dto.setUnit("HOUR");
        dto.setReason("璺ㄨ繃棰濆害杩囨湡鏃ョ殑璋冧紤");
        return dto;
    }

    private LeaveApplication buildLeaveApplication(String status) {
        LeaveApplication application = new LeaveApplication();
        application.setId(11L);
        application.setTenantId(2001L);
        application.setApplicationNo("LEAVE202603220001");
        application.setEmployeeId(1L);
        application.setLeaveTypeId(301L);
        application.setStartTime(LocalDateTime.of(2026, 3, 22, 9, 0));
        application.setEndTime(LocalDateTime.of(2026, 3, 23, 18, 0));
        application.setDuration(new BigDecimal("2.00"));
        application.setUnit("DAY");
        application.setReason("个人事务");
        application.setStatus(status);
        return application;
    }

    /**
     * 2026-12-31 到 2027-01-01 共 2 天，当前拆分规则会在两个年度各占 1 天额度。
     */
    private LeaveApplication buildCrossYearLeaveApplication(String status) {
        LeaveApplication application = new LeaveApplication();
        application.setId(11L);
        application.setTenantId(2001L);
        application.setApplicationNo("LEAVE202612310001");
        application.setEmployeeId(1L);
        application.setLeaveTypeId(301L);
        application.setStartTime(LocalDateTime.of(2026, 12, 31, 9, 0));
        application.setEndTime(LocalDateTime.of(2027, 1, 1, 18, 0));
        application.setDuration(new BigDecimal("2.00"));
        application.setUnit("DAY");
        application.setReason("璺ㄥ勾椤圭洰鏀跺熬");
        application.setStatus(status);
        return application;
    }

    private LeaveApplication buildCompensatoryLeaveApplication(String status) {
        LeaveApplication application = new LeaveApplication();
        application.setId(11L);
        application.setTenantId(2001L);
        application.setApplicationNo("LEAVE202604100001");
        application.setEmployeeId(1L);
        application.setLeaveTypeId(401L);
        application.setStartTime(LocalDateTime.of(2026, 4, 10, 9, 0));
        application.setEndTime(LocalDateTime.of(2026, 4, 10, 12, 0));
        application.setDuration(new BigDecimal("3.00"));
        application.setUnit("HOUR");
        application.setReason("补休");
        application.setStatus(status);
        return application;
    }

    private OvertimeApplicationCreateDTO buildOvertimeCreateDto() {
        OvertimeApplicationCreateDTO dto = new OvertimeApplicationCreateDTO();
        dto.setEmployeeId(1L);
        dto.setStartTime(LocalDateTime.of(2026, 3, 22, 18, 0));
        dto.setEndTime(LocalDateTime.of(2026, 3, 22, 20, 0));
        dto.setOvertimeType("WEEKEND");
        dto.setReason("项目上线");
        dto.setCompensationType("TIME_OFF");
        return dto;
    }

    private OvertimeApplication buildOvertimeApplication(String status) {
        OvertimeApplication application = new OvertimeApplication();
        application.setId(21L);
        application.setTenantId(2001L);
        application.setApplicationNo("OT202603220001");
        application.setEmployeeId(1L);
        application.setStartTime(LocalDateTime.of(2026, 3, 22, 18, 0));
        application.setEndTime(LocalDateTime.of(2026, 3, 22, 20, 0));
        application.setDuration(new BigDecimal("2.00"));
        application.setOvertimeType("WEEKEND");
        application.setReason("项目上线");
        application.setCompensationType("TIME_OFF");
        application.setCompensationHours(new BigDecimal("3.00"));
        application.setStatus(status);
        return application;
    }

    /**
     * 2025-12-31 22:00 到 2026-01-01 02:00 共 4 小时，调休额度应按两个年度各分 2 小时。
     */
    private OvertimeApplication buildCrossYearOvertimeApplication(String status) {
        OvertimeApplication application = new OvertimeApplication();
        application.setId(21L);
        application.setTenantId(2001L);
        application.setApplicationNo("OT202512310001");
        application.setEmployeeId(1L);
        application.setStartTime(LocalDateTime.of(2025, 12, 31, 22, 0));
        application.setEndTime(LocalDateTime.of(2026, 1, 1, 2, 0));
        application.setDuration(new BigDecimal("4.00"));
        application.setOvertimeType("WORKDAY");
        application.setReason("跨年值守");
        application.setCompensationType("TIME_OFF");
        application.setCompensationHours(new BigDecimal("4.00"));
        application.setStatus(status);
        return application;
    }
}
