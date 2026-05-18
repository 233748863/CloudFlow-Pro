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
@TableName("oa_work_task")
public class WorkTask {
    
    @TableId(type = IdType.AUTO)
    private Long taskId;
    
    private String title;
    
    private String description;
    
    private Long assigneeId;
    
    private Long ownerId;
    
    /** 部门ID */
    private Long deptId;

    /** 项目ID */
    private Long projectId;

    /** 里程碑ID */
    private Long milestoneId;

    /** WBS编码 */
    private String wbsCode;
    
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

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime plannedStartTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime plannedEndTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime baselineStartTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime baselineEndTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actualStartTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actualEndTime;

    private java.math.BigDecimal progress;

    private java.math.BigDecimal estimatedHours;

    private java.math.BigDecimal actualHours;
    
    /**
     * JSON数组字符串
     */
    private String tags;
    
    private Long parentId;

    private Integer sortOrder;
    
    private String createBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    private String updateBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
    
    @TableLogic
    private Integer deleted;
    
    /** 租户ID */
    private Long tenantId;
}
