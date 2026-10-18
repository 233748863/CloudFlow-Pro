package com.cloudflow.common.core.domain;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.Data;

/** Finance-only projection; preserve long identifiers in browser JSON. */
@Data
public class PortalFinanceAttachment {
    @JsonSerialize(using = ToStringSerializer.class)
    private Long fileId;
    private String fileName;
    private Long fileSize;
    private String extension;
}
