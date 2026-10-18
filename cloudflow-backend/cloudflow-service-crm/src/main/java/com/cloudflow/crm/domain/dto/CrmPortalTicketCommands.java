package com.cloudflow.crm.domain.dto;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

public final class CrmPortalTicketCommands {
    private CrmPortalTicketCommands() { }

    @Getter
    @Setter
    public static class Versioned {
        @NotNull @Min(0) private Integer version;

        @JsonAnySetter
        public void unknown(String field, Object value) {
            throw new ServiceException("工单操作包含不允许的字段", 400);
        }
    }

    @Getter
    @Setter
    public static final class Assignment extends Versioned {
        @NotNull @Min(1) private Long ownerId;
    }

    @Getter
    @Setter
    public static final class Publication extends Versioned {
        @NotNull private Boolean publish;
        @Size(max = 10000) private String solution;
    }
}
