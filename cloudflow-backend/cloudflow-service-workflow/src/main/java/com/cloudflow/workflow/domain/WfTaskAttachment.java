package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * P4.9: 任务附件
 */
@Data
@TableName("wf_task_attachment")
public class WfTaskAttachment {
    @TableId
    private String attachmentId;
    /** 租户ID */
    private Long tenantId;
    private String taskId;
    private String instanceId;
    private String fileName;
    private String fileUrl;
    private String fileType;
    private Long fileSize;
    private Long uploaderId;
    private String uploaderName;
    private Date uploadTime;
}
