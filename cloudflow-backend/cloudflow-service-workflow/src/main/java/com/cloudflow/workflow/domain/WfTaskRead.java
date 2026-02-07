package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

@Data
@TableName("wf_task_read")
public class WfTaskRead {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private String taskId;
    
    private Long userId;
    
    private Date readTime;
}
