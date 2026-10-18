package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_grievance_record")
public class HrGrievanceRecord implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long recordId;
    private Long tenantId;
    private Long grievanceId;
    private String recordType;
    private Long operatorId;
    private String operatorName;
    private String operatorRole;
    private String content;
    private String attachmentUrl;
    private Integer visibleToEmployeeFlag;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
