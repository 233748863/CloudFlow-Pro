package com.cloudflow.common.core.domain;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PortalTicketRequest {
    @NotBlank
    @Pattern(regexp = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    private String requestKey;
    @NotBlank @Size(max = 120)
    private String title;
    @NotBlank @Size(max = 1000)
    private String description;
    @NotNull @Size(max = 10)
    private List<@NotNull @Positive Long> fileIds = List.of();

    @JsonAnySetter
    public void unknown(String field, Object value) {
        throw new ServiceException("工单请求包含不允许的字段", 400);
    }
}
