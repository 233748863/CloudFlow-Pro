package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_talent_pool")
public class HrTalentPoolPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String poolNo;
    private String poolName;
    private String poolType;
    private String description;
    private Long ownerId;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
