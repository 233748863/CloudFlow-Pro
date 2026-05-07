package com.cloudflow.workflow.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("wf_hot_update_record")
public class WfHotUpdateRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String processKey;
    private Integer fromVersion;
    private Integer toVersion;
    private String migrationMode;
    private Integer totalInstances;
    private Integer migratedCount;
    private Integer skippedCount;
    private Integer failedCount;
    private String executedBy;
    private LocalDateTime executedAt;
    private String detailsJson;
    private Long tenantId;
}
