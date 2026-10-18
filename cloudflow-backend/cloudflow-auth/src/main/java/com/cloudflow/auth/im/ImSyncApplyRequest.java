package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ImSyncApplyRequest {
    @NotNull
    @Min(0)
    private Integer version;
    @NotNull
    @Pattern(regexp = "[a-f0-9]{64}")
    private String hash;

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) { throw ImFailure.configuration(); }
}
