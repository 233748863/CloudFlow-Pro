package cn.joywon.poco.knowledge.support.handler.source;

import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.mapper.AiDocumentMapper;
import cn.joywon.poco.knowledge.mapper.AiSliceMapper;
import cn.joywon.poco.knowledge.support.constant.SliceStatusEnums;
import cn.joywon.poco.knowledge.support.constant.SourceTypeEnums;
import cn.joywon.poco.knowledge.support.constant.SummaryStatusEnums;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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
public class InputTextSourceTypeHandler extends AbstractFileSourceTypeHandler {

	private final AiDocumentMapper documentMapper;

	private final AiSliceMapper sliceMapper;

	/**
	 * 支持的源类型
	 * @param sourceType 源类型
	 * @return boolean
	 */
	@Override
	public boolean supports(String sourceType) {
		return SourceTypeEnums.TEXT.getType().equals(sourceType);
	}

	/**
	 * 保存文档
	 * @param documentDTO 文档 DTO
	 * @return {@link List }<{@link AiDocumentEntity }>
	 */
	@Override
	public AiDocumentEntity saveDocument(AiDocumentDTO documentDTO) {
		AiDocumentEntity document = new AiDocumentEntity();
		document.setDatasetId(documentDTO.getDatasetId());
		document.setFileStatus(documentDTO.getFileStatus());
		document.setSourceType(documentDTO.getSourceType());
		document.setFileType("txt");
		document.setSliceStatus(SliceStatusEnums.SLICED.getStatus());
		document.setName(documentDTO.getName());
		document.setSummaryStatus(SummaryStatusEnums.UNSUMMARY.getStatus());
		documentMapper.insert(document);
		return document;
	}

	/**
	 * 保存切片
	 * @param documentEntityList 文档实体列表
	 * @param documentDTO 文档 DTO
	 */
	@Override
	public void saveSlice(AiDocumentEntity documentEntity, AiDocumentDTO documentDTO) {
		AiSliceEntity slice = new AiSliceEntity();
		slice.setDocumentId(documentEntity.getId());
		slice.setContent(documentDTO.getContent());
		slice.setName(documentDTO.getName());
		slice.setSliceStatus(SliceStatusEnums.UNSLICED.getStatus());
		slice.setCharCount((long) documentDTO.getContent().length());
		sliceMapper.insert(slice);
	}

}
