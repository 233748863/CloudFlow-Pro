package com.cloudflow.crm.domain.vo;

import lombok.Data;

@Data
public class CrmHealthReasonItemVO {
    private String type;
    private String code;
    private String name;
    private String level;
    private String linkTarget;
}
