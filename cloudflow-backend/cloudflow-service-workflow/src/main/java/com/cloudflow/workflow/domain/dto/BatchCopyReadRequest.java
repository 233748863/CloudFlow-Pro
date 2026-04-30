package com.cloudflow.workflow.domain.dto;

import lombok.Data;

import java.util.List;

/**
 * 批量标记抄送已读入参。
 */
@Data
public class BatchCopyReadRequest {

    private List<Long> copyIds;
}
