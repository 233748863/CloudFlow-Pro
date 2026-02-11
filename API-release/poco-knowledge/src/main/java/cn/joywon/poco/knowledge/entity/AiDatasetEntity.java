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
 * 知识库
 *
 * @author pig
 * @date 2024-03-14 13:39:21
 */
@Data
@TableName("ai_dataset")
@FieldNameConstants
@EqualsAndHashCode(callSuper = true)
@Schema(description = "知识库")
public class AiDatasetEntity extends Model<AiDatasetEntity> {

	/**
	 * 主键
	 */
	@TableId(type = IdType.ASSIGN_ID)
	@Schema(description = "主键")
	private Long id;

	/**
	 * 名称
	 */
	@Schema(description = "名称")
	private String name;

	/**
	 * 集合名称
	 */
	@Schema(description = "集合名称")
	private String collectionName;

	/**
	 * 向量库 ID
	 */
	@Schema(description = "集合ID")
	private Long storeId;

	/**
	 * 头像
	 */
	@Schema(description = "头像")
	private String avatarUrl;

	/**
	 * 描述
	 */
	@Schema(description = "描述")
	private String description;

	/**
	 * 知识数量
	 */
	@Schema(description = "知识数量")
	private Long units = 0L;

	/**
	 * 大小
	 */
	@Schema(description = "大小")
	private Long fileSize = 0L;

	/**
	 * 支持多轮会话 0 不支持 1 / 2/ 3
	 */
	@Schema(description = "多轮会话")
	private Integer multiRound = 5;

	/**
	 * 匹配率 80%
	 */
	@Schema(description = "匹配率")
	private Integer score;

	/**
	 * 匹配条数 2-5
	 */
	@Schema(description = "匹配条数")
	private Integer topK;

	/**
	 * 分片长度 (默认分配长度)
	 */
	private Integer fragmentSize = 2000;

	/**
	 * 展示排序值
	 */
	@Schema(description = "排序值")
	private Integer sortOrder;

	/**
	 * 未匹配数据提示
	 */
	@Schema(description = "未匹配提示")
	private String emptyDesc;

	/**
	 * 敏感词开关
	 */
	@Schema(description = "敏感词开关")
	private String sensitiveFlag;

	/**
	 * 敏感词提示
	 */
	@Schema(description = "命中敏感词提示")
	private String sensitiveMsg;

	/**
	 * 知识库欢迎语
	 */
	@Schema(description = "知识库欢迎语")
	private String welcomeMsg;

	/**
	 * 是否对外开放
	 */
	@Schema(description = "是否对外开放")
	private String publicFlag;

	/**
	 * 对外开放密码
	 */
	@Sensitive(type = SensitiveTypeEnum.KEY)
	@Schema(description = "是否对外开放")
	private String publicPassword;

	/**
	 * 使用标注数据
	 */
	@Schema(description = "使用标注数据")
	private String standardFlag;

	/**
	 * 上传文档是否提前预总结
	 */
	@Schema(description = "是否预先总结")
	private String preSummary;

	/**
	 * 会话是否提前压缩
	 */
	@Schema(description = "是否预先总结")
	private String preCompress;

	/**
	 * AI OCR 0 不支持 1 支持
	 */
	@Schema(description = "AI OCR")
	private String aiOcrFlag;

	/**
	 * 嵌入模型
	 */
	@Schema(description = "嵌入模型")
	private String embeddingModel;

	/**
	 * 摘要模型
	 */
	@Schema(description = "摘要模型")
	private String summaryModel;

	/**
	 * 底部版权信息
	 */
	@Schema(description = "底部版权信息")
	private String footer;

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
