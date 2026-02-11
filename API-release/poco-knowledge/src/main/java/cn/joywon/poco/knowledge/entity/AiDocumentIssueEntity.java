package cn.joywon.poco.knowledge.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * ISSUE文档
 *
 * @author poco
 * @date 2024-09-21 22:15:00
 */
@Data
@TableName("ai_document_issue")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "ISSUE文档")
public class AiDocumentIssueEntity extends Model<AiDocumentIssueEntity> {

	/**
	 * 主键
	 */
	@TableId(type = IdType.ASSIGN_ID)
	@Schema(description = "主键")
	private Long id;

	/**
	 * 知识库ID
	 */
	@Schema(description = "知识库ID")
	private Long datasetId;

	/**
	 * 文档ID
	 */
	@Schema(description = "文档ID")
	private Long documentId;

	/**
	 * ISSUE_ID
	 */
	@Schema(description = "ISSUE_ID")
	private String issueId;

	/**
	 * 文件来源
	 */
	@Schema(description = "文件来源")
	private String sourceType;

	/**
	 * 页码
	 */
	@Schema(description = "页码")
	private Integer pageNum;

	/**
	 * issue创建时间
	 */
	@Schema(description = "issue创建时间")
	private String createAt;

	/**
	 * 创建人
	 */
	@TableField(fill = FieldFill.INSERT)
	@Schema(description = "创建人")
	private String createBy;

	/**
	 * 创建时间
	 */
	@TableField(fill = FieldFill.INSERT)
	@Schema(description = "创建时间")
	private LocalDateTime createTime;

	/**
	 * 修改人
	 */
	@TableField(fill = FieldFill.INSERT_UPDATE)
	@Schema(description = "修改人")
	private String updateBy;

	/**
	 * 修改时间
	 */
	@TableField(fill = FieldFill.INSERT_UPDATE)
	@Schema(description = "修改时间")
	private LocalDateTime updateTime;

	/**
	 * 删除标记
	 */
	@TableLogic
	@TableField(fill = FieldFill.INSERT)
	@Schema(description = "删除标记")
	private String delFlag;

}
