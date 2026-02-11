package cn.joywon.poco.knowledge.support.handler.source;

import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;

import java.util.List;

/**
 * 文档数据源处理器
 *
 * @author poco
 * @date 2024/10/3
 */
public interface FileSourceTypeHandler {

	/**
	 * 支持的源类型
	 * @param sourceType 源类型
	 * @return boolean
	 */
	boolean supports(String sourceType);

	/**
	 * 保存文档
	 * @param documentDTO 文档 DTO
	 * @return {@link List }<{@link AiDocumentEntity }>
	 */
	AiDocumentEntity saveDocument(AiDocumentDTO documentDTO);

	/**
	 * 保存切片
	 * @param documentEntity Document 实体
	 * @param documentDTO 文档 DTO
	 */
	void saveSlice(AiDocumentEntity documentEntity, AiDocumentDTO documentDTO);

	/**
	 * 摘要文档
	 * @param documentEntity Document 实体
	 * @param documentDTO 文档 DTO
	 */
	void summaryDocument(AiDocumentEntity documentEntity, AiDocumentDTO documentDTO);

	/**
	 * 嵌入切片
	 * @param documentEntity Document 实体
	 */
	void embedSlice(AiDocumentEntity documentEntity);

	/**
	 * 处理
	 * @param aiDocumentDTO AI 文档 DTO
	 */
	void handle(AiDocumentDTO aiDocumentDTO);

}
