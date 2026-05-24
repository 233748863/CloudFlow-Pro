package com.cloudflow.oa.domain.vo.knowledge;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 知识库版本对比 VO。
 */
@Data
@Schema(name = "KnowledgeVersionDiffVO", description = "知识库版本对比 VO")
public class KnowledgeVersionDiffVO {

    @Schema(description = "源版本")
    private KnowledgeVersionVO fromVersion;

    @Schema(description = "目标版本")
    private KnowledgeVersionVO toVersion;

    @Schema(description = "标题是否变更")
    private Boolean titleChanged;

    @Schema(description = "摘要是否变更")
    private Boolean summaryChanged;

    @Schema(description = "附件是否变更")
    private Boolean attachmentChanged;

    @Schema(description = "正文逐行差异")
    private List<KnowledgeVersionDiffLineVO> contentDiff;
}
