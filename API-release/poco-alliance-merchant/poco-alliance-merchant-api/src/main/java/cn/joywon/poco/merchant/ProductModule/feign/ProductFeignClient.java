
package cn.joywon.poco.merchant.ProductModule.feign;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCreateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductQueryDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductUpdateDTO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductListVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

/**
 * 商品Feign接口
 *
 * @author poco
 * @date 2025-01-01
 */
@FeignClient(contextId = "productFeignClient", value = ServiceNameConstants.MERCHANT_SERVICE)
public interface ProductFeignClient {

    /**
     * 创建商品
     *
     * @param productCreateDTO 商品创建DTO
     * @return 商品VO
     */
    @PostMapping("/product")
    R<ProductVO> createProduct(@RequestBody ProductCreateDTO productCreateDTO);

    /**
     * 更新商品
     *
     * @param productUpdateDTO 商品更新DTO
     * @return 商品VO
     */
    @PutMapping("/product")
    R<ProductVO> updateProduct(@RequestBody ProductUpdateDTO productUpdateDTO);

    /**
     * 根据ID获取商品详情
     *
     * @param id 商品ID
     * @return 商品VO
     */
    @GetMapping("/product/{id}")
    R<ProductVO> getProductById(@PathVariable("id") Long id);

    /**
     * 分页查询商品列表
     *
     * @param productQueryDTO 商品查询DTO
     * @return 商品列表分页数据
     */
    @GetMapping("/product/page")
    R<Page<ProductListVO>> getProductPage(ProductQueryDTO productQueryDTO);

    /**
     * 删除商品
     *
     * @param id 商品ID
     * @return 删除结果
     */
    @DeleteMapping("/product/{id}")
    R<Boolean> deleteProduct(@PathVariable("id") Long id);

    /**
     * 批量删除商品
     *
     * @param ids 商品ID列表
     * @return 删除结果
     */
    @DeleteMapping("/product/batch")
    R<Boolean> batchDeleteProducts(@RequestBody Long[] ids);

    /**
     * 更新商品状态
     *
     * @param id     商品ID
     * @param status 商品状态
     * @return 更新结果
     */
    @PutMapping("/product/{id}/status")
    R<Boolean> updateProductStatus(@PathVariable("id") Long id, @RequestParam("status") String status);

    /**
     * 根据商家ID获取商品列表
     *
     * @param merchantId 商家ID
     * @return 商品列表
     */
    @GetMapping("/product/merchant/{merchantId}")
    R<Page<ProductListVO>> getProductsByMerchantId(@PathVariable("merchantId") Long merchantId,
                                                   @RequestParam(value = "current", defaultValue = "1") Integer current,
                                                   @RequestParam(value = "size", defaultValue = "10") Integer size);

    /**
     * 根据分类ID获取商品列表
     *
     * @param categoryId 分类ID
     * @return 商品列表
     */
    @GetMapping("/product/category/{categoryId}")
    R<Page<ProductListVO>> getProductsByCategoryId(@PathVariable("categoryId") Long categoryId,
                                                   @RequestParam(value = "current", defaultValue = "1") Integer current,
                                                   @RequestParam(value = "size", defaultValue = "10") Integer size);
}