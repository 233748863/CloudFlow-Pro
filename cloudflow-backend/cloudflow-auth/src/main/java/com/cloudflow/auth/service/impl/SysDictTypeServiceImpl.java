package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.domain.SysDictType;
import com.cloudflow.auth.mapper.SysDictDataMapper;
import com.cloudflow.auth.mapper.SysDictTypeMapper;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
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

@Slf4j
@Service
@RequiredArgsConstructor
public class SysDictTypeServiceImpl extends ServiceImpl<SysDictTypeMapper, SysDictType>
        implements ISysDictTypeService {

    private final SysDictDataMapper dictDataMapper;
    private final SysDictHelper sysDictHelper;
    private final DictReferenceRegistry dictReferenceRegistry;

    @PostConstruct
    public void init() {
        loadDictDataToRedis();
    }

    public void loadDictDataToRedis() {
        List<SysDictData> all = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getStatus, "0")
                .orderByAsc(SysDictData::getDictType)
                .orderByAsc(SysDictData::getDictSort));
        if (all == null || all.isEmpty()) {
            log.info("dict cache warmup completed, no records");
            return;
        }

        Set<String> dictTypes = new HashSet<>();
        for (SysDictData data : all) {
            dictTypes.add(data.getDictType());
        }
        for (String dictType : dictTypes) {
            List<SysDictHelper.DictItem> items = all.stream()
                    .filter(data -> dictType.equals(data.getDictType()))
                    .map(this::toDictItem)
                    .collect(Collectors.toCollection(ArrayList::new));
            sysDictHelper.setDictDataCache(dictType, items);
        }
        log.info("dict cache warmup completed, dictTypeCount={}, itemCount={}", dictTypes.size(), all.size());
    }

    private SysDictHelper.DictItem toDictItem(SysDictData data) {
        return new SysDictHelper.DictItem(
                data.getDictSort(),
                data.getDictLabel(),
                data.getDictValue(),
                data.getListClass(),
                data.getCssClass()
        );
    }

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
        return list(new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getStatus, "0")
                .orderByAsc(SysDictType::getDictId));
    }

    @Override
    public List<SysDictData> selectDictDataByType(String dictType) {
        List<SysDictHelper.DictItem> cached = sysDictHelper.getDictData(dictType);
        if (cached != null && !cached.isEmpty()) {
            List<SysDictData> result = new ArrayList<>(cached.size());
            for (SysDictHelper.DictItem item : cached) {
                SysDictData data = new SysDictData();
                data.setDictType(dictType);
                data.setDictSort(item.getSort());
                data.setDictLabel(item.getLabel());
                data.setDictValue(item.getValue());
                data.setListClass(item.getListClass());
                data.setCssClass(item.getCssClass());
                data.setStatus("0");
                result.add(data);
            }
            return result;
        }

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
        LambdaQueryWrapper<SysDictType> wrapper = new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getDictType, dictType.getDictType());
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
        SysDictType oldDict = getById(dictType.getDictId());
        if (oldDict != null && !oldDict.getDictType().equals(dictType.getDictType())) {
            assertDictTypeRenameAllowed(oldDict.getDictType());
            SysDictData updateData = new SysDictData();
            updateData.setDictType(dictType.getDictType());
            dictDataMapper.update(updateData, new LambdaQueryWrapper<SysDictData>()
                    .eq(SysDictData::getDictType, oldDict.getDictType()));
            log.info("dict type code changed, old={}, new={}", oldDict.getDictType(), dictType.getDictType());
            sysDictHelper.removeDictDataCache(oldDict.getDictType());
            refreshDictCache(dictType.getDictType());
        }
        return updateById(dictType);
    }

    @Override
    @Audit(name = "删除字典类型", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void deleteDictTypeByIds(Long[] dictIds) {
        List<SysDictType> dictTypes = listByIds(Arrays.asList(dictIds));
        for (SysDictType dictType : dictTypes) {
            assertDictTypeNotReferenced(dictType.getDictType());
            dictDataMapper.delete(new LambdaQueryWrapper<SysDictData>()
                    .eq(SysDictData::getDictType, dictType.getDictType()));
            sysDictHelper.removeDictDataCache(dictType.getDictType());
        }
        removeByIds(Arrays.asList(dictIds));
        log.info("dict types deleted, count={}", dictIds.length);
    }

    @Override
    @Audit(name = "删除字典数据", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void deleteDictDataByIds(Long[] dictCodes) {
        Set<String> affectedTypes = new HashSet<>();
        for (Long dictCode : dictCodes) {
            SysDictData data = dictDataMapper.selectById(dictCode);
            if (data == null) {
                continue;
            }
            assertDictValueNotReferenced(data.getDictType(), data.getDictValue());
            affectedTypes.add(data.getDictType());
        }
        if (dictCodes.length > 0) {
            dictDataMapper.deleteBatchIds(Arrays.asList(dictCodes));
        }
        for (String dictType : affectedTypes) {
            refreshDictCache(dictType);
        }
    }

    private void assertDictTypeNotReferenced(String dictType) {
        List<DictReferenceCheckResult> findings = findDictValueReferences(dictType, null);
        if (!findings.isEmpty()) {
            throw new ServiceException("字典类型 " + dictType + " 已被引用: " + summarizeReferences(findings),
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
        if (dictReferenceRegistry.isProtected(dictType)) {
            throw new ServiceException("字典类型 " + dictType + " 已被 " +
                    dictReferenceRegistry.protectedReason(dictType).orElse("状态机枚举") + " 绑定，禁止删除",
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
    }

    private void assertDictValueNotReferenced(String dictType, String dictValue) {
        List<DictReferenceCheckResult> findings = findDictValueReferences(dictType, dictValue);
        if (!findings.isEmpty()) {
            throw new ServiceException("字典值 " + dictType + ":" + dictValue + " 已被引用: " + summarizeReferences(findings),
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
        if (dictReferenceRegistry.isProtected(dictType)) {
            throw new ServiceException("字典值 " + dictType + ":" + dictValue + " 已被 " +
                    dictReferenceRegistry.protectedReason(dictType).orElse("状态机枚举") + " 绑定，禁止删除",
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
    }

    private void assertDictTypeRenameAllowed(String dictType) {
        List<DictReferenceCheckResult> findings = findDictValueReferences(dictType, null);
        if (!findings.isEmpty()) {
            throw new ServiceException("字典类型 " + dictType + " 已被引用: " + summarizeReferences(findings),
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
        if (!dictReferenceRegistry.isProtected(dictType)) {
            return;
        }
        throw new ServiceException("字典类型 " + dictType + " 已被 " +
                dictReferenceRegistry.protectedReason(dictType).orElse("状态机枚举") + " 绑定，禁止改名",
                ErrorCodeConstants.CONCURRENT_MODIFICATION);
    }

    private List<DictReferenceCheckResult> findDictValueReferences(String dictType, String dictValue) {
        List<DictReferenceRegistry.DictReferenceBinding> bindings = dictReferenceRegistry.bindings(dictType);
        if (bindings.isEmpty()) {
            return List.of();
        }

        List<String> values;
        if (dictValue != null) {
            values = List.of(dictValue);
        } else {
            values = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                            .select(SysDictData::getDictValue)
                            .eq(SysDictData::getDictType, dictType))
                    .stream()
                    .map(SysDictData::getDictValue)
                    .filter(value -> value != null && !value.isBlank())
                    .distinct()
                    .toList();
        }
        if (values.isEmpty()) {
            return List.of();
        }

        List<DictReferenceCheckResult> findings = new ArrayList<>();
        for (DictReferenceRegistry.DictReferenceBinding binding : bindings) {
            for (String value : values) {
                Long refCount = dictDataMapper.countDictReferences(binding.tableName(), binding.columnName(), value);
                long count = refCount == null ? 0L : refCount;
                if (count > 0) {
                    findings.add(new DictReferenceCheckResult(
                            dictType,
                            value,
                            binding.tableName(),
                            binding.columnName(),
                            binding.label(),
                            count
                    ));
                }
            }
        }
        return findings;
    }

    private String summarizeReferences(List<DictReferenceCheckResult> findings) {
        return findings.stream()
                .map(DictReferenceCheckResult::summary)
                .collect(Collectors.joining("; "));
    }
}
