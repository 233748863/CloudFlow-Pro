package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * P4.22: 发布记录
 */
@Data
@TableName("wf_deploy_record")
public class WfDeployRecord {
    @TableId
    private String recordId;
    private String definitionId;
    private String processKey;
    private Integer version;
    private Long deployerId;
    private String deployerName;
    private String deployNote;
    private String changeLog;
    private Date deployTime;
}
