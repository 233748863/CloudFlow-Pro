package cn.joywon.poco.knowledge.support.handler.parse;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.lang.Pair;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.dto.AiMarkitdownDTO;
import cn.joywon.poco.knowledge.dto.MarkitdownResponseDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.service.AiMarkitdownAssistantService;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import cn.joywon.poco.knowledge.support.constant.FileTypeEnums;
import cn.joywon.poco.knowledge.support.constant.ModelTypeEnums;
import cn.joywon.poco.knowledge.support.util.ByteArrayMultipartFile;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.List;
import java.util.Objects;

/**
 * markitdown 上传文件解析处理程序
 *
 * @author poco
 * @date 2024/12/22
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class Office2MdUploadFileParseHandler implements UploadFileParseHandler {

    private final AiKnowledgeProperties aiKnowledgeProperties;

    private final AiMarkitdownAssistantService markitdownAssistantService;

    private final AiModelMapper aiModelMapper;

    /**
     * 是否支持指定类型文件
     *
     * @param aiDataset
     * @param documentEntity 文件
     * @return true/false
     */
    @Override
    public boolean supports(AiDatasetEntity aiDataset, AiDocumentEntity documentEntity) {
        String contentType = FileUtil.extName(documentEntity.getFileUrl());
        return aiKnowledgeProperties.getMarkitdown().isEnabled()
                && (FileTypeEnums.DOCX.getType().equals(contentType)
                || FileTypeEnums.PDF.getType().equals(contentType)
                || FileTypeEnums.PPTX.getType().equals(contentType)
                || FileTypeEnums.XLSX.getType().equals(contentType));
    }

    /**
     * file2 字符串
     *
     * @param documentEntity Document 实体
     * @param inputStream    输入流
     * @param extName        ext 名称
     * @return {@link List }<{@link String }>
     */
    @Override
    public Pair<FileParserStatusEnums, String> file2String(AiDocumentEntity documentEntity, InputStream inputStream,
                                                           String extName) {
        try {

            ByteArrayMultipartFile file = new ByteArrayMultipartFile(
                    documentEntity.getName(), documentEntity.getName(), null, inputStream.readAllBytes());

            AiMarkitdownDTO request = new AiMarkitdownDTO();

            // 查询默认的视觉模型
            AiModelEntity aiModelEntity = aiModelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
                    .eq(AiModelEntity::getModelType, ModelTypeEnums.VISION.getType())
                    .eq(AiModelEntity::getDefaultModel, YesNoEnum.YES.getCode()), false);

            if (Objects.nonNull(aiModelEntity)) {
                request.setModel(aiModelEntity.getModelName());
                request.setApi_key(aiModelEntity.getApiKey());
                request.setBase_url(aiModelEntity.getBaseUrl());
                request.setPrompt(PromptBuilder.render("ocr-image.st"));
            }

            MarkitdownResponseDTO markitdownResponseDTO = markitdownAssistantService.upload(file, request);
            return Pair.of(FileParserStatusEnums.PARSE_SUCCESS, markitdownResponseDTO.getText());
        } catch (Exception e) {
            log.error("文件 {} 解析失败", documentEntity.getName(), e);
            return Pair.of(FileParserStatusEnums.PARSE_FAIL, e.getMessage());
        }
    }

    /**
     * 排序； 数值越大，优先加载
     *
     * @return int
     */
    @Override
    public int getOrder() {
        return 100;
    }

}
