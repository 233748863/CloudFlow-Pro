package cn.joywon.poco.knowledge.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * AI OCR
 *
 * @author poco
 * @date 2024-09-10 00:49:08
 */
@Data
@TableName("ai_ocr_conf")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "AI OCR")
public class AiOcrConfEntity extends Model<AiOcrConfEntity> {

	/**
	 * 主键
	 */
	@TableId(type = IdType.ASSIGN_ID)
	@Schema(description = "主键")
	private Long id;

	/**
	 * 标题
	 */
	@Schema(description = "标题")
	private String ocrTitle;

	/**
	 * 描述提示词
	 */
	@Schema(description = "描述提示词")
	private String ocrPrompt;

	/**
	 * 资源base64
	 */
	@Schema(description = "资源base64")
	private String imageResource;

	/**
	 * 标注结果
	 */
	@Schema(description = "标注结果")
	private String ocrMarked;

	/**
	 * createBy
	 */
	@TableField(fill = FieldFill.INSERT)
	@Schema(description = "createBy")
	private String createBy;

	/**
	 * createTime
	 */
	@TableField(fill = FieldFill.INSERT)
	@Schema(description = "createTime")
	private LocalDateTime createTime;

	/**
	 * updateBy
	 */
	@TableField(fill = FieldFill.INSERT_UPDATE)
	@Schema(description = "updateBy")
	private LocalDateTime updateBy;

	/**
	 * updateTime
	 */
	@TableField(fill = FieldFill.INSERT_UPDATE)
	@Schema(description = "updateTime")
	private LocalDateTime updateTime;

	/**
	 * delFlag
	 */
	@TableLogic
	@TableField(fill = FieldFill.INSERT)
	@Schema(description = "delFlag")
	private String delFlag;

	/**
	 * 聊天模型名称
	 */
	@TableField(exist = false)
	private String chatModelName;

	/**
	 * 图像模型名称
	 */
	@TableField(exist = false)
	private String visionModelName;

}
