package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * P4.27: 催办效果记录
 */
@Data
@TableName("wf_urge_effect")
public class WfUrgeEffect {
    @TableId
    private String effectId;
    private String urgeId;
    private String taskId;
    private Long beforeDuration;
    private Long afterDuration;
    private Integer effectiveness;
    private Date urgeTime;
    private Date completeTime;
}
