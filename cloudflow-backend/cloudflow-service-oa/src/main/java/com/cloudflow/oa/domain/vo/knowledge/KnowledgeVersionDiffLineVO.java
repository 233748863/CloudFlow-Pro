package com.cloudflow.oa.domain.vo.knowledge;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 知识库版本 diff 行 VO。每行携带类型与文本：
 * <ul>
 *   <li>{@code EQUAL} 两版本相同行</li>
 *   <li>{@code DEL}   仅出现在 from 版本（已删除）</li>
 *   <li>{@code ADD}   仅出现在 to 版本（已新增）</li>
 * </ul>
 */
@Data
@Schema(name = "KnowledgeVersionDiffLineVO", description = "知识库版本 diff 行")
public class KnowledgeVersionDiffLineVO {

    @Schema(description = "差异类型 EQUAL/DEL/ADD")
    private String type;

    @Schema(description = "行文本")
    private String text;
}
