package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_recruitment_requisition")
public class HrRecruitmentRequisitionPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String requisitionNo;
    private String title;
    private Long deptId;
    private Long positionId;
    private Integer headcount;
    private Integer hiredCount;

    @JsonIgnore
    @EncryptField
    @TableField("salary_min")
    private String salaryMinText;

    @TableField(exist = false)
    private BigDecimal salaryMin;

    @JsonIgnore
    @EncryptField
    @TableField("salary_max")
    private String salaryMaxText;

    @TableField(exist = false)
    private BigDecimal salaryMax;
    private LocalDate expectedArrivalDate;
    private String reason;
    private String requirements;
    private String status;
    private String processInstanceId;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public BigDecimal getSalaryMin() {
        if (salaryMin == null && salaryMinText != null) {
            salaryMin = HrFieldCodec.parseDecimal(salaryMinText);
        }
        return salaryMin;
    }

    public void setSalaryMin(BigDecimal salaryMin) {
        this.salaryMin = salaryMin;
        this.salaryMinText = HrFieldCodec.formatDecimal(salaryMin);
    }

    public BigDecimal getSalaryMax() {
        if (salaryMax == null && salaryMaxText != null) {
            salaryMax = HrFieldCodec.parseDecimal(salaryMaxText);
        }
        return salaryMax;
    }

    public void setSalaryMax(BigDecimal salaryMax) {
        this.salaryMax = salaryMax;
        this.salaryMaxText = HrFieldCodec.formatDecimal(salaryMax);
    }
}
