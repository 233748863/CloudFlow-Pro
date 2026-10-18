package com.cloudflow.common.core.domain;

import lombok.Data;

@Data
public class PortalFileVO {
    private Long fileId;
    private String fileName;
    private Long fileSize;
    private String extension;
}
