

package cn.joywon.poco.merchant.ProductModule.feign;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.ProductModule.dto.ProductSkuCreateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductSkuUpdateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.StockAddDTO;
import cn.joywon.poco.merchant.ProductModule.dto.StockDeductDTO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductPriceStockVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 商品SKU Feign接口
 *
 * @author poco
 * @date 2025-01-01
 */
@FeignClient(contextId = "productSkuFeignClient", value = ServiceNameConstants.MERCHANT_SERVICE)
public interface ProductSkuFeignClient {

    /**
     * 根据商品ID获取SKU列表
     *
     * @param productId 商品ID
     * @return SKU列表
     */
    @GetMapping("/product-sku/product/{productId}")
    R<List<ProductSkuVO>> getSkusByProductId(@PathVariable("productId") Long productId);

    /**
     * 根据ID获取SKU详情
     *
     * @param id SKU ID
     * @return SKU详情
     */
    @GetMapping("/product-sku/{id}")
    R<ProductSkuVO> getSkuById(@PathVariable("id") Long id);

    /**
     * 创建SKU
     *
     * @param productSkuCreateDTO SKU创建DTO
     * @return SKU详情
     */
    @PostMapping("/product-sku")
    R<ProductSkuVO> createSku(@RequestBody ProductSkuCreateDTO productSkuCreateDTO);

    /**
     * 更新SKU
     *
     * @param productSkuUpdateDTO SKU更新DTO
     * @return SKU详情
     */
    @PutMapping("/product-sku")
    R<ProductSkuVO> updateSku(@RequestBody ProductSkuUpdateDTO productSkuUpdateDTO);

    /**
     * 删除SKU
     *
     * @param id SKU ID
     * @return 删除结果
     */
    @DeleteMapping("/product-sku/{id}")
    R<Boolean> deleteSku(@PathVariable("id") Long id);

    /**
     * 根据商品ID批量删除SKU
     *
     * @param productId 商品ID
     * @return 删除结果
     */
    @DeleteMapping("/product-sku/product/{productId}")
    R<Boolean> batchDeleteSkusByProductId(@PathVariable("productId") Long productId);

    /**
     * 扣减库存
     *
     * @param stockDeductDTO 库存扣减DTO
     * @return 扣减结果
     */
    @PostMapping("/product-sku/stock/deduct")
    R<Boolean> deductStock(@RequestBody StockDeductDTO stockDeductDTO);

    /**
     * 增加库存
     *
     * @param stockAddDTO 库存增加DTO
     * @return 增加结果
     */
    @PostMapping("/product-sku/stock/add")
    R<Boolean> addStock(@RequestBody StockAddDTO stockAddDTO);

    /**
     * 批量获取SKU
     *
     * @param productIds 商品ID列表
     * @return SKU列表
     */
    @PostMapping("/product-sku/batch")
    R<List<ProductSkuVO>> batchGetSkusByProductIds(@RequestBody List<Long> productIds);

    /**
     * 检查库存
     *
     * @param skuId    SKU ID
     * @param quantity 数量
     * @return 检查结果
     */
    @GetMapping("/product-sku/{skuId}/stock/check")
    R<Boolean> checkStock(@PathVariable("skuId") Long skuId, @RequestParam("quantity") Integer quantity);

    /**
     * 获取商品价格和库存信息
     *
     * @param productId 商品ID
     * @return 价格和库存信息
     */
    @GetMapping("/product-sku/product/{productId}/price-stock")
    R<ProductPriceStockVO> getProductPriceAndStock(@PathVariable("productId") Long productId);
}