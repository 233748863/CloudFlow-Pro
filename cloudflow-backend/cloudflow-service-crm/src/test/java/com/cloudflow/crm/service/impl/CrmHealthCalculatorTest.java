package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.*;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CrmHealthCalculatorTest {
    @Test
    void healthUsesUnpaidReceivablesOpenTicketsAndRenewedExpiration() {
        LocalDateTime now = LocalDateTime.of(2026, 11, 2, 12, 0);
        CrmFollowUp followUp = new CrmFollowUp();
        followUp.setFollowUpTime(now.minusDays(2));
        followUp.setNextFollowUpTime(now.plusDays(3));
        CrmRenewal renewal = new CrmRenewal();
        renewal.setStatus(CrmConstants.RenewalStatus.WON);
        renewal.setCurrentExpireDate(now.toLocalDate().minusDays(10));
        renewal.setNextExpireDate(now.toLocalDate().plusDays(60));
        CrmReceivable paid = new CrmReceivable();
        paid.setDueDate(now.toLocalDate().minusDays(90));
        paid.setOutstandingAmount(BigDecimal.ZERO);
        CrmReceivable unpaid = new CrmReceivable();
        unpaid.setDueDate(now.toLocalDate().minusDays(31));
        unpaid.setOutstandingAmount(BigDecimal.TEN);
        CrmServiceTicket closed = new CrmServiceTicket();
        closed.setSeverity(CrmConstants.TicketSeverity.CRITICAL);
        closed.setStatus(CrmConstants.TicketStatus.CLOSED);
        closed.setDueTime(now.minusDays(1));

        var health = CrmHealthCalculator.calculate(List.of(followUp), List.of(renewal),
                List.of(paid, unpaid), List.of(closed), now);

        assertEquals(now.minusDays(2), health.lastFollowUpTime());
        assertEquals(now.plusDays(3), health.nextFollowUpTime());
        assertEquals(now.toLocalDate().plusDays(60), health.renewalWindowDate());
        assertEquals(31, health.overdueDays());
        assertFalse(health.highSeverityOpenTicket());
        assertFalse(health.overdueOpenTicket());
    }
}
