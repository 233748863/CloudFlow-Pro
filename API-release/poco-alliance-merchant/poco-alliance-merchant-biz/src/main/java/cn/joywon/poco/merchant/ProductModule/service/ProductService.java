

package cn.joywon.poco.merchant.ProductModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.ProductModule.dto.ProductCreateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductQueryDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductToggleStatusDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductUpdateDTO;
import cn.joywon.poco.merchant.ProductModule.entity.Product;
import cn.joywon.poco.merchant.ProductModule.vo.ProductListVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import jakarta.validation.Valid;

import java.util.List;

/**
 * 商品服务接口
 *
 * @author poco
 * @date 2024-12-19
 */
public interface ProductService extends IService<Product> {

    /**
     * 创建商品（SPU+SKU）
     * 【商家端】
     * @param productCreateDTO 商品创建DTO
     * @return 创建结果
     */
    R<Long> createProduct(ProductCreateDTO productCreateDTO);

    /**
     * 更新商品（SPU+SKU）
     * 【商家端】
     * @param productUpdateDTO 商品更新DTO
     * @return 更新结果
     */
    R<Boolean> updateProduct(ProductUpdateDTO productUpdateDTO);

    /**
     * 获取商品详情
     * 【商家端】按DataScope权限过滤
     * @param productId 商品ID
     * @return 商品详情
     */
    R<ProductVO> getProductDetail(Long productId);


    /**
     * 分页查询商品列表
     * 【商家端】按DataScope权限过滤
     * @param page 分页参数
     * @param queryDTO 查询条件
     * @return 商品列表
     */
    IPage<ProductListVO> getProductPage(Page<ProductListVO> page, ProductQueryDTO queryDTO);

    /**
     * 分页查询商品列表（消费者）
     * @param page 分页参数
     * @param queryDTO 查询条件
     * @return 商品列表
     */
    IPage<ProductListVO> getConsumerProductPage(Page<ProductListVO> page, ProductQueryDTO queryDTO);

    /**
     * 根据商家ID获取商品列表
     * 【商家端】按DataScope权限过滤
     * @param merchantId 商家ID
     * @return 商品列表
     */
    List<ProductListVO> getProductsByMerchantId(Long merchantId);

    /**
     * 根据分类ID获取商品列表
     * 【消费者端】公开查询场景（如前台分类页）
     * @param categoryId 分类ID
     * @return 商品列表
     */
    List<ProductListVO> getProductsByCategoryId(Long categoryId);

    /**
     * 删除商品
     * 【商家端】
     * @param productId 商品ID
     * @return 删除结果
     */
    R<Boolean> deleteProduct(Long productId);

    /**
     * 批量删除商品
     * 【商家端】
     * @param productIds 商品ID列表
     * @return 删除结果
     */
    R<Boolean> batchDeleteProducts(List<Long> productIds);

    /**
     * 更新商品状态
     * 【商家端】
     * @param productId 商品ID
     * @param status 状态
     * @return 更新结果
     */
    R<Boolean> updateProductStatus(Long productId, String status);

    /**
     * 批量更新商品状态
     * 【商家端】
     * @param productIds 商品ID列表
     * @param status 状态
     * @return 更新结果
     */
    R<Boolean> batchUpdateProductStatus(List<Long> productIds, String status);

    /**
     * 商品上架
     * 【商家端】
     * @param productId 商品ID
     * @return 上架结果
     */
    R<Boolean> publishProduct(Long productId);

    /**
     * 商品下架
     * 【商家端】
     * @param productId 商品ID
     * @return 下架结果
     */
    R<Boolean> unpublishProduct(Long productId);

    /**
     * 商品归档
     * 【商家端】
     * @param productId 商品ID
     * @return 归档结果
     */
    R<Boolean> archiveProduct(Long productId);

    R<Boolean> toggleProductStatus(@Valid ProductToggleStatusDTO input);
}