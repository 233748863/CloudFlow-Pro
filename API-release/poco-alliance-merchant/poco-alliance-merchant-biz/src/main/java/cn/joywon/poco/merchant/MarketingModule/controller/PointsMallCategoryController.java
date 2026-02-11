package cn.joywon.poco.merchant.MarketingModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryCreateDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryQueryDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallCategoryUpdateDTO;
import cn.joywon.poco.merchant.MarketingModule.service.IPointsMallCategoryService;
import cn.joywon.poco.merchant.MarketingModule.vo.PointsMallCategoryTreeVO;
import cn.joywon.poco.merchant.MarketingModule.vo.PointsMallCategoryVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Validated
@RestController
@RequiredArgsConstructor
@Tag(name = "积分商城商品分类管理")
@RequestMapping("/marketing/category")
public class PointsMallCategoryController {

    private final IPointsMallCategoryService pointsMallCategoryService;


    /**
     * 添加积分商城商品分类
     *
     * @param dto 积分商城商品分类添加参数
     * @return 响应结果
     */
    @PostMapping("/add")
    @SysLog(value = "添加积分商城商品分类")
    @Operation(summary = "添加积分商城商品分类")
    public R<?> addCategory(@RequestBody @Valid PointsMallCategoryCreateDTO dto) {
        return pointsMallCategoryService.addCategory(dto);
    }


    /**
     * 删除积分商城商品分类
     *
     * @param id 商品分类ID
     * @return 响应结果
     */
    @DeleteMapping("/delete")
    @SysLog(value = "删除积分商城商品分类")
    @Operation(summary = "删除积分商城商品分类")
    public R<?> deleteCategory(@RequestParam("id") String id) {
        return pointsMallCategoryService.deleteCategory(id);
    }


    /**
     * 更新积分商城商品分类
     *
     * @param dto 积分商城商品分类更新参数
     * @return 响应结果
     */
    @PutMapping("/update")
    @SysLog(value = "更新积分商城商品分类")
    @Operation(summary = "更新积分商城商品分类")
    public R<?> updateCategory(@RequestBody @Valid PointsMallCategoryUpdateDTO dto) {
        return pointsMallCategoryService.updateCategory(dto);
    }


    /**
     * 启用/禁用积分商城商品分类
     *
     * @param id     商品分类ID
     * @param enable 启用/禁用
     * @return 响应结果
     */
    @PutMapping("/enable")
    @SysLog(value = "启用/禁用积分商城商品分类")
    @Operation(summary = "启用/禁用积分商城商品分类", description = "禁用为向下联级操作, 启用不为联级")
    public R<?> enableCategory(@RequestParam("id") String id, @RequestParam("enable") Boolean enable) {
        return pointsMallCategoryService.enableCategory(id, enable);
    }


    /**
     * 查询积分商城商品分类父级列表
     *
     * @return 响应结果
     */
    @GetMapping("/parent/list")
    @Operation(summary = "查询积分商城商品分类父级列表")
    public R<List<PointsMallCategoryTreeVO>> queryParentCategoryList() {
        List<PointsMallCategoryTreeVO> vos = pointsMallCategoryService.queryParentCategoryList();
        return R.ok(vos);
    }


    /**
     * 查询积分商城商品分类下树形结构子级分类
     *
     * @param id 商品分类ID
     * @return 响应结果
     */
    @GetMapping("/sub/tree")
    @Operation(summary = "查询积分商城商品分类树形列表")
    private R<PointsMallCategoryTreeVO> queryCategorySubTreeList(@RequestParam("id") String id) {
        PointsMallCategoryTreeVO vo = pointsMallCategoryService.queryCategorySubTreeList(Long.valueOf(id), null);
        return R.ok(vo);
    }


    /**
     * 查询积分商城商品分类列表
     *
     * @param dto 查询参数
     * @return 响应结果
     */
    @PostMapping("/list")
    @Operation(summary = "查询积分商城商品分类列表")
    private R<PageQueryVO<PointsMallCategoryVO>> queryCategoryList(@RequestBody @Valid PointsMallCategoryQueryDTO dto) {
        return pointsMallCategoryService.queryCategoryList(dto);
    }


    /* ================================================== 消费者端 ============================================================ */


    /**
     * 获取积分商城商品分类父级列表缓存
     *
     * @return 响应结果
     */
    @Inner(value = false)
    @GetMapping("/cache/parent")
    @Operation(summary = "查询积分商城商品分类父级列表缓存")
    public R<List<PointsMallCategoryTreeVO>> getParentCategoryCache() {
        return pointsMallCategoryService.getParentCategory();
    }


    /**
     * 获取积分商城商品分类子级树形列表缓存
     *
     * @param topParentId 顶级父级分类ID
     * @return 响应结果
     */
    @Inner(value = false)
    @GetMapping("/cache/sub/tree")
    @Operation(summary = "查询积分商城商品分类子级树形列表缓存")
    public R<List<PointsMallCategoryTreeVO>> getSubTreeCategoryCache(@RequestParam("topParentId") String topParentId) {
        return pointsMallCategoryService.getSubTreeCategory(topParentId);
    }


}