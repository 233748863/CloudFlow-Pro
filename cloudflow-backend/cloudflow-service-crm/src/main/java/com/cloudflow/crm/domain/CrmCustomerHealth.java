package com.cloudflow.crm.domain;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 一次健康度计算使用的事实，供更新客户和展示原因共同使用。 */
public record CrmCustomerHealth(LocalDateTime lastFollowUpTime,
                                LocalDateTime nextFollowUpTime,
                                LocalDate renewalWindowDate,
                                int overdueDays,
                                boolean highSeverityOpenTicket,
                                boolean overdueOpenTicket,
                                LocalDateTime calculatedAt) {
}
