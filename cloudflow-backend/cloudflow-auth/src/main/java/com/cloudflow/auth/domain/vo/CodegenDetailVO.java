package com.cloudflow.auth.domain.vo;

import com.cloudflow.auth.domain.SysCodegenColumn;
import com.cloudflow.auth.domain.SysCodegenTable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 表与字段配置详情。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CodegenDetailVO {
    private SysCodegenTable table;
    private List<SysCodegenColumn> columns;
}
