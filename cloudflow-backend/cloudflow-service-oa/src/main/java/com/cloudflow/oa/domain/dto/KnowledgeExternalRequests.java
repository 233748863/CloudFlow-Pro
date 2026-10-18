package com.cloudflow.oa.domain.dto;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

public final class KnowledgeExternalRequests {
    private KnowledgeExternalRequests() { }

    @Getter
    @Setter
    public static class Version {
        @NotNull @Min(0)
        private Integer version;

        @JsonAnySetter
        public void unknown(String field, Object value) { throw new ServiceException("请求包含不允许的字段", 400); }
    }

    @Getter
    @Setter
    public static final class Publish extends Version {
        @NotNull @Min(1)
        private Long versionId;
        @NotNull @Size(max = 5)
        private List<@NotNull @Min(1) Long> attachmentFileIds;
    }
}
