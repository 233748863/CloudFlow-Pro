package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.CrmPerformanceSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmFollowUpMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmPerformanceQueryServiceImplTest {

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private CrmOpportunityMapper opportunityMapper;

    @Mock
    private CrmReceivableMapper receivableMapper;

    @Mock
    private CrmFollowUpMapper followUpMapper;

    private CrmPerformanceQueryServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new CrmPerformanceQueryServiceImpl(
                customerMapper,
                opportunityMapper,
                receivableMapper,
                followUpMapper
        );
    }

    @Test
    void summarizeByOwner_aggregatesCustomersOpportunitiesReceivablesAndFollowUps() {
        when(customerMapper.selectList(any())).thenReturn(List.of(
                customer(6001L, 2001L, "张三", 3001L, "销售一部"),
                customer(6002L, 2002L, "李四", 3002L, "销售二部")
        ));
        when(opportunityMapper.selectList(any())).thenReturn(List.of(
                opportunity(7001L, 2001L, "张三", 3001L, "销售一部",
                        new BigDecimal("100000"), LocalDateTime.of(2026, 6, 1, 10, 0)),
                opportunity(7002L, 2002L, "李四", 3002L, "销售二部",
                        new BigDecimal("50000"), LocalDateTime.of(2026, 5, 20, 10, 0))
        ));
        when(receivableMapper.selectList(any())).thenReturn(List.of(
                receivable(6001L, 2001L, "张三", new BigDecimal("80000"), BigDecimal.ZERO,
                        LocalDate.of(2026, 6, 2), LocalDateTime.of(2026, 6, 2, 9, 0)),
                receivable(6001L, 2001L, "张三", BigDecimal.ZERO, new BigDecimal("20000"),
                        null, LocalDateTime.of(2026, 6, 3, 9, 0)),
                receivable(6002L, 2002L, "李四", new BigDecimal("30000"), BigDecimal.ZERO,
                        LocalDate.of(2026, 5, 1), LocalDateTime.of(2026, 5, 1, 9, 0))
        ));
        when(followUpMapper.selectList(any())).thenReturn(List.of(
                followUp(6001L, 2001L, "张三", LocalDateTime.of(2026, 6, 2, 11, 0)),
                followUp(6001L, 2001L, "张三", LocalDateTime.of(2026, 6, 3, 11, 0)),
                followUp(6002L, 2002L, "李四", LocalDateTime.of(2026, 5, 1, 11, 0))
        ));

        List<CrmPerformanceSummaryVO> result =
                service.summarizeByOwner(List.of(2001L), "2026-06-01", "2026-06-30");

        assertEquals(1, result.size());
        CrmPerformanceSummaryVO summary = result.get(0);
        assertEquals("OWNER", summary.getDimension());
        assertEquals(2001L, summary.getTargetId());
        assertEquals("张三", summary.getTargetName());
        assertEquals(1L, summary.getCustomerCount());
        assertEquals(1L, summary.getWonOpportunityCount());
        assertEquals(new BigDecimal("100000"), summary.getWonAmount());
        assertEquals(new BigDecimal("100000"), summary.getContractAmount());
        assertEquals(new BigDecimal("80000"), summary.getReceivedAmount());
        assertEquals(new BigDecimal("20000"), summary.getOutstandingAmount());
        assertEquals(2L, summary.getFollowUpCount());
    }

    @Test
    void topDepartments_ordersByReceivedAmountDesc() {
        when(customerMapper.selectList(any())).thenReturn(List.of(
                customer(6001L, 2001L, "张三", 3001L, "销售一部"),
                customer(6002L, 2002L, "李四", 3002L, "销售二部")
        ));
        when(opportunityMapper.selectList(any())).thenReturn(List.of());
        when(receivableMapper.selectList(any())).thenReturn(List.of(
                receivable(6001L, 2001L, "张三", new BigDecimal("120000"), BigDecimal.ZERO,
                        LocalDate.of(2026, 6, 2), LocalDateTime.of(2026, 6, 2, 9, 0)),
                receivable(6002L, 2002L, "李四", new BigDecimal("80000"), BigDecimal.ZERO,
                        LocalDate.of(2026, 6, 1), LocalDateTime.of(2026, 6, 1, 9, 0))
        ));
        when(followUpMapper.selectList(any())).thenReturn(List.of());

        List<CrmPerformanceSummaryVO> result = service.topDepartments(1, "2026-06-01", "2026-06-30");

        assertEquals(1, result.size());
        CrmPerformanceSummaryVO top = result.get(0);
        assertEquals("DEPT", top.getDimension());
        assertEquals(3001L, top.getTargetId());
        assertEquals("销售一部", top.getTargetName());
        assertEquals(new BigDecimal("120000"), top.getReceivedAmount());
        assertNotNull(top.getOutstandingAmount());
        assertEquals(BigDecimal.ZERO, top.getOutstandingAmount());
    }

    private CrmCustomer customer(Long customerId, Long ownerId, String ownerName, Long deptId, String deptName) {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(customerId);
        customer.setOwnerId(ownerId);
        customer.setOwnerName(ownerName);
        customer.setDeptId(deptId);
        customer.setDeptName(deptName);
        customer.setDeleted(CrmConstants.DelFlag.NORMAL);
        return customer;
    }

    private CrmOpportunity opportunity(Long opportunityId, Long ownerId, String ownerName,
                                       Long deptId, String deptName, BigDecimal amount,
                                       LocalDateTime stageChangedTime) {
        CrmOpportunity opportunity = new CrmOpportunity();
        opportunity.setOpportunityId(opportunityId);
        opportunity.setOwnerId(ownerId);
        opportunity.setOwnerName(ownerName);
        opportunity.setDeptId(deptId);
        opportunity.setDeptName(deptName);
        opportunity.setExpectedAmount(amount);
        opportunity.setStage(CrmConstants.OpportunityStage.WON);
        opportunity.setDeleted(CrmConstants.DelFlag.NORMAL);
        opportunity.setStageChangedTime(stageChangedTime);
        opportunity.setCreateTime(stageChangedTime.minusDays(2));
        return opportunity;
    }

    private CrmReceivable receivable(Long customerId, Long ownerId, String ownerName,
                                     BigDecimal receivedAmount, BigDecimal outstandingAmount,
                                     LocalDate receivedDate, LocalDateTime updateTime) {
        CrmReceivable receivable = new CrmReceivable();
        receivable.setCustomerId(customerId);
        receivable.setOwnerId(ownerId);
        receivable.setOwnerName(ownerName);
        receivable.setReceivedAmount(receivedAmount);
        receivable.setOutstandingAmount(outstandingAmount);
        receivable.setReceivedDate(receivedDate);
        receivable.setUpdateTime(updateTime);
        receivable.setDeleted(CrmConstants.DelFlag.NORMAL);
        return receivable;
    }

    private CrmFollowUp followUp(Long customerId, Long ownerId, String ownerName, LocalDateTime followUpTime) {
        CrmFollowUp followUp = new CrmFollowUp();
        followUp.setCustomerId(customerId);
        followUp.setOwnerId(ownerId);
        followUp.setOwnerName(ownerName);
        followUp.setFollowUpTime(followUpTime);
        followUp.setDeleted(CrmConstants.DelFlag.NORMAL);
        return followUp;
    }
}
