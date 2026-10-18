package com.cloudflow.auth.domain.dto;

import com.cloudflow.auth.domain.SysCodegenColumn;
import com.cloudflow.auth.domain.SysCodegenTable;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 保存代码生成配置请求。
 */
@Data
public class CodegenSaveDTO {

    @Valid
    @NotNull(message = "表配置不能为空")
    private SysCodegenTable table;

    @Valid
    @NotNull(message = "字段配置不能为空")
    private List<SysCodegenColumn> columns;
}
