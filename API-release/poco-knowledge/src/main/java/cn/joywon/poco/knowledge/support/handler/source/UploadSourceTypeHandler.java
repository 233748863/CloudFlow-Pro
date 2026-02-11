package cn.joywon.poco.knowledge.support.handler.source;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.lang.Pair;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.admin.api.feign.RemoteFileService;
import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.mapper.AiDocumentMapper;
import cn.joywon.poco.knowledge.mapper.AiSliceMapper;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import cn.joywon.poco.knowledge.support.constant.SliceStatusEnums;
import cn.joywon.poco.knowledge.support.constant.SourceTypeEnums;
import cn.joywon.poco.knowledge.support.constant.SummaryStatusEnums;
import cn.joywon.poco.knowledge.support.handler.parse.UploadFileParseHandler;
import feign.Response;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

/**
 * 输入的文本类型处理
 *
 * @author poco
 * @date 2024/10/3
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UploadSourceTypeHandler extends AbstractFileSourceTypeHandler {

	private final RemoteFileService remoteFileService;

	private final List<UploadFileParseHandler> parseHandlerList;

	private final AiDatasetMapper aiDatasetMapper;

	private final AiDocumentMapper documentMapper;

	private final AiSliceMapper sliceMapper;

	/**
	 * 支持的源类型
	 * @param sourceType 源类型
	 * @return boolean
	 */
	@Override
	public boolean supports(String sourceType) {
		return SourceTypeEnums.UPLOAD.getType().equals(sourceType);
	}

	/**
	 * 保存文档
	 * @param aiDocumentDTO AI 文档 DTO
	 * @return {@link AiDocumentEntity }
	 */
	@Override
	public AiDocumentEntity saveDocument(AiDocumentDTO aiDocumentDTO) {
		AiDocumentEntity file = aiDocumentDTO.getFiles().get(0);
		// 获取源文件
		AiDocumentEntity document = new AiDocumentEntity();
		document.setId(aiDocumentDTO.getId());
		document.setDatasetId(aiDocumentDTO.getDatasetId());
		document.setFileStatus(aiDocumentDTO.getFileStatus());
		document.setSourceType(aiDocumentDTO.getSourceType());
		document.setDatasetId(aiDocumentDTO.getDatasetId());
		String extName = FileUtil.extName(file.getFileUrl());
		document.setFileType(extName);
		document.setName(file.getName());
		document.setFileUrl(file.getFileUrl());
		document.setSliceStatus(SliceStatusEnums.UNSLICED.getStatus());
		documentMapper.insertOrUpdate(document);
		return document;
	}

	/**
	 * 保存切片
	 * @param documentEntity Document 实体
	 * @param documentDTO 文档 DTO
	 */
	@Override
	@SneakyThrows
	public void saveSlice(AiDocumentEntity documentEntity, AiDocumentDTO documentDTO) {
		Response response = remoteFileService.getFile(documentEntity.getFileUrl());
		String extName = FileUtil.extName(documentEntity.getFileUrl());
		// 查询知识库配置
		AiDatasetEntity aiDatasetEntity = aiDatasetMapper.selectById(documentEntity.getDatasetId());

		UploadFileParseHandler uploadFileParseHandler = parseHandlerList.stream()
			.filter(handler -> handler.supports(aiDatasetEntity, documentEntity))
			.max(Comparator.comparingInt(Ordered::getOrder))
			.get();

		Pair<FileParserStatusEnums, String> parserFile = uploadFileParseHandler.file2String(documentEntity,
				response.body().asInputStream(), extName);

		// 保存结果
		saveResult(uploadFileParseHandler, parserFile, documentEntity, aiDatasetEntity);
	}

	/**
	 * 保存结果
	 * @param uploadFileParseHandler 上传文件解析处理程序
	 * @param parserFile 解析器文件
	 * @param documentEntity Document 实体
	 * @param aiDatasetEntity AI 数据集实体
	 */
	public void saveResult(UploadFileParseHandler uploadFileParseHandler,
			Pair<FileParserStatusEnums, String> parserFile, AiDocumentEntity documentEntity,
			AiDatasetEntity aiDatasetEntity) {
		// 解析失败
		if (FileParserStatusEnums.PARSE_FAIL.equals(parserFile.getKey())) {
			log.warn("文件:{}  解析失败", documentEntity.getName());
			documentEntity.setSliceStatus(SliceStatusEnums.FAILED.getStatus());
			documentEntity.setSliceFailReason(parserFile.getValue());
			documentMapper.updateById(documentEntity);
			return;
		}

		// 解析中
		if (FileParserStatusEnums.OCR_PARSING.equals(parserFile.getKey())) {
			documentEntity.setSliceStatus(SliceStatusEnums.OCR_PARSING.getStatus());
			documentEntity.setSliceFailReason(parserFile.getValue());
			documentMapper.updateById(documentEntity);
			return;
		}

		if (FileParserStatusEnums.AI_PARSING.equals(parserFile.getKey())) {
			documentEntity.setSliceStatus(SliceStatusEnums.AI_PARSING.getStatus());
			documentMapper.updateById(documentEntity);
			return;
		}

		// 清洗数据
		String cleanResultData = uploadFileParseHandler.cleanData(parserFile.getValue());

		// 拆分数据
		List<String> contentList = uploadFileParseHandler.splitData(documentEntity, aiDatasetEntity, cleanResultData);
		if (CollUtil.isEmpty(contentList) || StrUtil.isBlank(contentList.get(0))) {
			log.warn("文件:{}  解析失败", documentEntity.getName());
			documentEntity.setSliceStatus(SliceStatusEnums.FAILED.getStatus());

			if (StrUtil.isBlank(documentEntity.getSliceFailReason())) {
				documentEntity.setSliceFailReason("文件解析失败，资源部不包含文本内容");
			}

			documentMapper.updateById(documentEntity);
			return;
		}

		for (String content : contentList) {
			if (StrUtil.isBlank(content)) {
				continue;
			}
			AiSliceEntity slice = new AiSliceEntity();
			slice.setDocumentId(documentEntity.getId());
			slice.setContent(content);
			slice.setName(documentEntity.getName());
			slice.setSliceStatus(SliceStatusEnums.UNSLICED.getStatus());
			slice.setCharCount((long) content.length());
			slice.setCreateBy(documentEntity.getCreateBy());
			slice.setCreateTime(LocalDateTime.now());
			sliceMapper.insert(slice);
		}

		documentEntity.setSummaryStatus(SummaryStatusEnums.UNSUMMARY.getStatus());
		documentEntity.setSliceStatus(SliceStatusEnums.SLICED.getStatus());
		documentMapper.updateById(documentEntity);
	}

}
