package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 手动触发任务请求。
 */
@Data
public class JobTriggerDTO {
    private String handlerParam;
}
