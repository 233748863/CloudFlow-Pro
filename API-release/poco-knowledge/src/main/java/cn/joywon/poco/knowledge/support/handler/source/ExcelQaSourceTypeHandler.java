package cn.joywon.poco.knowledge.support.handler.source;

import cn.hutool.core.util.StrUtil;
import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.read.listener.PageReadListener;
import cn.joywon.poco.admin.api.feign.RemoteFileService;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.dto.AiQAExcelDTO;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.mapper.AiDocumentMapper;
import cn.joywon.poco.knowledge.mapper.AiSliceMapper;
import cn.joywon.poco.knowledge.support.constant.SliceStatusEnums;
import cn.joywon.poco.knowledge.support.constant.SourceTypeEnums;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import feign.Response;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * EXCEL 问答类型处理
 *
 * @author poco
 * @date 2024/10/3
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExcelQaSourceTypeHandler extends AbstractFileSourceTypeHandler {

	private final RemoteFileService remoteFileService;

	private final AiDocumentMapper documentMapper;

	private final AiSliceMapper sliceMapper;

	/**
	 * 支持的源类型
	 * @param sourceType 源类型
	 * @return boolean
	 */
	@Override
	public boolean supports(String sourceType) {
		return SourceTypeEnums.QA.getType().equals(sourceType);
	}

	/**
	 * 保存文档
	 * @param documentDTO 文档 DTO
	 * @return {@link List }<{@link AiDocumentEntity }>
	 */
	@Override
	public AiDocumentEntity saveDocument(AiDocumentDTO documentDTO) {
		List<AiDocumentEntity> documentEntityList = documentDTO.getFiles();
		// 保存文档
		AiDocumentEntity document = new AiDocumentEntity();
		document.setDatasetId(documentDTO.getDatasetId());
		document.setFileStatus(documentDTO.getFileStatus());
		document.setSourceType(documentDTO.getSourceType());
		// 文件类型 仓库类型/仓库拥有者/仓库名称 GITHUB/OWNER/REPO
		document.setName(documentEntityList.get(0).getName());
		document.setFileUrl(documentEntityList.get(0).getFileUrl());
		document.setFileType("xlsx");
		document.setSliceStatus(SliceStatusEnums.SLICED.getStatus());
		documentMapper.insert(document);
		return document;
	}

	/**
	 * 保存切片
	 *
	 * @param documentEntity Document 实体
	 * @param documentDTO    文档 DTO
	 */
	@Override
	@SneakyThrows
	public void saveSlice(AiDocumentEntity documentEntity, AiDocumentDTO documentDTO) {
		// 获取源文件
		Response response = remoteFileService.getFile(documentEntity.getFileUrl());

		InputStream inputStream = response.body().asInputStream();

		List<AiQAExcelDTO> qaExcelDTOList = new ArrayList<>();
		/// 读取 excel
		EasyExcel
				.read(inputStream, AiQAExcelDTO.class, new PageReadListener<AiQAExcelDTO>(qaExcelDTOList::addAll))
			.sheet()
			.doRead();

		List<String> resultList = new ArrayList<>();
		// 解析 excel
		for (AiQAExcelDTO aiQAExcelDTO : qaExcelDTOList) {
			StrUtil.split(aiQAExcelDTO.getQuestion(), StrUtil.LF).forEach(question -> {
				resultList.add(PromptBuilder.render("knowledge-rag-qa.st", Map.of(AiQAExcelDTO.Fields.answer,
						aiQAExcelDTO.getAnswer(), AiQAExcelDTO.Fields.question, aiQAExcelDTO.getQuestion())));
			});
		}

		for (String result : resultList) {
			// 保存切片
			AiSliceEntity slice = new AiSliceEntity();
			slice.setDocumentId(documentEntity.getId());
			slice.setContent(result);
			slice.setName(documentEntity.getName());
			slice.setSliceStatus(YesNoEnum.NO.getCode());
			slice.setCharCount((long) result.length());
			sliceMapper.insert(slice);
		}
	}

}
