
package cn.joywon.poco.merchant.ProductModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.ProductModule.dto.*;
import cn.joywon.poco.merchant.ProductModule.service.ProductService;
import cn.joywon.poco.merchant.ProductModule.vo.ProductListVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductVO;
import cn.joywon.poco.merchant.ProductModule.vo.ConsumerProductDetailVO;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 商品管理控制器
 *
 * @author poco
 * @date 2024-12-19
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/product")
@Tag(description = "product", name = "商品管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class ProductController {

    private final ProductService productService;
    private final ProductSkuService productSkuService;

    /**
     * 创建商品（SPU+SKU）
     * 【商家端】
     * @param productCreateDTO 商品创建DTO
     * @return 创建结果
     */
    @Operation(summary = "创建商品", description = "创建商品（SPU+SKU）")
    @SysLog("创建商品")
    @PostMapping
    @HasPermission("merchant_product_add")
    public R<Long> createProduct(@Valid @RequestBody ProductCreateDTO productCreateDTO) {
        return productService.createProduct(productCreateDTO);
    }

    /**
     * 更新商品（SPU+SKU）
     * 【商家端】
     * @param productUpdateDTO 商品更新DTO
     * @return 更新结果
     */
    @Operation(summary = "更新商品", description = "更新商品（SPU+SKU）")
    @SysLog("更新商品")
    @PutMapping
    @HasPermission("merchant_product_edit")
    public R<Boolean> updateProduct(@Valid @RequestBody ProductUpdateDTO productUpdateDTO) {
        return productService.updateProduct(productUpdateDTO);
    }

    /**
     * 获取商品详情
     * 【商家端】
     * @param productId 商品ID
     * @return 商品详情
     */
    @Operation(summary = "获取商品详情", description = "根据商品ID获取商品详情")
    @GetMapping("/detail/{productId}")
    @HasPermission("merchant_product_view")
    public R<ProductVO> getProductDetail(@PathVariable("productId") Long productId) {
        return productService.getProductDetail(productId);
    }

    /**
     * 分页查询商品列表
     * 【商家端】
     * @param queryDTO 查询条件
     * @return 商品列表
     */
    @Operation(summary = "分页查询商品", description = "分页+条件查询，使用DTO")
    @PostMapping("/page")
    @HasPermission("merchant_product_view")
    public R<IPage<ProductListVO>> getProductPage(@Valid @RequestBody ProductQueryDTO queryDTO) {
        Page<ProductListVO> page = new Page<>(queryDTO.getPageNum(), queryDTO.getPageSize());
        IPage<ProductListVO> result = productService.getProductPage(page, queryDTO);
        return R.ok(result);
    }

    /**
     * 分页查询商品列表（消费者）
     * 【消费者端】前台商品列表页
     * @param queryDTO 查询条件
     * @return 商品列表
     */
    @Operation(summary = "分页查询商品（消费者）", description = "分页查询上架商品列表，使用DTO")
    @PostMapping("/consumer/page")
    @Inner(value = false)
    public R<IPage<ProductListVO>> getConsumerProductPage(@Valid @RequestBody ProductQueryDTO queryDTO) {
        Page<ProductListVO> page = new Page<>(queryDTO.getPageNum(), queryDTO.getPageSize());
        IPage<ProductListVO> result = productService.getConsumerProductPage(page, queryDTO);
        return R.ok(result);
    }

    /**
     * 根据商家ID获取商品列表
     * 【商家端】
     * @param merchantId 商家ID
     * @return 商品列表
     */
    @Operation(summary = "根据商家ID获取商品", description = "根据商家ID获取商品列表")
    @GetMapping("/merchant/{merchantId}")
    @HasPermission("merchant_product_view")
    public R<List<ProductListVO>> getProductsByMerchantId(@PathVariable("merchantId") Long merchantId) {
        List<ProductListVO> result = productService.getProductsByMerchantId(merchantId);
        return R.ok(result);
    }

    /**
     * 根据分类ID获取商品列表
     * 【消费者端】前台分类页
     * @param categoryId 分类ID
     * @return 商品列表
     */
    @Operation(summary = "根据分类ID获取商品", description = "根据分类ID获取商品列表")
    @GetMapping("/category/{categoryId}")
    @Inner(value = false)
    public R<List<ProductListVO>> getProductsByCategoryId(@PathVariable("categoryId") Long categoryId) {
        List<ProductListVO> result = productService.getProductsByCategoryId(categoryId);
        return R.ok(result);
    }

    /**
     * 删除商品
     * 【商家端】
     * @param productId 商品ID
     * @return 删除结果
     */
    @Operation(summary = "删除商品", description = "根据商品ID删除商品")
    @SysLog("删除商品")
    @DeleteMapping("/{productId}")
    @HasPermission("merchant_product_del")
    public R<Boolean> deleteProduct(@PathVariable("productId") Long productId) {
        return productService.deleteProduct(productId);
    }

    /**
     * 批量删除商品
     * 【商家端】
     * @param productIds 商品ID列表
     * @return 删除结果
     */
    @Operation(summary = "批量删除商品", description = "批量删除商品")
    @SysLog("批量删除商品")
    @DeleteMapping("/batch")
    @HasPermission("merchant_product_del")
    public R<Boolean> batchDeleteProducts(@RequestBody List<Long> productIds) {
        return productService.batchDeleteProducts(productIds);
    }

    /**
     * 更新商品状态
     * 【商家端】
     * @param productId 商品ID
     * @param status 状态
     * @return 更新结果
     */
    @Operation(summary = "更新商品状态", description = "更新商品状态")
    @SysLog("更新商品状态")
    @PutMapping("/{productId}/status")
    @HasPermission("merchant_product_edit")
    public R<Boolean> updateProductStatus(@PathVariable("productId") Long productId,
                                          @RequestParam("status") String status) {
        return productService.updateProductStatus(productId, status);
    }

    /**
     * 批量更新商品状态
     * 【商家端】
     * @param productIds 商品ID列表
     * @param status 状态
     * @return 更新结果
     */
    @Operation(summary = "批量更新商品状态", description = "批量更新商品状态")
    @SysLog("批量更新商品状态")
    @PutMapping("/batch/status/{status}")
    @HasPermission("merchant_product_edit")
    public R<Boolean> batchUpdateProductStatus(@RequestBody List<Long> productIds,
                                               @PathVariable("status") String status) {
        return productService.batchUpdateProductStatus(productIds, status);
    }

    /**
     * 商品上架
     * 【商家端】
     * @param productId 商品ID
     * @return 上架结果
     */
    @Operation(summary = "商品上架", description = "商品上架")
    @SysLog("商品上架")
    @PutMapping("/{productId}/publish")
    @HasPermission("merchant_product_edit")
    public R<Boolean> publishProduct(@PathVariable("productId") Long productId) {
        return productService.publishProduct(productId);
    }

    /**
     * 商品下架
     * 【商家端】
     * @param productId 商品ID
     * @return 下架结果
     */
    @Operation(summary = "商品下架", description = "商品下架")
    @SysLog("商品下架")
    @PutMapping("/{productId}/unpublish")
    @HasPermission("merchant_product_edit")
    public R<Boolean> unpublishProduct(@PathVariable("productId") Long productId) {
        return productService.unpublishProduct(productId);
    }

    /**
     * 切换商品状态
     * 【商家端】
     * @param input 切换状态参数
     * @return 切换结果
     */
    @Operation(summary = "切换商品状态", description = "切换商品状态")
    @SysLog("切换商品状态")
    @PutMapping("/status/toggle")
    @HasPermission("merchant_product_edit")
    public R<Boolean> toggleProductStatus(@Valid @RequestBody ProductToggleStatusDTO input) {
        return productService.toggleProductStatus(input);
    }

    /**
     * 商品归档
     * 【商家端】
     * @param productId 商品ID
     * @return 归档结果
     */
    @Operation(summary = "商品归档", description = "商品归档")
    @SysLog("商品归档")
    @PutMapping("/{productId}/archive")
    @HasPermission("merchant_product_edit")
    public R<Boolean> archiveProduct(@PathVariable("productId") Long productId) {
        return productService.archiveProduct(productId);
    }

    /**
     * 获取商品详情（消费者）
     * 【消费者端】仅返回上架商品与启用SKU
     * @param productId 商品ID
     * @return 商品详情
     */
    @Operation(summary = "获取商品详情（消费者）", description = "根据商品ID获取上架商品详情（含启用SKU）")
    @GetMapping("/consumer/detail/{productId}")
    @Inner(value = false)
    public R<ConsumerProductDetailVO> getProductDetailForConsumer(@PathVariable("productId") Long productId) {
        ConsumerProductDetailVO detail = productSkuService.getConsumerProductDetailByProductId(productId);
        return R.ok(detail);
    }
}