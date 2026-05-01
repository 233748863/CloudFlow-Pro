package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 借出、归还、催还操作入参。
 */
@Data
public class OaBorrowActionDTO {
    private String remark;
    private String attachmentUrl;
}
