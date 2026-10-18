package com.cloudflow.common.job.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Handler 注册信息。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class HandlerInfo {
    private String handlerName;
    private String handlerDesc;
}
