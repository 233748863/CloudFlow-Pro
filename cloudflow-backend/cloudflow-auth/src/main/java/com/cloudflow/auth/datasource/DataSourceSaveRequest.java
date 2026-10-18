package com.cloudflow.auth.datasource;

import com.cloudflow.common.datasource.runtime.DataSourceFailure;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DataSourceSaveRequest {
    @Positive
    private Long configId;
    @Min(0)
    private Integer version;
    @NotBlank
    @Size(max = 100)
    private String configName;
    @NotBlank
    @Size(max = 64)
    private String dsKey;
    @NotBlank
    @Size(max = 1000)
    private String url;
    @NotBlank
    @Size(max = 100)
    private String username;
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Size(max = 512)
    private String password;
    @NotNull
    private SecretAction secretAction;
    @NotNull
    @Min(1)
    @Max(20)
    private Integer maxActive = 5;
    @NotEmpty
    @Size(max = 5)
    private List<@NotBlank @Size(max = 64) String> targetServices;
    @Size(max = 500)
    private String remark;

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) {
        throw new DataSourceFailure("INVALID_CONFIG_FIELD", "请求包含不允许修改的数据源配置字段", 400);
    }

    @Override
    public String toString() { return "DataSourceSaveRequest[id=" + configId + ", version=" + version + "]"; }

    public enum SecretAction { KEEP, REPLACE, CLEAR }
}
