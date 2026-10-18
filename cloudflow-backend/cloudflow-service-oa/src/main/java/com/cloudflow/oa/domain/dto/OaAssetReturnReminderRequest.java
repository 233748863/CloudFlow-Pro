package com.cloudflow.oa.domain.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

public record OaAssetReturnReminderRequest(@NotNull @Positive Long employeeId, @NotNull @Positive Long userId,
        @NotNull @Positive Long settlementId, @NotNull @Positive Long assetId,
        @NotNull @PositiveOrZero Integer assetVersion, @NotNull @PositiveOrZero Long lastReminderId) { }
