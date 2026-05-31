package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.domain.SysDictType;
import com.cloudflow.auth.mapper.SysDictDataMapper;
import com.cloudflow.auth.mapper.SysDictTypeMapper;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.common.redis.core.SysDictHelper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 字典类型 Service 实现
 *
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysDictTypeServiceImpl extends ServiceImpl<SysDictTypeMapper, SysDictType>
        implements ISysDictTypeService {

    private final SysDictDataMapper dictDataMapper;
    private final SysDictHelper sysDictHelper;

    /**
     * 应用启动时，将所有字典数据按 dictType 分组写入 Redis，
     * 后续业务通过 {@link SysDictHelper#getDictData(String)} 读取。
     */
    @PostConstruct
    public void init() {
        loadDictDataToRedis();
    }

    /**
     * 全量预热字典缓存
     */
    public void loadDictDataToRedis() {
        List<SysDictData> all = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getStatus, "0")
                .orderByAsc(SysDictData::getDictType)
                .orderByAsc(SysDictData::getDictSort));
        if (all == null || all.isEmpty()) {
            log.info("字典数据缓存预热完成，0 条数据");
            return;
        }
        // 按 dictType 分组写入
        Set<String> dictTypes = new HashSet<>();
        for (SysDictData d : all) {
            dictTypes.add(d.getDictType());
        }
        for (String dictType : dictTypes) {
            List<SysDictHelper.DictItem> items = all.stream()
                    .filter(d -> dictType.equals(d.getDictType()))
                    .map(this::toDictItem)
                    .collect(Collectors.toCollection(ArrayList::new));
            sysDictHelper.setDictDataCache(dictType, items);
        }
        log.info("字典数据缓存预热完成，{} 个字典类型，共 {} 条数据", dictTypes.size(), all.size());
    }

    private SysDictHelper.DictItem toDictItem(SysDictData d) {
        return new SysDictHelper.DictItem(
                d.getDictSort(),
                d.getDictLabel(),
                d.getDictValue(),
                d.getListClass(),
                d.getCssClass()
        );
    }

    /**
     * 重新加载单个字典类型的缓存
     */
    @Override
    public void refreshDictCache(String dictType) {
        if (dictType == null || dictType.isEmpty()) {
            return;
        }
        List<SysDictData> list = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getDictType, dictType)
                .eq(SysDictData::getStatus, "0")
                .orderByAsc(SysDictData::getDictSort));
        List<SysDictHelper.DictItem> items = list.stream()
                .map(this::toDictItem)
                .collect(Collectors.toCollection(ArrayList::new));
        sysDictHelper.setDictDataCache(dictType, items);
    }

    @Override
    public List<SysDictType> selectDictTypeAll() {
        // 查询所有正常状态的字典类型
        return list(new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getStatus, "0")
                .orderByAsc(SysDictType::getDictId));
    }

    @Override
    public List<SysDictData> selectDictDataByType(String dictType) {
        // Redis 优先：启动时已预热到 sys:dict:data:{dictType}
        // 命中则直接拼回 SysDictData 形态（仅含前端依赖字段）返回，避免每次都打 MySQL
        List<SysDictHelper.DictItem> cached = sysDictHelper.getDictData(dictType);
        if (cached != null && !cached.isEmpty()) {
            List<SysDictData> result = new ArrayList<>(cached.size());
            for (SysDictHelper.DictItem item : cached) {
                SysDictData d = new SysDictData();
                d.setDictType(dictType);
                d.setDictSort(item.getSort());
                d.setDictLabel(item.getLabel());
                d.setDictValue(item.getValue());
                d.setListClass(item.getListClass());
                d.setCssClass(item.getCssClass());
                d.setStatus("0");
                result.add(d);
            }
            return result;
        }
        // 降级：缓存未命中（启动顺序、字典刚被清空等）回查 DB，并补一次缓存
        List<SysDictData> list = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getDictType, dictType)
                .eq(SysDictData::getStatus, "0")
                .orderByAsc(SysDictData::getDictSort));
        if (!list.isEmpty()) {
            List<SysDictHelper.DictItem> items = list.stream()
                    .map(this::toDictItem)
                    .collect(Collectors.toCollection(ArrayList::new));
            sysDictHelper.setDictDataCache(dictType, items);
        }
        return list;
    }

    @Override
    public boolean checkDictTypeUnique(SysDictType dictType) {
        // 校验字典类型标识是否已存在
        LambdaQueryWrapper<SysDictType> wrapper = new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getDictType, dictType.getDictType());
        // 编辑时排除自身
        if (dictType.getDictId() != null) {
            wrapper.ne(SysDictType::getDictId, dictType.getDictId());
        }
        return count(wrapper) == 0;
    }

    @Override
    public boolean insertDictType(SysDictType dictType) {
        return save(dictType);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateDictType(SysDictType dictType) {
        // 查询旧的字典类型标识
        SysDictType oldDict = getById(dictType.getDictId());
        if (oldDict != null && !oldDict.getDictType().equals(dictType.getDictType())) {
            // 如果字典类型标识变更，同步更新字典数据表中的 dict_type
            SysDictData updateData = new SysDictData();
            updateData.setDictType(dictType.getDictType());
            dictDataMapper.update(updateData, new LambdaQueryWrapper<SysDictData>()
                    .eq(SysDictData::getDictType, oldDict.getDictType()));
            log.info("字典类型标识变更: {} -> {}, 已同步更新字典数据", oldDict.getDictType(), dictType.getDictType());
            // 旧 dictType 缓存清除，新 dictType 缓存重建
            sysDictHelper.removeDictDataCache(oldDict.getDictType());
            refreshDictCache(dictType.getDictType());
        }
        return updateById(dictType);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDictTypeByIds(Long[] dictIds) {
        // 先查询要删除的字典类型，获取 dictType 列表
        List<SysDictType> dictTypes = listByIds(Arrays.asList(dictIds));
        for (SysDictType dictType : dictTypes) {
            // 删除关联的字典数据
            dictDataMapper.delete(new LambdaQueryWrapper<SysDictData>()
                    .eq(SysDictData::getDictType, dictType.getDictType()));
            sysDictHelper.removeDictDataCache(dictType.getDictType());
        }
        // 删除字典类型
        removeByIds(Arrays.asList(dictIds));
        log.info("删除字典类型: {} 条，关联字典数据已清理", dictIds.length);
    }
}
