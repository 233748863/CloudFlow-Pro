package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Pair;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.knowledge.dto.UmiOcrPDFModelDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.service.*;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import cn.joywon.poco.knowledge.support.constant.SliceStatusEnums;
import cn.joywon.poco.knowledge.support.constant.SummaryStatusEnums;
import cn.joywon.poco.knowledge.support.handler.parse.UploadFileParseHandler;
import cn.joywon.poco.knowledge.support.handler.source.UploadSourceTypeHandler;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.loader.UrlDocumentLoader;
import dev.langchain4j.data.document.parser.TextDocumentParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 定时任务具体实现
 *
 * @author poco
 * @date 2024/6/16
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiTaskServiceImpl implements AiTaskService {

	private final AiDocumentService documentService;

	private final AiDatasetService datasetService;

	private final AiSliceService sliceService;

	private final AiOCRAssistantService ocrAssistantService;

	private final UploadFileParseHandler pdfOcrUploadFileParseHandler;

	private final UploadSourceTypeHandler uploadSourceTypeHandler;

	/**
	 * 更新文档 OCR 结果
	 */
	@Override
	public void updateDocumentOcrResult() {
		List<AiDocumentEntity> documentEntityList = documentService.list(Wrappers.<AiDocumentEntity>lambdaQuery()
			.eq(AiDocumentEntity::getSliceStatus, SliceStatusEnums.OCR_PARSING.getStatus())
			.isNotNull(AiDocumentEntity::getSliceFailReason));

		for (AiDocumentEntity documentEntity : documentEntityList) {
			UmiOcrPDFModelDTO.UmiOcrPDFModelResultRequest umiOcrPDFModelResultRequest = new UmiOcrPDFModelDTO.UmiOcrPDFModelResultRequest();
			umiOcrPDFModelResultRequest.setId(documentEntity.getSliceFailReason());
			UmiOcrPDFModelDTO.UmiOcrPDFModelResultResponse umiOcrPDFModelResultResponse = ocrAssistantService
				.docResult(umiOcrPDFModelResultRequest);

			// 如果后台是成功的，则下载
			if ("success".equals(umiOcrPDFModelResultResponse.getState())) {
				UmiOcrPDFModelDTO.UmiOcrPDFModelDownRequest umiOcrPDFModelDownRequest = new UmiOcrPDFModelDTO.UmiOcrPDFModelDownRequest();
				umiOcrPDFModelDownRequest.setId(documentEntity.getSliceFailReason());
				umiOcrPDFModelDownRequest.setFile_types(List.of("txtPlain"));
				umiOcrPDFModelDownRequest.setIngore_blank(true);
				UmiOcrPDFModelDTO.UmiOcrPDFModelDownResponse umiOcrPDFModelDownResponse = ocrAssistantService
					.downloadDoc(umiOcrPDFModelDownRequest);

				TextDocumentParser textDocumentParser = new TextDocumentParser();

				// 加载文档
				Document document = UrlDocumentLoader.load(umiOcrPDFModelDownResponse.getData(), textDocumentParser);

				// 查询知识库配置
				AiDatasetEntity aiDatasetEntity = datasetService.getById(documentEntity.getDatasetId());
				uploadSourceTypeHandler.saveResult(pdfOcrUploadFileParseHandler,
						Pair.of(FileParserStatusEnums.PARSE_SUCCESS, document.text()), documentEntity, aiDatasetEntity);
			}
		}

	}

	/**
	 * 更新文档总结
	 */
	@Override
	public void updateDocumentSummary() {
		// 查询全部未总结的文档
		List<AiDocumentEntity> failSummaryDocumentList = documentService.list(Wrappers.<AiDocumentEntity>lambdaQuery()
			.eq(AiDocumentEntity::getSummaryStatus, SummaryStatusEnums.FAILED.getStatus()));

		for (AiDocumentEntity documentEntity : failSummaryDocumentList) {
			documentService.summaryDocument(documentEntity);
		}

	}

	/**
	 * 更新文档切片
	 */
	@Override
	public void updateDocumentSlice() {
		List<AiSliceEntity> aiSliceEntityList = sliceService.list(Wrappers.<AiSliceEntity>lambdaQuery()
			.eq(AiSliceEntity::getSliceStatus, SliceStatusEnums.FAILED.getStatus()));

		if (CollUtil.isEmpty(aiSliceEntityList)) {
			return;
		}

		List<Long> documentId = aiSliceEntityList.stream().map(AiSliceEntity::getDocumentId).distinct().toList();

		documentService.listByIds(documentId).forEach(documentEntity -> {
			sliceService.embedSlice(documentEntity, SliceStatusEnums.FAILED);
		});

	}

}
