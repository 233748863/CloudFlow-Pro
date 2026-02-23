package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 协作任务实体类
 */
@Data
@TableName("sys_work_task")
public class WorkTask {
    
    @TableId(type = IdType.AUTO)
    private Long taskId;
    
    private String title;
    
    private String description;
    
    private Long assigneeId;
    
    private Long ownerId;
    
    /** 部门ID */
    private Long deptId;
    
    /**
     * 0:低, 1:中, 2:高
     */
    private Integer priority;
    
    /**
     * TODO, DOING, DONE
     */
    private String status;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime dueDate;
    
    /**
     * JSON数组字符串
     */
    private String tags;
    
    private Long parentId;
    
    private String createBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    private String updateBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
    
    @TableLogic
    private String delFlag;
    
    /** 租户ID */
    private Long tenantId;
}
