package com.cloudflow.auth.datasource;

import com.cloudflow.common.datasource.runtime.DataSourceFailure;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DataSourceVersionRequest {
    @NotNull
    @Min(0)
    private Integer version;

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) {
        throw new DataSourceFailure("INVALID_TEST_FIELD", "连接测试只接受配置版本，不接受SQL或连接参数", 400);
    }
}
