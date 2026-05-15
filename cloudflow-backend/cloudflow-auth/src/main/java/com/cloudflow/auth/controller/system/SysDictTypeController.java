package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysDictType;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 字典类型管理
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/system/dict/type")
public class SysDictTypeController {

    @Autowired
    private ISysDictTypeService dictTypeService;

    /** 查询字典类型列表 */
    @GetMapping("/list")
    @SaCheckPermission("system:dict:list")
    public R<List<SysDictType>> list() {
        return R.ok(dictTypeService.selectDictTypeAll());
    }

    /** 查询字典类型详情 */
    @GetMapping("/{dictId}")
    @SaCheckPermission("system:dict:query")
    public R<SysDictType> getInfo(@PathVariable("dictId") Long dictId) {
        return R.ok(dictTypeService.getById(dictId));
    }

    /** 新增字典类型 */
    @PostMapping
    @SaCheckPermission("system:dict:add")
    public R<?> add(@RequestBody SysDictType dictType) {
        if (!dictTypeService.checkDictTypeUnique(dictType)) {
            return R.fail("字典类型'" + dictType.getDictType() + "'已存在");
        }
        return R.ok(dictTypeService.insertDictType(dictType));
    }

    /** 修改字典类型 */
    @PutMapping
    @SaCheckPermission("system:dict:edit")
    public R<?> edit(@RequestBody SysDictType dictType) {
        if (!dictTypeService.checkDictTypeUnique(dictType)) {
            return R.fail("字典类型'" + dictType.getDictType() + "'已存在");
        }
        return R.ok(dictTypeService.updateDictType(dictType));
    }

    /** 删除字典类型 */
    @DeleteMapping("/{dictIds}")
    @SaCheckPermission("system:dict:remove")
    public R<?> remove(@PathVariable("dictIds") Long[] dictIds) {
        dictTypeService.deleteDictTypeByIds(dictIds);
        return R.ok();
    }

    /** 获取字典选择框列表（不需要权限，供下拉框使用） */
    @GetMapping("/optionselect")
    @SaCheckPermission("system:dict:list")
    public R<List<SysDictType>> optionselect() {
        return R.ok(dictTypeService.selectDictTypeAll());
    }
}
