package com.cloudflow.common.excel.importing.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ImportErrorRecord {
    private Long errorId;
    private Long tenantId;
    private Long taskId;
    private Integer rowNo;
    private String columnName;
    private String cellValue;
    private String errorType;
    private String errorMessage;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
