package com.cloudflow.auth.datasource;

import com.cloudflow.common.datasource.runtime.DataSourceFailure;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DataSourceActivationRequest {
    @NotNull
    @Min(0)
    private Integer version;
    @NotBlank
    @Size(max = 64)
    private String confirmation;
    @Size(max = 5)
    private List<@NotBlank @Size(max = 64) String> targetServices;

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) {
        throw new DataSourceFailure("INVALID_ACTIVATION_FIELD", "请求包含不允许的数据源操作字段", 400);
    }
}
