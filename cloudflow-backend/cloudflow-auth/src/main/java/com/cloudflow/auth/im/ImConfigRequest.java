package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString(onlyExplicitlyIncluded = true)
public class ImConfigRequest {
    @Positive
    private Long configId;
    @Min(0)
    private Integer version;
    @NotBlank
    @Size(max = 20)
    private String imType;
    @NotBlank
    @Size(max = 100)
    private String corpId;
    @NotBlank
    @Size(max = 100)
    private String agentId;
    @NotNull
    @Valid
    private SecretChange appKey;
    @NotNull
    @Valid
    private SecretChange appSecret;
    @NotNull
    @Valid
    private SecretChange token;
    @NotNull
    @Valid
    private SecretChange aesKey;
    @Size(max = 1000)
    private String callbackUrl;
    @NotNull
    private Boolean syncEnabled;
    @Size(max = 100)
    private String syncCron;
    @NotNull
    private Boolean loginEnabled;
    @NotNull
    private Boolean messageEnabled;
    @NotNull
    private Boolean todoEnabled;
    @Valid
    private SyncScope syncScope;
    @NotBlank
    private String status;

    @JsonAnySetter
    public void rejectUnknown(String name, Object value) { throw ImFailure.configuration(); }

    public enum SecretAction { KEEP, REPLACE, CLEAR }

    @Getter
    @Setter
    @ToString(onlyExplicitlyIncluded = true)
    public static class SecretChange {
        @NotNull
        private SecretAction action;
        @Size(max = 1024)
        @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
        private String value;

        @JsonAnySetter
        public void rejectUnknown(String name, Object value) { throw ImFailure.configuration(); }
    }

    @Getter
    @Setter
    public static class SyncScope {
        @NotNull
        @Positive
        private Long localRootDeptId;
        @NotNull
        @Size(min = 1, max = 100)
        private List<@NotNull @Positive Long> remoteDepartmentIds;
        @Size(max = 10000)
        private Map<@NotBlank @Size(max = 128) String, @NotNull @Positive Long> primaryDepartments;

        @JsonAnySetter
        public void rejectUnknown(String name, Object value) { throw ImFailure.configuration(); }

        @Override
        public String toString() { return "ImSyncScope[root=" + localRootDeptId + "]"; }
    }
}
