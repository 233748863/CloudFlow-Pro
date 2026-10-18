package com.cloudflow.auth.domain.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 渠道测试结果展示对象。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChannelTestResultVO {
    private boolean success;
    private String message;
}
