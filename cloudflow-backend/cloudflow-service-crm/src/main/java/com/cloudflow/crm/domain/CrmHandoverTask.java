package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("oa_crm_handover_task")
public class CrmHandoverTask implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long handoverId;
    private Long tenantId;
    private Long fromOwnerId;
    private String fromOwnerName;
    private Long fromDeptId;
    private String businessType;
    private Long businessId;
    private String businessName;
    private String status;
    private Long toOwnerId;
    private String toOwnerName;
    private String triggerSource;
    private String triggerEventId;
    private String remark;
    private String delFlag;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
