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
@TableName("hr_offer")
public class HrOfferPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String offerNo;
    private Long candidateId;
    private Long positionId;

    @JsonIgnore
    @EncryptField
    @TableField("salary")
    private String salaryText;

    @TableField(exist = false)
    private BigDecimal salary;
    private LocalDate expectedArrivalDate;
    private LocalDate expireDate;
    private String offerContent;
    private String status;
    private String processInstanceId;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public BigDecimal getSalary() {
        if (salary == null && salaryText != null) {
            salary = HrFieldCodec.parseDecimal(salaryText);
        }
        return salary;
    }

    public void setSalary(BigDecimal salary) {
        this.salary = salary;
        this.salaryText = HrFieldCodec.formatDecimal(salary);
    }
}
