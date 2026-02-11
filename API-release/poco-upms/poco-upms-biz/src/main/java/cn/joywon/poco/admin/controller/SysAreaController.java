package cn.joywon.poco.admin.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import cn.joywon.poco.admin.api.entity.SysAreaEntity;
import cn.joywon.poco.admin.service.SysAreaService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 行政区划
 *
 * @author lbw
 * @date 2024-02-16 22:40:06
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/sysArea")
@Tag(description = "sysArea", name = "行政区划管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class SysAreaController {

    private final SysAreaService sysAreaService;

    /**
     * 分页查询
     *
     * @param page    分页对象
     * @param sysArea 行政区划
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @HasPermission("sys_sysArea_view")
    public R getSysAreaPage(@ParameterObject Page page, @ParameterObject SysAreaEntity sysArea) {
        return R.ok(sysAreaService.selectPage(page, sysArea));
    }

    /**
     * 前端联动组件需要数据
     *
     * @param sysArea 查询条件
     * @return tree
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/tree")
    //@HasPermission("sys_sysArea_view")
    public R getSysAreaTree(@ParameterObject SysAreaEntity sysArea) {
        return R.ok(sysAreaService.selectTree(sysArea));
    }

    /**
     * 获取详细信息
     *
     * @param sysArea 查询条件
     * @return {@link R }
     */
    @Operation(summary = "获取详细信息", description = "获取详细信息")
    @GetMapping("/details")
    @HasPermission("sys_sysArea_view")
    public R getDetails(@ParameterObject SysAreaEntity sysArea) {
        return R.ok(sysAreaService.getOne(Wrappers.query(sysArea)));
    }

    /**
     * 新增行政区划
     *
     * @param sysArea 行政区划
     * @return R
     */
    @Operation(summary = "新增行政区划", description = "新增行政区划")
    @SysLog("新增行政区划")
    @PostMapping
    @HasPermission("sys_sysArea_add")
    public R save(@RequestBody SysAreaEntity sysArea) {
        return R.ok(sysAreaService.save(sysArea));
    }

    /**
     * 修改行政区划
     *
     * @param sysArea 行政区划
     * @return R
     */
    @Operation(summary = "修改行政区划", description = "修改行政区划")
    @SysLog("修改行政区划")
    @PutMapping
    @HasPermission("sys_sysArea_edit")
    public R updateById(@RequestBody SysAreaEntity sysArea) {
        return R.ok(sysAreaService.updateById(sysArea));
    }

    /**
     * 通过id删除行政区划
     *
     * @param ids id列表
     * @return R
     */
    @Operation(summary = "通过id删除行政区划", description = "通过id删除行政区划")
    @SysLog("通过id删除行政区划")
    @DeleteMapping
    @HasPermission("sys_sysArea_del")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(sysAreaService.removeBatchByIds(CollUtil.toList(ids)));
    }

    /**
     * 导出excel 表格
     *
     * @param sysArea 查询条件
     * @param ids     导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @HasPermission("sys_sysArea_export")
    public List<SysAreaEntity> export(SysAreaEntity sysArea, Long[] ids) {
        return sysAreaService
                .list(Wrappers.lambdaQuery(sysArea).in(ArrayUtil.isNotEmpty(ids), SysAreaEntity::getId, CollUtil.toList(ids)));
    }


    /**
     * 根据adCode获取城市名称
     *
     * @param adCode adCode
     * @return locationName
     */
    @GetMapping("/location/byCode")
    @Operation(summary = "根据adCode获取地区名称")
    public R<String> getLocationByCode(@RequestParam("adCode") Long adCode) {
        return R.ok(sysAreaService.getLocationByCode(adCode));
    }


    /**
     * 根据地区名称获取adCode
     *
     * @param name 地区名称
     * @return adCode
     */
    @GetMapping("/code/byName")
    @Operation(summary = "根据地区名称获取adCode")
    public R<Long> getCodeByLocation(@RequestParam("name") String name) {
        return R.ok(sysAreaService.getCodeByLocation(name));
    }


    /**
     * 根据adCode列表获取地区名称列表
     *
     * @param adCodes adCode列表
     * @return 地区名称列表
     */
    @GetMapping("/locations/byCodes")
    @Operation(summary = "根据adCode列表获取地区名称列表")
    public R<List<String>> getLocationsByCodes(@RequestParam("codes") List<Long> adCodes) {
        return R.ok(sysAreaService.getLocationsByCodes(adCodes));
    }


}
