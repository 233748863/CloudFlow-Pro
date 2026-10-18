package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckLogin;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.domain.SysDictVersion;
import com.cloudflow.auth.domain.dto.DictChangeResult;
import com.cloudflow.auth.domain.vo.DictChangeApprovalDetailVO;
import com.cloudflow.auth.domain.vo.DictChangeApprovalSummaryVO;
import com.cloudflow.auth.mapper.SysDictDataMapper;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

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
    @SaCheckLogin
    @SaCheckPermission("system:lookup:read")
    public R<List<DictionaryOption>> dictType(@PathVariable("dictType") String dictType) {
        return R.ok(sysDictTypeService.selectDictDataByType(dictType).stream()
                .filter(item -> "0".equals(item.getStatus()))
                .map(item -> new DictionaryOption(item.getDictType(), item.getDictLabel(), item.getDictValue(),
                        item.getDictSort(), item.getCssClass(), item.getListClass(), item.getIsDefault(), item.getStatus()))
                .toList());
    }

    public record DictionaryOption(String dictType, String dictLabel, String dictValue, Integer dictSort,
            String cssClass, String listClass, String isDefault, String status) { }

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
    @RepeatSubmit
    @SaCheckPermission("system:dict:add")
    public R<?> add(@RequestBody SysDictData dictData) {
        return R.ok(sysDictTypeService.saveDictData(dictData));
    }

    /** 修改字典数据 */
    @PutMapping
    @RepeatSubmit
    @SaCheckPermission("system:dict:edit")
    public R<?> edit(@RequestBody SysDictData dictData) {
        return R.ok(sysDictTypeService.updateDictData(dictData));
    }

    /** 删除字典数据 */
    @DeleteMapping("/{dictCodes}")
    @SaCheckPermission("system:dict:remove")
    public R<DictChangeResult> remove(@PathVariable("dictCodes") Long[] dictCodes) {
        return R.ok(sysDictTypeService.deleteDictDataByIds(dictCodes));
    }

    @GetMapping("/version/{dictType}")
    @SaCheckPermission("system:dict:list")
    public R<List<SysDictVersion>> versions(@PathVariable String dictType) {
        return R.ok(sysDictTypeService.listDictVersions(dictType));
    }

    @GetMapping("/approval/list")
    @SaCheckPermission("system:dict:list")
    public R<List<DictChangeApprovalSummaryVO>> approvalList(@RequestParam(required = false) String dictType) {
        return R.ok(sysDictTypeService.listDictChangeApprovals(dictType));
    }

    @GetMapping("/approval/{approvalId}")
    @SaCheckPermission("system:dict:query")
    public R<DictChangeApprovalDetailVO> approvalDetail(@PathVariable Long approvalId) {
        return R.ok(sysDictTypeService.getDictChangeApprovalDetail(approvalId));
    }

    @PostMapping("/version/{versionId}/rollback")
    @RepeatSubmit
    @SaCheckPermission("system:dict:edit")
    public R<?> rollback(@PathVariable Long versionId) {
        sysDictTypeService.rollbackDictVersion(versionId);
        return R.ok();
    }
}
