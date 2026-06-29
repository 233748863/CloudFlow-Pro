package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Legal document belonging to a release batch.
 */
@Data
@TableName("sys_legal_document")
public class SysLegalDocument {

    @TableId(value = "document_id", type = IdType.AUTO)
    private Long documentId;

    private Long releaseId;

    private Long tenantId;

    private String releaseCode;

    private String docType;

    private String title;

    private String version;

    private String content;

    private String externalUrl;

    private Integer required;

    private Integer sortOrder;

    /**
     * 0 normal, 1 disabled.
     */
    private String status;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    private String remark;
}
