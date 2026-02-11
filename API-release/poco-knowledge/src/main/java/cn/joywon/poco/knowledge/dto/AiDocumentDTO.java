package cn.joywon.poco.knowledge.dto;

import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import lombok.Data;
import lombok.experimental.FieldNameConstants;

import java.util.List;

/**
 * 文档传输
 *
 * @author poco
 * @date 2024/3/14
 */
@Data
@FieldNameConstants
public class AiDocumentDTO {

	/**
	 * 文档ID
	 */
	private Long id;

	/**
	 * 所属知识库
	 */
	private Long datasetId;

	/**
	 * 文件链接
	 */
	private List<AiDocumentEntity> files;

	/**
	 * 文件内容
	 */
	private String content;

	/**
	 * 文件来源
	 */
	private String sourceType;

	/**
	 * 文件状态
	 */
	private String fileStatus;

	/**
	 * 文件名称
	 */
	private String name;

	/**
	 * 存储库类型
	 */
	private String repoType;

	/**
	 * 存储库所有者
	 */
	private String repoOwner;

	/**
	 * 存储库名称
	 */
	private String repoName;

	/**
	 * 访问令牌
	 */
	private String accessToken;

}
