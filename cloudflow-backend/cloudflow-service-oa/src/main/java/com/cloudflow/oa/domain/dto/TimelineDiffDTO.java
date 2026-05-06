package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * 时间线快照差异。
 */
@Data
public class TimelineDiffDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long eventId;
    private String businessType;
    private Long businessId;
    private String beforeSnapshot;
    private String afterSnapshot;
    private List<ChangedField> changedFields;

    @Data
    public static class ChangedField implements Serializable {
        private static final long serialVersionUID = 1L;

        private String field;
        private Object beforeValue;
        private Object afterValue;
    }
}
