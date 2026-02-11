package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.map.MapUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.AiSuggestionFieldResultDTO;
import cn.joywon.poco.knowledge.entity.AiDataFieldEntity;
import cn.joywon.poco.knowledge.entity.AiDataTableEntity;
import cn.joywon.poco.knowledge.mapper.AiDataFieldMapper;
import cn.joywon.poco.knowledge.mapper.AiDataTableMapper;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.service.AiDataFieldService;
import cn.joywon.poco.knowledge.service.AiDataService;
import cn.joywon.poco.knowledge.support.feign.RemoteTableInfoService;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.model.chat.ChatLanguageModel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.tuple.Triple;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * AI 字段管理表
 *
 * @author poco
 * @date 2025-03-26 21:49:03
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiDataFieldServiceImpl extends ServiceImpl<AiDataFieldMapper, AiDataFieldEntity> implements AiDataFieldService {

    private final RemoteTableInfoService tableInfoService;

    private final AiDataTableMapper aiDataTableMapper;

    private final ModelProvider modelProvider;

    @Lazy
    private final AiDataService aiDataService;
    private final AiDataFieldMapper aiDataFieldMapper;

    /**
     * 获取或同步
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     * @return {@link List }<{@link AiDataFieldEntity }>
     */
    @Override
    public List<AiDataFieldEntity> getOrSync(String dsName, String tableName) {

        AiDataTableEntity dataTableEntity = aiDataTableMapper.selectOne(Wrappers.<AiDataTableEntity>lambdaQuery().eq(AiDataTableEntity::getDsName, dsName)
                .eq(AiDataTableEntity::getTableName, tableName));

        List<AiDataFieldEntity> fieldEntityList = baseMapper
                .selectList(Wrappers.<AiDataFieldEntity>lambdaQuery().eq(AiDataFieldEntity::getTableId, dataTableEntity.getTableId()));

        if (fieldEntityList.isEmpty()) {
            syncTableField(dataTableEntity.getDsName(), dataTableEntity.getTableName());
            // 同步完再查询一次
            fieldEntityList = baseMapper
                    .selectList(Wrappers.<AiDataFieldEntity>lambdaQuery().eq(AiDataFieldEntity::getTableId, dataTableEntity.getTableId()));
        }
        return fieldEntityList;
    }

    /**
     * 同步表字段
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     * @return boolean
     */
    public boolean syncTableField(String dsName, String tableName) {
        // 同步
        AiDataTableEntity dataTableEntity = aiDataTableMapper.selectOne(Wrappers.<AiDataTableEntity>lambdaQuery().eq(AiDataTableEntity::getDsName, dsName)
                .eq(AiDataTableEntity::getTableName, tableName));
        R<List<Map<String, Object>>> listColumnR = tableInfoService.listColumn(dataTableEntity.getDsName(), dataTableEntity.getTableName());

        for (Map<String, Object> datum : listColumnR.getData()) {
            AiDataFieldEntity fieldEntity = new AiDataFieldEntity();
            fieldEntity.setTableId(dataTableEntity.getTableId());
            fieldEntity.setDsName(dataTableEntity.getDsName());
            fieldEntity.setDbType(MapUtil.getStr(datum, "databaseType"));
            fieldEntity.setFieldName(MapUtil.getStr(datum, "name"));
            fieldEntity.setFieldComment((String) datum.get("comment"));
            fieldEntity.setFieldType(MapUtil.getStr(datum, "originType"));
            fieldEntity.setModifyStatus(YesNoEnum.NO.getCode());

            this.getOneOpt(Wrappers.<AiDataFieldEntity>lambdaQuery().eq(AiDataFieldEntity::getTableId, dataTableEntity.getTableId())
                            .eq(AiDataFieldEntity::getFieldName, fieldEntity.getFieldName()), false)
                    .ifPresentOrElse(entity -> {
                        entity.setFieldComment(fieldEntity.getFieldComment());
                        baseMapper.updateById(entity);
                    }, () -> baseMapper.insert(fieldEntity));
        }

        return true;
    }

    /**
     * 评估表字段
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     */
    /**
     * 评估表字段
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     */
    @Override
    @Async
    public void assessTableField(String dsName, String tableName) {
        Triple<ChatLanguageModel, AiAssistantService, String> jsonAssistantTriple
                = modelProvider.getAiJSONAssistant(null);

        AiDataTableEntity dataTableEntity = aiDataTableMapper.selectOne(Wrappers.<AiDataTableEntity>lambdaQuery().eq(AiDataTableEntity::getDsName, dsName)
                .eq(AiDataTableEntity::getTableName, tableName));

        String dataSchema = aiDataService.queryTableSchema(List.of(dataTableEntity));
        AiSuggestionFieldResultDTO aiSuggestionFieldResultDTO = jsonAssistantTriple.getMiddle().assessTableField(dataSchema);
        log.info("评估表字段结果：{}", aiSuggestionFieldResultDTO);

        for (AiSuggestionFieldResultDTO.AiSuggestionFieldDTO suggestion : aiSuggestionFieldResultDTO.getSuggestions()) {
            AiDataFieldEntity aiDataFieldEntity = new AiDataFieldEntity();
            aiDataFieldEntity.setModifyStatus(YesNoEnum.YES.getCode());
            aiDataFieldEntity.setModifyTime(LocalDateTime.now());
            aiDataFieldEntity.setVirtualComment(suggestion.getFieldSuggestionComment());

            // 更新字段虚拟注释
            aiDataFieldMapper.update(aiDataFieldEntity, Wrappers.<AiDataFieldEntity>lambdaQuery().eq(AiDataFieldEntity::getTableId, dataTableEntity.getTableId())
                    .eq(AiDataFieldEntity::getFieldName, suggestion.getFieldName()));
        }

        // 更新虚拟表注释
        dataTableEntity.setVirtualComment(aiSuggestionFieldResultDTO.getTableSuggestionComment());
        aiDataTableMapper.updateById(dataTableEntity);
    }
}
