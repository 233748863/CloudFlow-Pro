package com.cloudflow.auth.domain.vo;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 代码写盘结果。
 */
@Data
@Builder
public class CodegenWriteResultVO {
    private List<String> written;
    private List<String> skipped;
    private List<String> overwritten;
}
