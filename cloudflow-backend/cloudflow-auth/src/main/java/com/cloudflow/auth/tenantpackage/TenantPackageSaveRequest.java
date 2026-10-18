package com.cloudflow.auth.tenantpackage;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TenantPackageSaveRequest {
    @Positive
    private Long packageId;
    @Min(0)
    private Integer version;
    @NotBlank
    @Size(max = 64)
    private String packageCode;
    @NotBlank
    @Size(max = 100)
    private String packageName;
    @NotNull
    private List<@NotNull @Positive Long> menuIds;
    @NotNull
    @Size(max = 4)
    private List<@NotBlank String> enabledModules;
    @NotNull
    @Positive
    private Integer maxUsers;
    @NotNull
    @Positive
    private Long maxStorageMb;
    @NotNull
    @DecimalMin("0")
    @Digits(integer = 12, fraction = 2)
    private BigDecimal price;
    @NotBlank
    private String billingCycle;
    @NotNull
    @Min(0)
    private Integer sortNo;
    @NotBlank
    private String status;
    @Size(max = 500)
    private String remark;

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) { throw TenantPackageFailure.invalid(); }

    @Override
    public String toString() { return "TenantPackageSaveRequest[id=" + packageId + ", version=" + version + "]"; }
}
