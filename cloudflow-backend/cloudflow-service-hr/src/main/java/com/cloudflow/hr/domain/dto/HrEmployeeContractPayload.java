package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_employee_contract", autoResultMap = true)
public class HrEmployeeContractPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private String contractType;
    private String contractNo;
    private LocalDate signDate;
    private LocalDate startDate;
    private LocalDate endDate;
    private String status;
    private String signStatus;
    private LocalDateTime signedAt;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> attachmentUrls;
}
