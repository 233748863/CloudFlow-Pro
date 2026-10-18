package com.cloudflow.auth.tenantpackage;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TenantSaveRequest {
    @Positive
    private Long tenantId;
    @Min(0)
    private Integer version;
    @NotBlank
    @Size(max = 50)
    private String tenantCode;
    @NotBlank
    @Size(max = 50)
    private String tenantName;
    @Size(max = 50)
    private String contactName;
    @Size(max = 20)
    private String contactPhone;
    @Email
    @Size(max = 50)
    private String contactEmail;
    @Size(max = 500)
    private String allowedEmailDomains;
    @Size(max = 100)
    private String domain;
    @NotNull
    @Pattern(regexp = "[01]")
    private String status;
    private LocalDateTime expireTime;
    @Min(0)
    private Integer userLimit;
    @Min(0)
    private Long storageLimit;
    @Size(max = 500)
    private String remark;
    @Valid
    private Selection packageSelection;

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) { throw TenantPackageFailure.invalid(); }

    @Override
    public String toString() { return "TenantSaveRequest[id=" + tenantId + ", version=" + version + "]"; }

    public record Selection(@NotNull @Positive Long packageId, @NotNull @Min(0) Integer packageVersion,
            @NotNull @Valid AdjustmentsRequest adjustments) {
        @JsonAnySetter
        public void rejectUnknown(String name, Object value) { throw TenantPackageFailure.invalid(); }
    }

    public record AdjustmentsRequest(@NotNull List<@NotNull @Positive Long> addMenuIds,
            @NotNull List<@NotNull @Positive Long> removeMenuIds, @Positive Integer maxUsers, @Positive Long maxStorageMb) {
        @JsonAnySetter
        public void rejectUnknown(String name, Object value) { throw TenantPackageFailure.invalid(); }

        public TenantPackageRules.Adjustments rules() {
            return new TenantPackageRules.Adjustments(addMenuIds, removeMenuIds, maxUsers, maxStorageMb);
        }
    }
}
