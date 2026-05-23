package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_candidate", autoResultMap = true)
public class HrCandidatePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String candidateNo;
    private Long requisitionId;
    private String name;
    private String gender;
    private String phone;
    private String email;
    private String source;
    private Long channelId;
    private String status;
    private String rejectReason;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> resumeAttachmentUrls;
}
