package cn.joywon.poco.knowledge.service;

/**
 * AI 定时任务
 *
 * @author poco
 * @date 2024/6/16
 */
public interface AiTaskService {

	/**
	 * 更新文档总结
	 */
	void updateDocumentSummary();

	/**
	 * 更新文档切片
	 */
	void updateDocumentSlice();

	/**
	 * 更新文档 OCR 结果
	 */
	void updateDocumentOcrResult();

}
