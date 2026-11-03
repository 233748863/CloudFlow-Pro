package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 完成历史与其发生前最后一次催办的固定关联。
 */
@Data
@TableName("wf_urge_effect")
public class WfUrgeEffect {
    @TableId
    private String historyId;
    private Long tenantId;
    private Long urgeId;
}
