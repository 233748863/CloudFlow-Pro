package com.cloudflow.auth.im;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.javers.core.metamodel.annotation.DiffIgnore;

@Getter
@Setter
@ToString(onlyExplicitlyIncluded = true)
@TableName("sys_im_sync_run")
public class ImSyncRunRow {
    @TableId(type = IdType.AUTO)
    @ToString.Include
    private Long syncRunId;
    @ToString.Include
    private Long tenantId;
    private Long configId;
    private Integer configVersion;
    private String mode;
    @JsonIgnore
    @DiffIgnore
    private String snapshotEncrypted;
    private String snapshotHash;
    private Boolean fullSnapshotFlag;
    private String progressCursor;
    private String resultSummary;
    private String status;
    private Long requestedBy;
    private LocalDateTime startedTime;
    private LocalDateTime completedTime;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
