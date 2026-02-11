package cn.joywon.poco.knowledge.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.FieldNameConstants;

import java.time.LocalDateTime;

/**
 * 聊天记录
 *
 * @author pig
 * @date 2024-07-03 12:39:32
 */
@Data
@TableName("ai_chat_record")
@FieldNameConstants
@EqualsAndHashCode(callSuper = true)
@Schema(description = "聊天记录")
public class AiChatRecordEntity extends Model<AiChatRecordEntity> {

	/**
	 * 主键
	 */
	@TableId(type = IdType.ASSIGN_ID)
	@Schema(description = "主键")
	private Long recordId;

	/**
	 * 型号名称
	 */
	@Schema(description = "型号名称")
	private String modelName;

	/**
	 * 浏览器标识
	 */
	@Schema(description = "浏览器标识")
	private String userAgent;

	/**
	 * 用户标识
	 */
	@Schema(description = "用户标识")
	private String username;

	/**
	 * 问题
	 */
	@NotBlank
	@Schema(description = "问题")
	private String questionText;

	/**
	 * 答案
	 */
	@NotBlank
	@Schema(description = "答案")
	private String answerText;

	/**
	 * 详细信息
	 */
	@Schema(description = "扩展信息")
	private String extDetails;

	/**
	 * 所属知识库
	 */
	@Schema(description = "所属知识库")
	private Long datasetId;

	/**
	 * 知识库名称
	 */
	@TableField(exist = false)
	private String datasetName;

	/**
	 * 关联文档IDs
	 */
	@Schema(description = "关联文档IDs")
	private String documentIds;

	/**
	 * 匹配度
	 */
	@Schema(description = "匹配度")
	private String suitability;

	/**
	 * 客户端IP
	 */
	@Schema(description = "客户端IP")
	private String ip;

	/**
	 * 会话ID
	 */
	@Schema(description = "会话ID")
	private String conversationId;

	/**
	 * 网络搜索
	 */
	@Schema(description = "网络搜索")
	private String websearchFlag;

	/**
	 * 标注
	 */
	@Schema(description = "标注")
	private String standardFlag;

	/**
	 * 大模型交互结果
	 */
	@Schema(description = "大模型交互结果")
	private String llmFlag;

	/**
	 * 内部调用
	 */
	@Schema(description = "内部调用")
	private String innerFlag;

	/**
	 * 保存向量ID
	 */
	@Schema(description = "向量ID")
	private String qdrantId;

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
