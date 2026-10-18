package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

/**
 * 导入数据库表请求。
 */
@Data
public class CodegenImportDTO {

    @NotEmpty(message = "请选择需要导入的表")
    private List<String> tableNames;

    @NotBlank(message = "模块名不能为空")
    private String moduleName;
}
