package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.util.Date;

/**
 * 会议室实体
 */
@Data
@TableName("sys_meeting_room")
public class MeetingRoom {
    
    @TableId(type = IdType.AUTO)
    private Long roomId;
    
    private String name;
    
    private Integer capacity;
    
    private String location;
    
    /**
     * JSON Array: ["投影仪", "白板"]
     */
    private String equipment;
    
    /**
     * 1:可用, 0:维护中
     */
    private String status;
    
    private String createBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;
    
    private String updateBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date updateTime;
    
    @TableLogic
    private String delFlag;
}
