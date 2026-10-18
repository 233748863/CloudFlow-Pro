package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 写入生成代码请求。
 */
@Data
public class CodegenWriteDTO {
    private String targetRoot;
    private Boolean confirmOverwrite = Boolean.FALSE;
}
