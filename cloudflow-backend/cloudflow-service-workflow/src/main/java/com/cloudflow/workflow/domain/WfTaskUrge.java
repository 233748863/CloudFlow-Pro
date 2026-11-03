package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("wf_task_urge")
public class WfTaskUrge {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /** 租户ID */
    private Long tenantId;
    
    private String taskId;
    
    private Long senderId;
    
    private Long recipientId;
    
    private String reason;

    /** 自动提醒的稳定身份；人工催办留空，每次保存独立记录。 */
    private String sourceKey;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    
    private LocalDateTime createTime;
}
