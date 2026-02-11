package cn.joywon.poco.knowledge.support.handler.parse;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.lang.Pair;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import cn.joywon.poco.knowledge.support.constant.FileTypeEnums;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.parser.apache.poi.ApachePoiDocumentParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.List;

/**
 * @author poco
 * @date 2024/10/2
 * <p>
 * 文本类型文件解析处理器
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OfficeUploadFileParseHandler implements UploadFileParseHandler {

	/**
	 * 是否支持指定类型文件
	 * @param aiDataset
	 * @param documentEntity 文件
	 * @return true/false
	 */
	@Override
	public boolean supports(AiDatasetEntity aiDataset, AiDocumentEntity documentEntity) {
		String contentType = FileUtil.extName(documentEntity.getFileUrl());
		return FileTypeEnums.DOC.getType().equals(contentType) || FileTypeEnums.DOCX.getType().equals(contentType)
				|| FileTypeEnums.PPT.getType().equals(contentType) || FileTypeEnums.PPTX.getType().equals(contentType)
				|| FileTypeEnums.XLS.getType().equals(contentType) || FileTypeEnums.XLSX.getType().equals(contentType);
	}

	/**
	 * file2 字符串
	 * @param documentEntity Document 实体
	 * @param inputStream 输入流
	 * @param extName ext 名称
	 * @return {@link List }<{@link String }>
	 */
	@Override
	public Pair<FileParserStatusEnums, String> file2String(AiDocumentEntity documentEntity, InputStream inputStream,
			String extName) {
		try {
			Document textDocument = new ApachePoiDocumentParser().parse(inputStream);
			return Pair.of(FileParserStatusEnums.PARSE_SUCCESS, textDocument.text());
		}
		catch (Exception e) {
			log.error("文件 {} 解析失败", documentEntity.getName(), e);
			return Pair.of(FileParserStatusEnums.PARSE_FAIL, e.getMessage());
		}
	}

}
