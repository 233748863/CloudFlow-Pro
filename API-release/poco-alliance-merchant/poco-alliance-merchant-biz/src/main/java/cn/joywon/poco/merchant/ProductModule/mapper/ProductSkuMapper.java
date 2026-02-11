package cn.joywon.poco.merchant.ProductModule.mapper;


import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ProductModule.bo.MerchantProductGroupBO;
import cn.joywon.poco.merchant.ProductModule.bo.MiniProductIndexShowBO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductDetailPageQueryDTO;
import cn.joywon.poco.merchant.ProductModule.entity.ProductSku;
import cn.joywon.poco.merchant.ProductModule.vo.ProductDetailVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuSimpleInfoVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

/**
 * 商品SKU表
 *
 * @author poco
 * @date 2024-12-21
 */
@Mapper
public interface ProductSkuMapper extends PocoBaseMapper<ProductSku> {

    /**
     * 根据商品ID查询SKU列表
     *
     * @param productId 商品ID
     * @return SKU列表
     */
    List<ProductSkuVO> getSkusByProductId(@Param("productId") Long productId, @Param("dataScope") DataScope dataScope);


    /**
     * 根据SKU ID查询SKU详情
     *
     * @param skuId SKU ID
     * @return SKU详情
     */
    ProductSkuVO getSkuVoById(@Param("skuId") Long skuId, @Param("dataScope") DataScope dataScope);

    /**
     * 批量删除商品的所有SKU
     *
     * @param productId 商品ID
     * @param updateBy  更新人
     * @return 删除数量
     */
    int deleteByProductId(@Param("productId") Long productId, @Param("updateBy") Long updateBy);

    /**
     * 扣减库存（乐观锁）
     *
     * @param skuId    SKU ID
     * @param quantity 扣减数量
     * @param version  版本号
     * @return 更新数量
     */
    int deductStock(@Param("skuId") Long skuId, @Param("quantity") Integer quantity, @Param("version") Integer version);

    /**
     * 增加库存
     *
     * @param skuId    SKU ID
     * @param quantity 增加数量
     * @return 更新数量
     */
    int addStock(@Param("skuId") Long skuId, @Param("quantity") Integer quantity);

    /**
     * 根据商品ID列表批量查询SKU
     *
     * @param productIds 商品ID列表
     * @return SKU列表
     */
    List<ProductSkuVO> getSkusByProductIds(@Param("productIds") List<Long> productIds, @Param("dataScope") DataScope dataScope);

    /**
     * 根据skuID列表批量查询sku简要信息列表
     *
     * @param skuIds skuID列表
     * @return SKU简要信息列表
     */
    List<ProductSkuSimpleInfoVO> getSkuSimpleInfoWithMerchant(@Param("skuIds") Collection<Long> skuIds);

    /**
     * 根据skuID列表批量查询sku简要信息列表
     *
     * @param skuIds skuID列表
     * @return sku简要信息列表
     */
    List<ProductSkuSimpleInfoVO> getSkuSimpleInfoWithCategory(@Param("skuIds") Collection<Long> skuIds);
    
    /**
     * 根据SKU ID列表批量查询SKU详情
     *
     * @param skuIds SKU ID列表
     * @return SKU详情列表
     */
    List<ProductSkuVO> getSkuVoByIds(@Param("skuIds") List<Long> skuIds, @Param("dataScope") DataScope dataScope);

    /**
     * 获取商品详情列表
     *
     * @param dataScope 数据权限
     * @return 商品详情列表
     */
    IPage<ProductDetailVO> getProductDetailPageByDTO(Page page,
                                                    @Param("q") ProductDetailPageQueryDTO q,
                                                    @Param("dataScope") DataScope dataScope);

    /**
     * 获取消费者商品详情列表
     *
     * @param productId 商品ID
     * @return 商品详情列表
     */
    List<ProductDetailVO> getConsumerProductDetailByProductId(@Param("productId") Long productId);

    /**
     * 根据SKU ID查询商家ID
     *
     * @param skuId SKU ID
     * @return 商家ID
     */
    Long getMerchantIdBySkuId(@Param("skuId") Long skuId);

    /**
     * 根据商品ID获取商品总销量
     *
     * @param productId 商品ID
     * @return 总销量
     */
    Integer getSalesCountByProductId(@Param("productId") Long productId);

    /**
     * 根据商家ID列表查询商家商品分组列表
     * 【消费者端】
     *
     * @param merchantIds 商家ID列表
     * @return 商家商品分组列表
     */
    List<MerchantProductGroupBO> queryMerchantProductGroups(@Param("merchantIds") Collection<Long> merchantIds);

     /**
     * 根据商家ID查询商家商品列表
     * 【消费者端】
     *
     * @param merchantId 商家ID
     * @return 商家商品列表
     */
    Page<MiniProductIndexShowBO> getMerchantProducts(@Param("page") Page<Object> page,
                                                     @Param("merchantId") Long merchantId);

}
