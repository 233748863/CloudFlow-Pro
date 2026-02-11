package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.support.handler.source.FileSourceTypeHandler;

import java.io.IOException;
import java.util.List;

public interface AiDocumentService extends IService<AiDocumentEntity> {

	/**
	 * 获取文档页面
	 * @param page 页
	 * @param aiDocument AI 文档
	 * @return {@link Page }<{@link AiDocumentEntity }>
	 */
	Page<AiDocumentEntity> getDocumentPage(Page<AiDocumentEntity> page, AiDocumentEntity aiDocument);

	/**
	 * 保存文档
	 * @param handler
	 * @param aiDocument 文档传输对象
	 * @return true/false
	 */
	void save(FileSourceTypeHandler handler, AiDocumentDTO aiDocument);

	/**
	 * 通过id删除文档和切片
	 * @param idList id 列表
	 * @return R
	 */
	Boolean removeDocumentAndSliceBatchByIds(List<Long> idList);

	/**
	 * 重新切片文档
	 * @param aiDocument 文档
	 * @return true/false
	 */
	void retryDocument(AiDocumentDTO aiDocument);

	/**
	 * 重试问题
	 * @param aiDocument AI 文档
	 */
	void retryIssue(AiDocumentDTO aiDocument);

	/**
	 * 摘要文档
	 * @param documentEntity Document 实体
	 */
	void summaryDocument(AiDocumentEntity documentEntity);

	/**
	 * 文档向量化
	 *
	 * @param name 名字
	 * @return {@link R }
	 */
	R embedDocument(String name) throws IOException;
}
