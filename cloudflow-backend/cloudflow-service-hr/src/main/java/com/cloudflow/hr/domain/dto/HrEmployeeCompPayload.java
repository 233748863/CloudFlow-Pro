package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

@Data
@TableName("hr_employee_comp")
public class HrEmployeeCompPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private Long structureId;
    private Long gradeId;

    @JsonIgnore
    @EncryptField
    @TableField("component_values")
    private String componentValuesText;

    @TableField(exist = false)
    private Map<String, Object> componentValues;

    @JsonIgnore
    @EncryptField
    @TableField("total_salary")
    private String totalSalaryText;

    @TableField(exist = false)
    private BigDecimal totalSalary;
    private LocalDate effectiveDate;
    private String status;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public Map<String, Object> getComponentValues() {
        if (componentValues == null && componentValuesText != null) {
            componentValues = HrFieldCodec.parseJsonMap(componentValuesText);
        }
        return componentValues;
    }

    public void setComponentValues(Map<String, Object> componentValues) {
        this.componentValues = componentValues;
        this.componentValuesText = HrFieldCodec.formatJson(componentValues);
    }

    public BigDecimal getTotalSalary() {
        if (totalSalary == null && totalSalaryText != null) {
            totalSalary = HrFieldCodec.parseDecimal(totalSalaryText);
        }
        return totalSalary;
    }

    public void setTotalSalary(BigDecimal totalSalary) {
        this.totalSalary = totalSalary;
        this.totalSalaryText = HrFieldCodec.formatDecimal(totalSalary);
    }
}
