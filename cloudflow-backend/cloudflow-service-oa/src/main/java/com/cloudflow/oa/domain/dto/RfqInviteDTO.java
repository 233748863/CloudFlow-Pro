package com.cloudflow.oa.domain.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public record RfqInviteDTO(@NotNull Integer version, @Pattern(regexp = "EMAIL|PHONE|OFFLINE") @NotNull String channel,
        @NotEmpty @Size(max = 200) List<@NotNull Long> supplierIds) { }
