package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * OA-P1-3 知识库文档模板。
 */
@Data
@TableName("oa_knowledge_template")
public class OaKnowledgeTemplate implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String templateCode;
    private String templateName;
    /** MEETING / WEEKLY / REVIEW / POLICY / OTHER */
    private String category;
    private String summary;
    /** 富文本 HTML 正文 */
    private String content;
    private String coverUrl;
    /** ACTIVE / INACTIVE */
    private String status;
    private Integer usageCount;
    private Integer deleted;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
