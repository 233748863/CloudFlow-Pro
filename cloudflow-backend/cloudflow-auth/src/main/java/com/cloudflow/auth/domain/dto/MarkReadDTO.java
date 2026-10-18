package com.cloudflow.auth.domain.dto;

import lombok.Data;

import java.util.List;

/**
 * 标记消息已读请求。
 */
@Data
public class MarkReadDTO {
    private List<Long> recordIds;
    private String category;
    private Boolean all;
}
