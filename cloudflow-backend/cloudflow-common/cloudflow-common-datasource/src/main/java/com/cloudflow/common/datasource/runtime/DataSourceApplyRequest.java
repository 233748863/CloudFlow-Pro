package com.cloudflow.common.datasource.runtime;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DataSourceApplyRequest {
    private Long configId;
    private Integer version;

    public void validate() {
        if (configId == null || configId <= 0 || version == null || version < 0) {
            throw new DataSourceFailure("INVALID_VERSION", "配置编号和版本不合法", 400);
        }
    }

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) {
        throw new DataSourceFailure("INVALID_COMMAND", "内部数据源指令只能包含配置编号及版本", 400);
    }
}
