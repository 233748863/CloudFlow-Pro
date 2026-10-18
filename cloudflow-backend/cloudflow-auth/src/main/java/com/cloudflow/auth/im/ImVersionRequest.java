package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ImVersionRequest {
    @NotNull
    @Min(0)
    private Integer version;

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) { throw ImFailure.configuration(); }
}
