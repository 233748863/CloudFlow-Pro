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
import java.time.LocalDateTime;
import java.util.Map;

@Data
@TableName("hr_tax_profile")
public class HrTaxProfilePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private String taxResidenceCity;

    @JsonIgnore
    @EncryptField
    @TableField("threshold")
    private String thresholdText;

    @TableField(exist = false)
    private BigDecimal threshold;

    @TableField(exist = false)
    private Map<String, Object> taxConfig;

    @JsonIgnore
    @EncryptField
    @TableField("tax_config")
    private String taxConfigText;

    private String status;
    private LocalDateTime createTime;
    @Version
    private Integer version;
    private LocalDateTime updateTime;

    public BigDecimal getThreshold() {
        if (threshold == null && thresholdText != null) {
            threshold = HrFieldCodec.parseDecimal(thresholdText);
        }
        return threshold;
    }

    public void setThreshold(BigDecimal threshold) {
        this.threshold = threshold;
        this.thresholdText = HrFieldCodec.formatDecimal(threshold);
    }

    public Map<String, Object> getTaxConfig() {
        if (taxConfig == null && taxConfigText != null) {
            taxConfig = HrFieldCodec.parseJsonMap(taxConfigText);
        }
        return taxConfig;
    }

    public void setTaxConfig(Map<String, Object> taxConfig) {
        this.taxConfig = taxConfig;
        this.taxConfigText = HrFieldCodec.formatJson(taxConfig);
    }
}
