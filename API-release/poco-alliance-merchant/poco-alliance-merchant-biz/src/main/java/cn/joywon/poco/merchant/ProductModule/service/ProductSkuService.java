package cn.joywon.poco.merchant.ProductModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.ProductModule.bo.MerchantProductGroupBO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductDetailPageQueryDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductSkuCreateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductSkuUpdateDTO;
import cn.joywon.poco.merchant.ProductModule.entity.ProductSku;
import cn.joywon.poco.merchant.ProductModule.vo.*;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;

/**
 * 商品SKU服务接口
 *
 * @author poco
 * @date 2024-12-19
 */
public interface ProductSkuService extends IService<ProductSku> {

    /**
     * 根据商品ID获取SKU列表
     * 【商家端】按DataScope权限过滤
     *
     * @param productId 商品ID
     * @return SKU列表
     */
    List<ProductSkuVO> getSkusByProductId(Long productId);


    /**
     * 获取SKU详情
     * 【商家端】按DataScope权限过滤
     *
     * @param skuId SKU ID
     * @return SKU详情
     */
    R<ProductSkuVO> getSkuDetail(Long skuId);

    /**
     * 创建SKU
     * 【商家端】
     *
     * @param skuCreateDTO SKU创建DTO
     * @return 创建结果
     */
    R<Long> createSku(ProductSkuCreateDTO skuCreateDTO);

    /**
     * 更新SKU
     * 【商家端】
     *
     * @param skuUpdateDTO SKU更新DTO
     * @return 更新结果
     */
    R<Boolean> updateSku(ProductSkuUpdateDTO skuUpdateDTO);

    /**
     * 删除SKU
     * 【商家端】
     *
     * @param skuId SKU ID
     * @return 删除结果
     */
    R<Boolean> deleteSku(Long skuId);

    /**
     * 批量删除SKU（根据商品ID）
     * 【商家端】
     *
     * @param productId 商品ID
     * @return 删除结果
     */
    R<Boolean> batchDeleteSkusByProductId(Long productId);

    /**
     * 扣减库存（乐观锁）
     * 【系统内部】订单/库存服务调用
     *
     * @param skuId    SKU ID
     * @param quantity 扣减数量
     * @return 扣减结果
     */
    R<Boolean> deductStock(Long skuId, Integer quantity);

    /**
     * 增加库存（乐观锁）
     * 【系统内部】订单/库存服务调用
     *
     * @param skuId    SKU ID
     * @param quantity 增加数量
     * @return 增加结果
     */
    R<Boolean> addStock(Long skuId, Integer quantity);

    /**
     * 批量获取SKU信息
     * 【系统内部】聚合查询使用
     *
     * @param productIds 商品ID列表
     * @return SKU列表
     */
    List<ProductSkuVO> batchGetSkusByProductIds(List<Long> productIds);

    /**
     * 检查SKU库存是否充足
     * 【系统内部】订单/库存服务调用
     *
     * @param skuId    SKU ID
     * @param quantity 需要数量
     * @return 是否充足
     */
    Boolean checkStock(Long skuId, Integer quantity);

    /**
     * 获取SKU最低价格
     * 【系统内部】聚合查询使用
     *
     * @param productId 商品ID
     * @return 最低价格
     */
    BigDecimal getMinPriceByProductId(Long productId);

    /**
     * 获取SKU最高价格
     * 【系统内部】聚合查询使用
     *
     * @param productId 商品ID
     * @return 最高价格
     */
    BigDecimal getMaxPriceByProductId(Long productId);

    /**
     * 获取商品价格和库存信息
     * 【系统内部】聚合查询使用
     *
     * @param productId 商品ID
     * @return 价格库存信息
     */
    ProductPriceStockVO getProductPriceAndStock(Long productId);

    /**
     * 根据商品ID获取总库存
     * 【系统内部】聚合查询使用
     *
     * @param productId 商品ID
     * @return 总库存
     */
    Integer getTotalStockByProductId(Long productId);

    /**
     * 获取SKU价格信息
     *
     * @param skuIds SKU ID列表
     * @return sku价格信息列表
     */
    List<ProductSkuSimpleInfoVO> getSkuSimpleInfoWithMerchant(Collection<Long> skuIds);

    /**
     * 根据skuID列表获取sku简要信息列表
     *
     * @return sku简要信息列表
     */
    List<ProductSkuSimpleInfoVO> getSkuSimpleInfoWithCategory(Collection<Long> skuIds);

    /**
     * 批量获取SKU详情
     * 【商家端】按DataScope权限过滤
     *
     * @param skuIds SKU ID列表
     * @return SKU详情列表
     */
    List<ProductSkuVO> batchGetSkuDetails(List<Long> skuIds);

    /**
     * 分页查询商品与SKU详情（使用DTO，多条件筛选）
     * 【商家端】按DataScope权限过滤
     *
     * @param productDetailPageQueryDTO 分页与筛选条件
     * @return 分页数据
     */
    IPage<ProductDetailVO> getProductDetailPage(ProductDetailPageQueryDTO productDetailPageQueryDTO);

    /**
     * 获取消费者商品详情（聚合）
     *
     * @param productId 商品ID
     * @return 商品详情（聚合）
     */
    ConsumerProductDetailVO getConsumerProductDetailByProductId(Long productId);

    /**
     * 根据商家ID列表查询商家商品分组列表
     * 【消费者端】
     *
     * @param merchantIds 商家ID列表
     * @return 商家商品分组列表
     */
    List<MerchantProductGroupBO> queryMerchantProductGroups(Collection<Long> merchantIds);


    /**
     * 根据商家ID查询商家商品列表
     * 【消费者端】
     *
     * @param merchantId 商家ID
     * @return 商家商品列表
     */
    Page<MiniProductIndexShowVO> getMerchantProducts(Page<Object> page, Long merchantId);

}
