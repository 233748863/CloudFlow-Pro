package com.cloudflow.common.job.model;

import lombok.Data;

@Data
public class BusinessJobStartRequest {
    private String executeNo;
    private String handlerName;
    private String handlerParam;
    private String operatorName;
}
