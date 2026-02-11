package cn.joywon.poco.knowledge.support.handler.parse;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.lang.Pair;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.dto.UmiOcrPDFModelDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.service.AiOCRAssistantService;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import cn.joywon.poco.knowledge.support.constant.FileTypeEnums;
import cn.joywon.poco.knowledge.support.util.ByteArrayMultipartFile;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.parser.apache.pdfbox.ApachePdfBoxDocumentParser;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.InputStream;

/**
 * @author poco
 * @date 2024/3/15
 * <p>
 * PDF处理器，调用OCR服务 处理提高准确性
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PdfOcrUploadFileParseHandler implements UploadFileParseHandler {

	private final AiKnowledgeProperties aiKnowledgeProperties;

	private final AiOCRAssistantService ocrAssistantService;

	/**
	 * 是否支持指定类型文件
	 * @param aiDataset
	 * @param documentEntity 文件
	 * @return true/false
	 */
	@Override
	public boolean supports(AiDatasetEntity aiDataset, AiDocumentEntity documentEntity) {
		String contentType = FileUtil.extName(documentEntity.getFileUrl());
		return FileTypeEnums.PDF.getType().equals(contentType) && aiKnowledgeProperties.getCnocr().isEnabled();
	}

	/**
	 * 解析文件
	 * @param documentEntity
	 * @param inputStream 文件字节数组
	 * @param extName
	 * @return String
	 */
	@SneakyThrows
	@Override
	public Pair<FileParserStatusEnums, String> file2String(AiDocumentEntity documentEntity, InputStream inputStream,
			String extName) {
		ApachePdfBoxDocumentParser pdfBoxDocumentParser = new ApachePdfBoxDocumentParser();
		try {
			// 解析PDF ，非影印版本
			Document document = pdfBoxDocumentParser.parse(inputStream);
			return Pair.of(FileParserStatusEnums.PARSE_SUCCESS, document.text());
		}
		catch (Exception e) {
			ByteArrayMultipartFile byteArrayMultipartFile = new ByteArrayMultipartFile(documentEntity.getName(),
					documentEntity.getName(), null, inputStream);

			try {
				UmiOcrPDFModelDTO.UmiOcrPDFModelResponse umiOcrPDFModelResponse = ocrAssistantService
					.uploadDoc(byteArrayMultipartFile);
				return Pair.of(FileParserStatusEnums.OCR_PARSING, umiOcrPDFModelResponse.getData());
			}
			catch (Exception exception) {
				log.error("文件: {} OCR 解析失败", documentEntity.getName());
				return Pair.of(FileParserStatusEnums.PARSE_FAIL, String.format("OCR 解析失败:%s", e.getMessage()));
			}
		}
	}

}
