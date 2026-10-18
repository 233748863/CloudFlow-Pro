package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("oa_supplier_qualification_reminder_log")
public class OaSupplierQualificationReminderLog implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long qualificationId;

    private Long supplierId;

    private String certName;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expireDate;

    private Integer daysBefore;

    private Long recipientId;

    private String recipientName;

    private String reminderType;

    private Long operatorId;

    private String operatorName;

    private String reminderContent;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime reminderTime;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
