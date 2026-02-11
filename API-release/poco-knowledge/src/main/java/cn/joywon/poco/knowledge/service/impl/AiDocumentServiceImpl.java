package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.admin.api.feign.RemoteFileService;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.mapper.AiDocumentMapper;
import cn.joywon.poco.knowledge.service.AiDocumentService;
import cn.joywon.poco.knowledge.service.AiNoMemoryStreamAssistantService;
import cn.joywon.poco.knowledge.service.AiSliceService;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.constant.SourceTypeEnums;
import cn.joywon.poco.knowledge.support.constant.SummaryStatusEnums;
import cn.joywon.poco.knowledge.support.handler.source.FileSourceTypeHandler;
import cn.joywon.poco.knowledge.support.handler.source.UploadSourceTypeHandler;
import cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.parser.apache.poi.ApachePoiDocumentParser;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.model.openai.OpenAiChatModelName;
import dev.langchain4j.model.openai.OpenAiTokenizer;
import feign.Response;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;

/**
 * 知识文档
 *
 * @author pig
 * @date 2024-03-14 13:38:59
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AiDocumentServiceImpl extends ServiceImpl<AiDocumentMapper, AiDocumentEntity>
        implements AiDocumentService {

    private final List<FileSourceTypeHandler> sourceTypeHandlerList;

    private final UploadSourceTypeHandler uploadSourceTypeHandler;

    private final AiKnowledgeProperties knowledgeProperties;

    private final AiDatasetMapper datasetMapper;

    private final AiSliceService sliceService;

    private final ModelProvider modelProvider;

    private final RemoteFileService remoteFileService;

    /**
     * 获取文档页面
     *
     * @param page       页
     * @param aiDocument AI 文档
     * @return {@link Page }<{@link AiDocumentEntity }>
     */
    @Override
    public Page<AiDocumentEntity> getDocumentPage(Page<AiDocumentEntity> page, AiDocumentEntity aiDocument) {
        return baseMapper.getDocumentPage(page, aiDocument);
    }

    /**
     * 保存文档
     *
     * @param handler
     * @param aiDocumentDTO 文档传输对象
     * @return true/false
     */
    @Override
    @Async
    public void save(FileSourceTypeHandler handler, AiDocumentDTO aiDocumentDTO) {
        handler.handle(aiDocumentDTO);
    }

    /**
     * 通过id删除文档和切片
     *
     * @param idList id 列表
     * @return R
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Boolean removeDocumentAndSliceBatchByIds(List<Long> idList) {
        // 删除切片 and 向量
        List<Long> sliceIdList = sliceService
                .list(Wrappers.<AiSliceEntity>lambdaQuery().in(AiSliceEntity::getDocumentId, idList))
                .stream()
                .map(AiSliceEntity::getId)
                .collect(Collectors.toList());

        if (CollUtil.isNotEmpty(sliceIdList)) {
            sliceService.removeSliceAndEbeddingById(sliceIdList);
        }

        // 删除文档
        baseMapper.deleteBatchIds(idList);
        return Boolean.TRUE;
    }

    /**
     * 重试文档
     *
     * @param documentDTO 文档 DTO
     */
    @SneakyThrows
    @Override
    @Async
    public void retryDocument(AiDocumentDTO documentDTO) {
        AiDocumentEntity documentEntity = baseMapper.selectById(documentDTO.getId());
        // 重新处理文件
        documentDTO.setFiles(List.of(documentEntity));
        uploadSourceTypeHandler.handle(documentDTO);
    }

    /**
     * 重试问题
     *
     * @param documentDTO AI 文档
     */
    @Override
    @Async
    public void retryIssue(AiDocumentDTO documentDTO) {
        AiDocumentEntity documentEntity = baseMapper.selectById(documentDTO.getId());
        JSONObject documentConfigObj = JSONUtil.parseObj(documentEntity.getDocumentConfig());
        documentEntity.setFileType("md");
        documentDTO.setRepoType(documentConfigObj.getStr(AiDocumentDTO.Fields.repoType));
        documentDTO.setRepoOwner(documentConfigObj.getStr(AiDocumentDTO.Fields.repoOwner));
        documentDTO.setRepoName(documentConfigObj.getStr(AiDocumentDTO.Fields.repoName));
        documentDTO.setAccessToken(documentConfigObj.getStr(AiDocumentDTO.Fields.accessToken));
        documentDTO.setFiles(List.of(documentEntity));

        sourceTypeHandlerList.stream()
                .filter(handler -> handler.supports(documentDTO.getSourceType()))
                .findFirst()
                .ifPresent(handler -> handler.handle(documentDTO));
    }

    @Override
    public void summaryDocument(AiDocumentEntity documentEntity) {
        AiDatasetEntity aiDataset = datasetMapper.selectById(documentEntity.getDatasetId());
        AiNoMemoryStreamAssistantService memoryStreamAssistantService = modelProvider
                .getAiNoMemoryStreamAssistant(aiDataset.getSummaryModel())
                .getValue();

        // 如果未开启文档总结，则跳过
        if (YesNoEnum.NO.getCode().equals(aiDataset.getPreSummary())) {
            return;
        }

        // 如果是 QA 文档则跳过总结
        if (SourceTypeEnums.QA.getType().equals(documentEntity.getSourceType())) {
            return;
        }

        // 查询文档下所有数据,如果文档下没有未切片的数据，则跳过
        List<AiSliceEntity> sliceEntityList = sliceService
                .list(Wrappers.<AiSliceEntity>lambdaQuery().eq(AiSliceEntity::getDocumentId, documentEntity.getId()));

        if (sliceEntityList.isEmpty()) {
            return;
        }

        // 当前文档下的所有未训练数据，拼接成一个文档
        String documentContent = sliceEntityList.stream()
                .map(AiSliceEntity::getContent)
                .collect(Collectors.joining(StrUtil.LF));

        try {
            Mono<String> resultFlux = memoryStreamAssistantService.chat(PromptBuilder.render("knowledge-rag-summary.st",
                            Map.of(AiDocumentEntity.Fields.summary,
                                    StrUtil.subSufByLength(documentContent, knowledgeProperties.getMaxSummary()))))
                    .reduce(StrUtil.EMPTY, (acc, value) -> acc + value);

            // 针对R1 模型特殊处理 思维链删掉
            String replacedAll = resultFlux.block().replaceAll("<think>[\\s\\S]*?</think>", StrUtil.EMPTY);
            documentEntity.setSummary(documentEntity.getName() + replacedAll);
            documentEntity.setSummaryStatus(SummaryStatusEnums.SUMMARYED.getStatus());
        } catch (Exception e) {
            log.warn("文档 {} 总结失败", documentEntity.getName(), e);
            documentEntity.setSummaryFailReason(e.getMessage());
            documentEntity.setSummaryStatus(SummaryStatusEnums.FAILED.getStatus());
        }

        baseMapper.updateById(documentEntity);
    }


    /**
     * 文档向量化
     *
     * @param name 文件名称
     * @return {@link R }
     */
    @Override
    public R embedDocument(String name) throws IOException {
        // 获取文件并解析
        Response response = remoteFileService.getFile(name);
        InputStream inputStream = response.body().asInputStream();
        // 解析文件
        Document textDocument = new ApachePoiDocumentParser().parse(inputStream);
        // 文件切片
        DocumentSplitter documentSplitter = DocumentSplitters.recursive(knowledgeProperties.getInMemorySearch().getMaxSegmentSizeInChars()
                , knowledgeProperties.getInMemorySearch().getMaxOverlapSizeInChars(),
                new OpenAiTokenizer(OpenAiChatModelName.GPT_3_5_TURBO.toString()));


        documentSplitter.split(textDocument).forEach(segment -> {
            segment.metadata().put(TEMP_ID, SecureUtil.md5(name));
            segment.metadata().put(EmbedBizTypeEnums.Fields.type, EmbedBizTypeEnums.CHAT2FILE.getType());
            MemoryEmbeddingProvider.add(segment);
        });
        return R.ok();
    }
}
