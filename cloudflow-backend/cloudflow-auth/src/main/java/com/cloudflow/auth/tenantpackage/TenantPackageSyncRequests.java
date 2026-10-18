package com.cloudflow.auth.tenantpackage;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.util.List;

public final class TenantPackageSyncRequests {
    private TenantPackageSyncRequests() { }

    public record Preview(@NotEmpty List<@NotNull @Positive Long> tenantIds) {
        @JsonAnySetter
        public void rejectUnknown(String name, Object value) { throw TenantPackageFailure.invalid(); }
    }

    public record Confirmation(@NotBlank @Pattern(regexp = "[0-9a-f]{64}") String previewHash) {
        @JsonAnySetter
        public void rejectUnknown(String name, Object value) { throw TenantPackageFailure.invalid(); }
    }
}
