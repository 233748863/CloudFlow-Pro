package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.io.IoUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.extra.template.Template;
import cn.hutool.extra.template.TemplateConfig;
import cn.hutool.extra.template.TemplateEngine;
import cn.hutool.extra.template.TemplateUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.knowledge.dto.AiDataTableDTO;
import cn.joywon.poco.knowledge.entity.AiDataEntity;
import cn.joywon.poco.knowledge.entity.AiDataTableEntity;
import cn.joywon.poco.knowledge.mapper.AiDataMapper;
import cn.joywon.poco.knowledge.mapper.AiDataTableMapper;
import cn.joywon.poco.knowledge.service.AiDataFieldService;
import cn.joywon.poco.knowledge.service.AiDataService;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.segment.TextSegment;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;

/**
 * AI 数据集管理表
 *
 * @author poco
 * @date 2025-03-26 21:47:45
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiDataServiceImpl extends ServiceImpl<AiDataMapper, AiDataEntity> implements AiDataService {

    public static final TemplateEngine engine = TemplateUtil.createEngine(new TemplateConfig());

    private final AiDataTableMapper dataTableMapper;

    @Lazy
    private final AiDataFieldService dataFieldService;

    private final AiDataMapper aiDataMapper;

    @Value("classpath:/prompts/chat2db-table-schema.ftl")
    private Resource tableSchema;

    /**
     * 查询数据集定义
     *
     * @param dataId 数据id
     * @return {@link String }
     */
    @SneakyThrows
    @Override
    public String queryDataSchema(Long dataId) {
        AiDataEntity aiDataEntity = aiDataMapper.selectById(dataId);
        String[] tableNames = aiDataEntity.getTableName();
        String dsName = aiDataEntity.getDsName();

        // 查询数据表
        List<AiDataTableEntity> tableEntityList = dataTableMapper.selectList(Wrappers.<AiDataTableEntity>lambdaQuery()
                .eq(AiDataTableEntity::getDsName, dsName)
                .in(AiDataTableEntity::getTableName, CollUtil.toList(tableNames))
        );

        // 根据表查询全部的字段
        String renderResult = queryTableSchema(tableEntityList);
        log.info("目标数据集，渲染结果：{}", renderResult);
        return renderResult;
    }

    @SneakyThrows
    public String queryTableSchema(List<AiDataTableEntity> tableEntityList) {
        List<AiDataTableDTO> tableDTOList = new ArrayList<>();
        for (AiDataTableEntity tableEntity : tableEntityList) {
            AiDataTableDTO tableDTO = new AiDataTableDTO();
            tableDTO.setTableName(tableEntity.getTableName());
            tableDTO.setTableComment(StrUtil.isNotBlank(tableEntity.getVirtualComment())
                    ? tableEntity.getVirtualComment() : tableEntity.getTableComment());

            List<AiDataTableDTO.AiTableField> fieldList = dataFieldService.getOrSync(tableEntity.getDsName(), tableEntity.getTableName()).stream()
                    .map(fieldEntity -> {
                        AiDataTableDTO.AiTableField field = new AiDataTableDTO.AiTableField();
                        field.setFieldName(fieldEntity.getFieldName());
                        field.setFieldComment(StrUtil.isNotBlank(fieldEntity.getVirtualComment())
                                ? fieldEntity.getVirtualComment() : fieldEntity.getFieldComment());
                        field.setDbType(fieldEntity.getDbType());
                        field.setFieldType(fieldEntity.getFieldType());
                        return field;
                    }).toList();
            tableDTO.setFields(fieldList);
            tableDTOList.add(tableDTO);
        }

        Template template = engine.getTemplate(IoUtil.read(tableSchema.getInputStream(), Charset.defaultCharset()));
        return template.render(Map.of("tables", tableDTOList));
    }

    /**
     * 保存或更新数据
     *
     * @param aiData AI 数据
     * @return boolean
     */
    @Override
    public boolean saveOrUpdateData(AiDataEntity aiData) {
        baseMapper.insertOrUpdate(aiData);
        TextSegment textSegment = TextSegment.textSegment(aiData.getDsName() + aiData.getDescription(),
                Metadata.from(Map.of(EmbedBizTypeEnums.Fields.type, EmbedBizTypeEnums.CHAT2SQL.getType()
                        , TEMP_ID, aiData.getDataId()))
        );
        MemoryEmbeddingProvider.add(SecureUtil.md5(aiData.getDsName()), textSegment);
        return true;
    }
}
