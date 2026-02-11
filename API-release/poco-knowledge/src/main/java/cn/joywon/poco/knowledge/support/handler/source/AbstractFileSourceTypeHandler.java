package cn.joywon.poco.knowledge.support.handler.source;

import cn.hutool.extra.spring.SpringUtil;
import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.service.AiDocumentService;
import cn.joywon.poco.knowledge.service.AiSliceService;
import cn.joywon.poco.knowledge.support.constant.SliceStatusEnums;
import lombok.extern.slf4j.Slf4j;

/**
 * @author poco
 * @date 2024/10/3 抽象文件源类型处理器
 */
@Slf4j
public abstract class AbstractFileSourceTypeHandler implements FileSourceTypeHandler {

	/**
	 * 摘要文档
	 * @param documentEntity Document 实体
	 * @param documentDTO 文档 DTO
	 */
	@Override
	public void summaryDocument(AiDocumentEntity documentEntity, AiDocumentDTO documentDTO) {
		SpringUtil.getBean(AiDocumentService.class).summaryDocument(documentEntity);
	}

	/**
	 * 嵌入切片
	 * @param documentEntity Document 实体
	 */
	@Override
	public void embedSlice(AiDocumentEntity documentEntity) {
		SpringUtil.getBean(AiSliceService.class).embedSlice(documentEntity, SliceStatusEnums.UNSLICED);
	}

	/**
	 * 处理
	 * @param aiDocumentDTO AI 文档 DTO
	 */
	@Override
	public void handle(AiDocumentDTO aiDocumentDTO) {
		log.info("======= AI 正在处理文档：{} =======", aiDocumentDTO.getName());
		// 数据库保存文档
		AiDocumentEntity documentEntity = saveDocument(aiDocumentDTO);
		// 数据库保存切片
		saveSlice(documentEntity, aiDocumentDTO);
		// 摘要文档
		summaryDocument(documentEntity, aiDocumentDTO);
		// 向量化切片
		embedSlice(documentEntity);
		log.info("======= AI 文档：{} 处理介绍 =======", aiDocumentDTO.getName());
	}

}
