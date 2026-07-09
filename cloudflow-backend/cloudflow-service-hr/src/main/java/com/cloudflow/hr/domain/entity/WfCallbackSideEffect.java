package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("wf_callback_side_effect")
public class WfCallbackSideEffect {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String businessType;

    private Long businessId;

    private String processInstanceId;

    private String effectKey;

    private LocalDateTime createTime;
}
