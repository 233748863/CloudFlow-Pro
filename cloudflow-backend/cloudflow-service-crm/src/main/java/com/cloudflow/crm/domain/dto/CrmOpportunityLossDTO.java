package com.cloudflow.crm.domain.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class CrmOpportunityLossDTO {
    @NotNull
    @jakarta.validation.constraints.Min(0)
    private Integer version;
    @Valid
    @NotEmpty
    @Size(max = 20)
    private List<Reason> reasons;
    @Size(max = 500)
    private String comment;

    @Data
    public static class Reason {
        @NotNull
        private Long reasonId;
        private Long competitorId;
        private BigDecimal amountLost;
        private Boolean isPrimary;
        @Size(max = 500)
        private String remark;
    }
}
