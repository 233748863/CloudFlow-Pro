package cn.joywon.poco.knowledge.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import cn.joywon.poco.common.sensitive.annotation.Sensitive;
import cn.joywon.poco.common.sensitive.core.SensitiveTypeEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.FieldNameConstants;

import java.time.LocalDateTime;

/**
 * 账单
 *
 * @author pig
 * @date 2024-03-26 11:26:59
 */
@Data
@TableName("ai_bill")
@FieldNameConstants
@EqualsAndHashCode(callSuper = true)
@Schema(description = "账单")
public class AiBillEntity extends Model<AiBillEntity> {

	/**
	 * 主键ID
	 */
	@TableId(type = IdType.ASSIGN_ID)
	@Schema(description = "主键ID")
	private Long id;

	/**
	 * 用户ID
	 */
	@Schema(description = "用户ID")
	private Long userId;

	@Schema(description = "消息messageKey")
	private Long messageKey;

	/**
	 * 用户名
	 */
	@TableField(exist = false)
	private String username;

	/**
	 * 提示令牌数量
	 */
	@Schema(description = "提示令牌数量")
	private Long promptTokens;

	/**
	 * 补全令牌数量
	 */
	@Schema(description = "补全令牌数量")
	private Long completionTokens;

	/**
	 * 模型名称
	 */
	@Schema(description = "模型名称")
	private String model;

	/**
	 * 请求ID
	 */
	@Schema(description = "请求ID")
	private String reqid;

	/**
	 * IP地址
	 */
	@Schema(description = "IP地址")
	@Sensitive(type = SensitiveTypeEnum.IPV4)
	private String ip;

	/**
	 * 备注
	 */
	@Schema(description = "备注")
	private String note;

	/**
	 * 令牌ID
	 */
	@Schema(description = "令牌ID")
	private Long tokenId;

	/**
	 * 令牌数量
	 */
	@Schema(description = "令牌数量")
	private Long tokens;

	/**
	 * 令牌类型 0 系统 1 用户
	 */
	@Schema(description = "令牌类型 0 系统  1 用户")
	private String tokenType;

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
