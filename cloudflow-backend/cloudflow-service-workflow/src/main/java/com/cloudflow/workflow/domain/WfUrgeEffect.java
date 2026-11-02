package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDateTime;

/** 任务催办次数与响应时间汇总。 */
@Data
@TableName("wf_urge_effect")
public class WfUrgeEffect {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String taskId;
    private Integer urgeCount;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime firstUrgeTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastUrgeTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime taskCompleteTime;
    private Integer responseSeconds;
}
