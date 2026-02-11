package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.map.MapUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.entity.AiDataTableEntity;
import cn.joywon.poco.knowledge.mapper.AiDataTableMapper;
import cn.joywon.poco.knowledge.service.AiDataTableService;
import cn.joywon.poco.knowledge.support.feign.RemoteTableInfoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * AI  数据表管理表
 *
 * @author poco
 * @date 2025-03-26 21:48:16
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiDataTableServiceImpl extends ServiceImpl<AiDataTableMapper, AiDataTableEntity> implements AiDataTableService {

    private final RemoteTableInfoService tableInfoService;

    /**
     * 同步
     *
     * @return boolean
     */
    @Override
    public boolean sync() {

        R<List<Map<String, Object>>> listDsR = tableInfoService.listDs();


        List<String> dsNameList = new ArrayList<>(listDsR.getData().stream()
                .map(datasourceMap -> MapUtil.getStr(datasourceMap, "name"))
                .toList());

        dsNameList.add("master");

        for (String dsName : dsNameList) {

            try {
                List<Map<String, Object>> listTable = tableInfoService.listTable(dsName).getData();

                for (Map map : listTable) {
                    String tableName = MapUtil.getStr(map, "name");
                    String tableComment = MapUtil.getStr(map, "comment");
                    AiDataTableEntity tableEntity = new AiDataTableEntity();
                    tableEntity.setDsName(dsName);
                    tableEntity.setTableName(tableName);
                    tableEntity.setTableComment(tableComment);
                    this.getOneOpt(Wrappers.<AiDataTableEntity>lambdaQuery().eq(AiDataTableEntity::getDsName, dsName)
                                    .eq(AiDataTableEntity::getTableName, tableName), false)
                            .ifPresentOrElse(entity -> {
                                entity.setTableComment(tableComment);// 更新备注
                                baseMapper.updateById(entity);
                            }, () -> baseMapper.insert(tableEntity));
                }

            } catch (Exception e) {
                log.warn("同步数据源 {} 数据表失败，系统跳过此数据源同步", dsName, e);
            }
        }

        return true;
    }
}
