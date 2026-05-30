package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.mapper.SysDictDataMapper;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;

/**
 * 字典数据管理
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/system/dict/data")
public class SysDictDataController {

    @Autowired
    private SysDictDataMapper dictDataMapper;

    @Autowired
    private ISysDictTypeService sysDictTypeService;

    /** 根据字典类型查询字典数据列表 */
    @GetMapping("/type/{dictType}")
    @SaCheckPermission("system:dict:list")
    public R<List<SysDictData>> dictType(@PathVariable("dictType") String dictType) {
        return R.ok(sysDictTypeService.selectDictDataByType(dictType));
    }

    /** 查询字典数据列表（管理页面用，包含停用的） */
    @GetMapping("/list")
    @SaCheckPermission("system:dict:list")
    public R<List<SysDictData>> list(@RequestParam(required = false) String dictType) {
        LambdaQueryWrapper<SysDictData> wrapper = new LambdaQueryWrapper<>();
        if (dictType != null && !dictType.isEmpty()) {
            wrapper.eq(SysDictData::getDictType, dictType);
        }
        wrapper.orderByAsc(SysDictData::getDictSort);
        return R.ok(dictDataMapper.selectList(wrapper));
    }

    /** 查询字典数据详情 */
    @GetMapping("/{dictCode}")
    @SaCheckPermission("system:dict:query")
    public R<SysDictData> getInfo(@PathVariable("dictCode") Long dictCode) {
        return R.ok(dictDataMapper.selectById(dictCode));
    }

    /** 新增字典数据 */
    @PostMapping
    @SaCheckPermission("system:dict:add")
    public R<?> add(@RequestBody SysDictData dictData) {
        dictDataMapper.insert(dictData);
        sysDictTypeService.refreshDictCache(dictData.getDictType());
        return R.ok();
    }

    /** 修改字典数据 */
    @PutMapping
    @SaCheckPermission("system:dict:edit")
    public R<?> edit(@RequestBody SysDictData dictData) {
        SysDictData old = dictDataMapper.selectById(dictData.getDictCode());
        dictDataMapper.updateById(dictData);
        // 旧 dictType 与新 dictType 都要刷新（dictType 可能被改）
        if (old != null && old.getDictType() != null && !old.getDictType().equals(dictData.getDictType())) {
            sysDictTypeService.refreshDictCache(old.getDictType());
        }
        sysDictTypeService.refreshDictCache(dictData.getDictType());
        return R.ok();
    }

    /** 删除字典数据 */
    @DeleteMapping("/{dictCodes}")
    @SaCheckPermission("system:dict:remove")
    public R<?> remove(@PathVariable("dictCodes") Long[] dictCodes) {
        java.util.Set<String> affectedTypes = new java.util.HashSet<>();
        for (Long code : dictCodes) {
            SysDictData d = dictDataMapper.selectById(code);
            if (d != null && d.getDictType() != null) {
                affectedTypes.add(d.getDictType());
            }
        }
        dictDataMapper.deleteBatchIds(Arrays.asList(dictCodes));
        for (String dictType : affectedTypes) {
            sysDictTypeService.refreshDictCache(dictType);
        }
        return R.ok();
    }
}
