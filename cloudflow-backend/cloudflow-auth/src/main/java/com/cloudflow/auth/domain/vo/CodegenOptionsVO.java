package com.cloudflow.auth.domain.vo;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 代码生成器可选项。
 */
@Data
@Builder
public class CodegenOptionsVO {
    private List<String> modules;
    private List<String> templateCategories;
    private List<String> queryTypes;
    private List<String> htmlTypes;
    private List<String> javaTypes;
}
