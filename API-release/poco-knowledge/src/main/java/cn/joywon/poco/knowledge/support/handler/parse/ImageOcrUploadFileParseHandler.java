package cn.joywon.poco.knowledge.support.handler.parse;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.lang.Pair;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.knowledge.dto.UmiOcrImageModelDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.service.AiOCRAssistantService;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import cn.joywon.poco.knowledge.support.constant.FileTypeEnums;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.Base64;
import java.util.stream.Collectors;

/**
 * @author poco
 * @date 2024/3/15
 * <p>
 * 图片OCR处理
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ImageOcrUploadFileParseHandler implements UploadFileParseHandler {

	private final AiOCRAssistantService ocrAssistantService;

	/**
	 * 支持
	 * @param aiDataset
	 * @param documentEntity Document 实体
	 * @return boolean
	 */
	@Override
	public boolean supports(AiDatasetEntity aiDataset, AiDocumentEntity documentEntity) {
		String contentType = FileUtil.extName(documentEntity.getFileUrl());

		return FileTypeEnums.PNG.getType().equals(contentType) || FileTypeEnums.JPG.getType().equals(contentType)
				|| FileTypeEnums.JPEG.getType().equals(contentType);
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
		String encodeToString = Base64.getEncoder().encodeToString(inputStream.readAllBytes());
		UmiOcrImageModelDTO.UmiOcrImageModelRequest request = new UmiOcrImageModelDTO.UmiOcrImageModelRequest();
		request.setBase64(encodeToString);

		UmiOcrImageModelDTO.UmiOcrImageModelResponse umiOcrImageModelResponse = null;
		try {
			String ocrImageResult = ocrAssistantService.image(request);
			umiOcrImageModelResponse = JSONUtil.toBean(ocrImageResult,
					UmiOcrImageModelDTO.UmiOcrImageModelResponse.class);
		}
		catch (Exception e) {
			log.error("文件: {} OCR 解析失败", documentEntity.getName());
			return Pair.of(FileParserStatusEnums.PARSE_FAIL, String.format("OCR 解析失败:%s", e.getMessage()));
		}

		if (100 != umiOcrImageModelResponse.getCode()) {
			log.error("文件: {} OCR 解析失败", documentEntity.getName());
			return Pair.of(FileParserStatusEnums.PARSE_FAIL, String.format("OCR 解析失败:%s", documentEntity.getName()));
		}

		String ocrContent = umiOcrImageModelResponse.getData()
			.stream()
			.map(UmiOcrImageModelDTO.UmiOcrImageModelResponse.TextData::getText)
			.collect(Collectors.joining());
		return Pair.of(FileParserStatusEnums.PARSE_SUCCESS, ocrContent);
	}

}
