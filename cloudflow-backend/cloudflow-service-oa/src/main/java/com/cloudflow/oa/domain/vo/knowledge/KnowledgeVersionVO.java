package com.cloudflow.oa.domain.vo.knowledge;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 知识库版本快照对外 VO（含 content，用于详情/diff 场景）。
 *
 * <p>对应 entity {@code KnowledgeDocVersion}。VO 不携带 {@code deleted}、租户内部字段。
 */
@Data
@Schema(name = "KnowledgeVersionVO", description = "知识库版本快照 VO")
public class KnowledgeVersionVO {

    @Schema(description = "版本主键")
    private Long id;

    @Schema(description = "文档 ID")
    private Long documentId;

    @Schema(description = "版本号")
    private Integer versionNo;

    @Schema(description = "标题")
    private String title;

    @Schema(description = "摘要")
    private String summary;

    @Schema(description = "正文内容")
    private String content;

    @Schema(description = "附件 URL")
    private String attachmentUrl;

    @Schema(description = "变更说明")
    private String changeSummary;

    @Schema(description = "操作人 ID")
    private Long operatorId;

    @Schema(description = "操作人姓名")
    private String operatorName;

    @Schema(description = "发布时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime publishTime;

    @Schema(description = "创建人")
    private String createBy;

    @Schema(description = "创建时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @Schema(description = "更新人")
    private String updateBy;

    @Schema(description = "更新时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
