package com.cloudflow.common.core.report;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.math.BigDecimal;
import lombok.Data;

@Data
public class ReportRow {
    private String dimension1;
    private String dimension2;
    private String label1;
    private String label2;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal measure1;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal measure2;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal measure3;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal measure4;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal measure5;
    @JsonIgnore
    private Long sourceRows;
    @JsonIgnore
    private Long integrityError;
    @JsonIgnore
    private Boolean missingDateSummary;
}
