package com.cloudflow.common.excel.importing.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("sys_import_task")
public class ImportTask {
    @TableId(type = IdType.AUTO)
    private Long taskId;
    private Long tenantId;
    private String taskNo;
    private String bizType;
    private String bizName;
    private String fileName;
    private String fileUrl;
    private Long fileSize;
    private Integer totalRows;
    private Integer validRows;
    private Integer invalidRows;
    private Integer successRows;
    private Integer failRows;
    private String status;
    private String errorFileUrl;
    private Long operatorId;
    private String operatorName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;
    private Long durationMs;
    private String errorMessage;
    private Long jobLogId;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    public int processedRows() {
        return successRows + failRows;
    }
}
