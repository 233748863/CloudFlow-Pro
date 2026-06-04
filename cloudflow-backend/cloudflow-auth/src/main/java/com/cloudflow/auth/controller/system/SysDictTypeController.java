package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysDictType;
import com.cloudflow.auth.domain.SysDictVersion;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
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
    private ISysDictTypeService sysDictTypeService;

    /** 查询字典类型列表 */
    @GetMapping("/list")
    @SaCheckPermission("system:dict:list")
    public R<List<SysDictType>> list() {
        return R.ok(sysDictTypeService.selectDictTypeAll());
    }

    /** 查询字典类型详情 */
    @GetMapping("/{dictId}")
    @SaCheckPermission("system:dict:query")
    public R<SysDictType> getInfo(@PathVariable("dictId") Long dictId) {
        return R.ok(sysDictTypeService.getById(dictId));
    }

    /** 新增字典类型 */
    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("system:dict:add")
    public R<?> add(@RequestBody SysDictType dictType) {
        if (!sysDictTypeService.checkDictTypeUnique(dictType)) {
            return R.fail("字典类型'" + dictType.getDictType() + "'已存在");
        }
        return R.ok(sysDictTypeService.insertDictType(dictType));
    }

    /** 修改字典类型 */
    @PutMapping
    @RepeatSubmit
    @SaCheckPermission("system:dict:edit")
    public R<?> edit(@RequestBody SysDictType dictType) {
        if (!sysDictTypeService.checkDictTypeUnique(dictType)) {
            return R.fail("字典类型'" + dictType.getDictType() + "'已存在");
        }
        return R.ok(sysDictTypeService.updateDictType(dictType));
    }

    /** 删除字典类型 */
    @DeleteMapping("/{dictIds}")
    @SaCheckPermission("system:dict:remove")
    public R<?> remove(@PathVariable("dictIds") Long[] dictIds) {
        sysDictTypeService.deleteDictTypeByIds(dictIds);
        return R.ok();
    }

    @GetMapping("/{dictType}/version/list")
    @SaCheckPermission("system:dict:list")
    public R<List<SysDictVersion>> versionList(@PathVariable String dictType) {
        return R.ok(sysDictTypeService.listDictVersions(dictType));
    }

    @PostMapping("/version/{versionId}/rollback")
    @RepeatSubmit
    @SaCheckPermission("system:dict:edit")
    public R<?> rollback(@PathVariable Long versionId) {
        sysDictTypeService.rollbackDictVersion(versionId);
        return R.ok();
    }

    /** 获取字典选择框列表（不需要权限，供下拉框使用） */
    @GetMapping("/optionselect")
    @SaCheckPermission("system:dict:list")
    public R<List<SysDictType>> optionselect() {
        return R.ok(sysDictTypeService.selectDictTypeAll());
    }
}
