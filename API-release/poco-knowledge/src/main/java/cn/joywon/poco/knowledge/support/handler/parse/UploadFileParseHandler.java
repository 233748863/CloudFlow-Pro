package cn.joywon.poco.knowledge.support.handler.parse;

import cn.hutool.core.lang.Pair;
import cn.hutool.extra.spring.SpringUtil;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.openai.OpenAiChatModelName;
import dev.langchain4j.model.openai.OpenAiTokenizer;
import org.springframework.core.Ordered;

import java.io.InputStream;
import java.util.List;

/**
 * 上传文件解析处理器
 *
 * @author poco
 * @date 2024/3/15
 */
public interface UploadFileParseHandler extends Ordered {

	/**
	 * 是否支持指定类型文件
	 * @param aiDataset
	 * @param document 文件
	 * @return true/false
	 */
	boolean supports(AiDatasetEntity aiDataset, AiDocumentEntity document);

	/**
	 * file 字符串
	 * @param documentEntity Document 实体
	 * @param inputStream 输入流
	 * @param extName ext 名称
	 * @return {@link List }<{@link String }>
	 */
	Pair<FileParserStatusEnums, String> file2String(AiDocumentEntity documentEntity, InputStream inputStream,
			String extName);

	/**
	 * 清洗数据
	 */
	default String cleanData(String input) {
		return input;
	}

	/**
	 * 拆分数据
	 *
	 * @param documentEntity  Document 实体
	 * @param aiDatasetEntity AI 数据集实体
	 * @param input           输入
	 * @return {@link List }<{@link String }>
	 */
	default List<String> splitData(AiDocumentEntity documentEntity, AiDatasetEntity aiDatasetEntity, String input) {
		AiKnowledgeProperties knowledgeProperties = SpringUtil.getBean(AiKnowledgeProperties.class);
		DocumentSplitter documentSplitter = DocumentSplitters.recursive(aiDatasetEntity.getFragmentSize()
				, knowledgeProperties.getInMemorySearch().getMaxOverlapSizeInChars(),
				new OpenAiTokenizer(OpenAiChatModelName.GPT_3_5_TURBO.toString()));
		List<TextSegment> textSegmentList = documentSplitter.split(Document.from(input));
		return textSegmentList.stream().map(TextSegment::text).toList();
	}

	/**
	 * 排序； 数值越大，优先加载
	 * @return int
	 */
	@Override
	default int getOrder() {
		return 0;
	}

}
