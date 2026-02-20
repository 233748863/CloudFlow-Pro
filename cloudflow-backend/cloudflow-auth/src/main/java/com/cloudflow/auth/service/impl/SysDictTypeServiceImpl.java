package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.domain.SysDictType;
import com.cloudflow.auth.mapper.SysDictDataMapper;
import com.cloudflow.auth.mapper.SysDictTypeMapper;
import com.cloudflow.auth.service.ISysDictTypeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;

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

    @Override
    public List<SysDictType> selectDictTypeAll() {
        // 查询所有正常状态的字典类型
        return list(new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getStatus, "0")
                .orderByAsc(SysDictType::getDictId));
    }

    @Override
    public List<SysDictData> selectDictDataByType(String dictType) {
        // 根据字典类型查询正常状态的字典数据，按排序号升序
        return dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getDictType, dictType)
                .eq(SysDictData::getStatus, "0")
                .orderByAsc(SysDictData::getDictSort));
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
        }
        // 删除字典类型
        removeByIds(Arrays.asList(dictIds));
        log.info("删除字典类型: {} 条，关联字典数据已清理", dictIds.length);
    }
}
