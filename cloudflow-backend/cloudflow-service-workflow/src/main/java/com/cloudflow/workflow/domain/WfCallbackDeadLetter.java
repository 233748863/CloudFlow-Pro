package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("wf_callback_dead_letter")
public class WfCallbackDeadLetter {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String streamKey;
    private String processInstanceId;
    private String businessType;
    private Long businessId;
    private String payloadJson;
    private Integer retryCount;
    private String lastError;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
