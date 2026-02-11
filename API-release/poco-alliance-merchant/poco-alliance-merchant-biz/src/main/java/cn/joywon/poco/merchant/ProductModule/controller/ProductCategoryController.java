package cn.joywon.poco.merchant.ProductModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryCreateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryQueryDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCategoryUpdateDTO;
import cn.joywon.poco.merchant.ProductModule.service.ProductCategoryService;
import cn.joywon.poco.merchant.ProductModule.vo.ProductCategoryOptsVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductCategoryVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/product-category")
@Tag(description = "product-category", name = "商品分类管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class ProductCategoryController {

    private final ProductCategoryService productCategoryService;

    @Operation(summary = "创建分类", description = "创建商品分类")
    @SysLog("创建商品分类")
    @PostMapping
    @HasPermission("merchant_product_add")
    public R<Long> createCategory(@Valid @RequestBody ProductCategoryCreateDTO createDTO) {
        return productCategoryService.createCategory(createDTO);
    }

    @Operation(summary = "更新分类", description = "更新商品分类")
    @SysLog("更新商品分类")
    @PutMapping
    @HasPermission("merchant_product_edit")
    public R<Boolean> updateCategory(@Valid @RequestBody ProductCategoryUpdateDTO updateDTO) {
        return productCategoryService.updateCategory(updateDTO);
    }

    @Operation(summary = "删除分类", description = "根据ID删除分类")
    @SysLog("删除商品分类")
    @DeleteMapping("/{categoryId}")
    @HasPermission("merchant_product_del")
    public R<Boolean> deleteCategory(@PathVariable("categoryId") Long categoryId) {
        return productCategoryService.deleteCategory(categoryId);
    }

    @Operation(summary = "批量删除分类", description = "批量删除商品分类")
    @SysLog("批量删除商品分类")
    @DeleteMapping("/batch")
    @HasPermission("merchant_product_del")
    public R<Boolean> batchDeleteCategories(@RequestBody List<Long> categoryIds) {
        return productCategoryService.batchDeleteCategories(categoryIds);
    }

    @Operation(summary = "分类详情", description = "根据ID获取分类详情")
    @GetMapping("/detail/{categoryId}")
    @HasPermission("merchant_product_view")
    public R<ProductCategoryVO> getCategoryDetail(@PathVariable("categoryId") Long categoryId) {
        return productCategoryService.getCategoryDetail(categoryId);
    }

    @Operation(summary = "分页查询分类", description = "分页查询商品分类，使用DTO")
    @PostMapping("/page")
    @HasPermission("merchant_product_view")
    public R<IPage<ProductCategoryVO>> getCategoryPage(@Valid @RequestBody ProductCategoryQueryDTO queryDTO) {
        Page<ProductCategoryVO> page = new Page<>(queryDTO.getPageNum(), queryDTO.getPageSize());
        IPage<ProductCategoryVO> result = productCategoryService.getCategoryPage(page, queryDTO);
        return R.ok(result);
    }

    @Operation(summary = "获取子分类", description = "根据父ID获取子分类列表")
    @GetMapping("/children/{parentId}")
    @HasPermission("merchant_product_view")
    public R<List<ProductCategoryVO>> getChildren(@PathVariable("parentId") Long parentId) {
        List<ProductCategoryVO> rows = productCategoryService.getChildrenByParentId(parentId);
        return R.ok(rows);
    }

    @Operation(summary = "获取树状分类列表", description = "获取树状结构的商品分类列表")
    @GetMapping("/tree")
    @HasPermission("merchant_product_view")
    public R<List<ProductCategoryVO>> getCategoryTree() {
        List<ProductCategoryVO> tree = productCategoryService.getCategoryTree();
        return R.ok(tree);
    }

    @GetMapping("/opts")
    @Operation(summary = "获取商品分类列表", description = "获取商品分类列表")
    public R<List<ProductCategoryOptsVO>> getCategoryOpts() {
        List<ProductCategoryOptsVO> result = productCategoryService.getCategoryOpts();
        return R.ok(result);
    }
}