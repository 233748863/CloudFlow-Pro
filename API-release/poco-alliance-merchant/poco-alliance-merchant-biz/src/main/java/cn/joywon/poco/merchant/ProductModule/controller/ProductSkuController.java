

package cn.joywon.poco.merchant.ProductModule.controller;


import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.ProductModule.dto.*;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import cn.joywon.poco.merchant.ProductModule.vo.ProductPriceStockVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductDetailVO;
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
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 商品SKU管理控制器
 *
 * @author poco
 * @date 2024-12-19
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/product-sku")
@Tag(description = "product-sku", name = "商品SKU管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class ProductSkuController {

    private final ProductSkuService productSkuService;

    /**
     * 根据商品ID获取SKU列表
     * 【商家端】
     * @param productId 商品ID
     * @return SKU列表
     */
    @Operation(summary = "获取商品SKU列表", description = "根据商品ID获取SKU列表")
    @GetMapping("/product/{productId}")
    @HasPermission("merchant_product_view")
    public R<List<ProductSkuVO>> getSkusByProductId(@PathVariable("productId") Long productId) {
        List<ProductSkuVO> result = productSkuService.getSkusByProductId(productId);
        return R.ok(result);
    }

    /**
     * 分页查询商品与SKU详情
     * 【商家端】
     * @return 分页数据
     */
    @Operation(summary = "分页查询商品与SKU详情", description = "分页查询登录商家的商品与SKU关联数据（使用DTO，多条件筛选）")
    @PostMapping("/detail/page")
    @HasPermission("merchant_product_view")
    public R<IPage<ProductDetailVO>> getProductDetailPage(@Valid @RequestBody ProductDetailPageQueryDTO productDetailPageQueryDTO) {
        IPage<ProductDetailVO> result = productSkuService.getProductDetailPage(productDetailPageQueryDTO);
        return R.ok(result);
    }

    /**
     * 获取SKU详情
     * 【商家端】
     * @param skuId SKU ID
     * @return SKU详情
     */
    @Operation(summary = "获取SKU详情", description = "根据SKU ID获取SKU详情")
    @GetMapping("/detail/{skuId}")
    @HasPermission("merchant_product_view")
    public R<ProductSkuVO> getSkuDetail(@PathVariable("skuId") Long skuId) {
        return productSkuService.getSkuDetail(skuId);
    }

    /**
     * 创建SKU
     * 【商家端】
     * @param skuCreateDTO SKU创建DTO
     * @return 创建结果
     */
    @Operation(summary = "创建SKU", description = "创建商品SKU")
    @SysLog("创建SKU")
    @PostMapping
    @HasPermission("merchant_product_add")
    public R<Long> createSku(@Valid @RequestBody ProductSkuCreateDTO skuCreateDTO) {
        return productSkuService.createSku(skuCreateDTO);
    }

    /**
     * 更新SKU
     * 【商家端】
     * @param skuUpdateDTO SKU更新DTO
     * @return 更新结果
     */
    @Operation(summary = "更新SKU", description = "更新商品SKU")
    @SysLog("更新SKU")
    @PutMapping
    @HasPermission("merchant_product_edit")
    public R<Boolean> updateSku(@Valid @RequestBody ProductSkuUpdateDTO skuUpdateDTO) {
        return productSkuService.updateSku(skuUpdateDTO);
    }

    /**
     * 删除SKU
     * 【商家端】
     * @param skuId SKU ID
     * @return 删除结果
     */
    @Operation(summary = "删除SKU", description = "根据SKU ID删除SKU")
    @SysLog("删除SKU")
    @DeleteMapping("/{skuId}")
    @HasPermission("merchant_product_del")
    public R<Boolean> deleteSku(@PathVariable("skuId") Long skuId) {
        return productSkuService.deleteSku(skuId);
    }

    /**
     * 批量删除SKU
     * 【商家端】
     * @param productId 商品ID
     * @return 删除结果
     */
    @Operation(summary = "批量删除SKU", description = "根据商品ID批量删除SKU")
    @SysLog("批量删除SKU")
    @DeleteMapping("/batch/product/{productId}")
    @HasPermission("merchant_product_del")
    public R<Boolean> batchDeleteSkusByProductId(@PathVariable("productId") Long productId) {
        return productSkuService.batchDeleteSkusByProductId(productId);
    }

    /**
     * 扣减库存
     * 【系统内部】订单/库存服务调用
     * @param stockDeductDTO 库存扣减DTO
     * @return 扣减结果
     */
    @Operation(summary = "扣减库存", description = "扣减SKU库存（乐观锁）")
    @SysLog("扣减库存")
    @PutMapping("/stock/deduct")
    @Inner
    public R<Boolean> deductStock(@Valid @RequestBody StockDeductDTO stockDeductDTO) {
        return productSkuService.deductStock(stockDeductDTO.getSkuId(), stockDeductDTO.getQuantity());
    }

    /**
     * 增加库存
     * 【系统内部】订单/库存服务调用
     * @param stockAddDTO 库存增加DTO
     * @return 增加结果
     */
    @Operation(summary = "增加库存", description = "增加SKU库存（乐观锁）")
    @SysLog("增加库存")
    @PutMapping("/stock/add")
    @Inner
    public R<Boolean> addStock(@Valid @RequestBody StockAddDTO stockAddDTO) {
        return productSkuService.addStock(stockAddDTO.getSkuId(), stockAddDTO.getQuantity());
    }

    /**
     * 批量获取SKU
     * 【系统内部】聚合查询使用
     * @param productIds 商品ID列表
     * @return SKU映射
     */
    @Operation(summary = "批量获取SKU", description = "根据商品ID列表批量获取SKU")
    @PostMapping("/batch")
    @Inner
    public R<Map<Long, List<ProductSkuVO>>> batchGetSkusByProductIds(@RequestBody List<Long> productIds) {
        List<ProductSkuVO> skuList = productSkuService.batchGetSkusByProductIds(productIds);
        // 将List转换为Map，按productId分组
        Map<Long, List<ProductSkuVO>> result = skuList.stream()
            .collect(Collectors.groupingBy(ProductSkuVO::getProductId));
        return R.ok(result);
    }

    /**
     * 检查库存
     * 【系统内部】订单/库存服务调用
     * @param skuId SKU ID
     * @param quantity 数量
     * @return 检查结果
     */
    @Operation(summary = "检查库存", description = "检查SKU库存是否充足")
    @GetMapping("/{skuId}/stock/check")
    @Inner
    public R<Boolean> checkStock(@PathVariable("skuId") Long skuId, 
                                 @RequestParam("quantity") Integer quantity) {
        Boolean result = productSkuService.checkStock(skuId, quantity);
        return R.ok(result);
    }

    /**
     * 获取商品价格和库存信息
     * 【系统内部】聚合查询使用
     * @param productId 商品ID
     * @return 价格和库存信息
     */
    @Operation(summary = "获取商品价格库存", description = "获取商品的最低价、最高价和总库存")
    @GetMapping("/product/{productId}/price-stock")
    @Inner
    public R<ProductPriceStockVO> getProductPriceAndStock(@PathVariable("productId") Long productId) {
        ProductPriceStockVO result = productSkuService.getProductPriceAndStock(productId);
        return R.ok(result);
    }



}
