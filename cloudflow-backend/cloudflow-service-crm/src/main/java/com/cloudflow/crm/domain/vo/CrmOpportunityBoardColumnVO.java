package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class CrmOpportunityBoardColumnVO {
    private String stage;
    private String stageLabel;
    private Integer count;
    private BigDecimal totalAmount;
    private List<CrmOpportunityBoardCardVO> items = new ArrayList<>();
}
