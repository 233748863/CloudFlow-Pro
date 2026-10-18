package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.event.commission.CommissionEvents.Fact;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmCommissionMapper {
    Fact source(@Param("tenantId") Long tenantId, @Param("allocationId") Long allocationId);
    Page<Row> page(Page<Row> page, @Param("tenantId") Long tenantId, @Param("filters") Filters filters,
            @Param("includeCommission") boolean includeCommission, @Param("dataScope") DataScope dataScope);
    PayrollBinding payroll(@Param("tenantId") Long tenantId, @Param("compChangeId") Long compChangeId);
    String approval(@Param("tenantId") Long tenantId, @Param("allocationId") Long allocationId);
    List<Choice> periods(@Param("tenantId") Long tenantId);
    List<Choice> components(@Param("tenantId") Long tenantId);

    record Filters(LocalDate startDate, LocalDate endDate, String currency, String eventType, String bizType, Long bizId) { }
    record Choice(Long id, String name) { }
    record PayrollBinding(Long compChangeId, String sourceBizType, String sourceBizId, Long employeeId, Integer deleted,
            Long payrollPeriodId, Long salaryComponentId, String status, String auditJson) { }
    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    class Row {
        private Long allocationId;
        private Long eventId;
        private Long reversalOfId;
        private String eventType;
        private String bizType;
        private Long bizId;
        private String customerName;
        private String businessName;
        private LocalDateTime occurredTime;
        private String currency;
        private Integer teamVersion;
        private Integer baselineFlag;
        private Long salesUserId;
        private String salesUserName;
        private Long deptId;
        private String deptName;
        private String roleType;
        private BigDecimal allocatedPercentage;
        private BigDecimal allocatedAmount;
        private BigDecimal commissionRate;
        private BigDecimal commissionAmount;
        private String commissionStatus;
        private Long compChangeId;
        private Long payrollPeriodId;
        private String payrollPeriodName;
        private String payrollState;
        private Boolean commissionRequested;
    }
}
