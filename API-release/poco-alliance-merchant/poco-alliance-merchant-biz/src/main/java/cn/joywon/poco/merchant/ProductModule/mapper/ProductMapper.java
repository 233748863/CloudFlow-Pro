
package cn.joywon.poco.merchant.ProductModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ProductModule.dto.ProductQueryDTO;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.merchant.ProductModule.entity.Product;
import cn.joywon.poco.merchant.ProductModule.vo.ProductListVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 商品主表(SPU)
 *
 * @author poco
 * @date 2024-12-21
 */
@Mapper
public interface ProductMapper extends PocoBaseMapper<Product> {

    /**
     * 分页查询商品列表
     *
     * @param page  分页参数
     * @param query 查询条件
     * @return 商品列表分页数据
     */
    IPage<ProductListVO> getProductListPage(Page page, @Param("query") ProductQueryDTO query, @Param("dataScope") DataScope dataScope);

    /**
     * 根据ID查询商品详情
     *
     * @param productId 商品ID
     * @return 商品详情
     */
    ProductVO getProductVoById(@Param("productId") Long productId, @Param("dataScope") DataScope dataScope);

    /**
     * 根据商家ID查询商品列表
     *
     * @param merchantId 商家ID
     * @param status     商品状态
     * @return 商品列表
     */
    List<ProductListVO> getProductsByMerchantId(@Param("merchantId") Long merchantId, @Param("status") String status, @Param("dataScope") DataScope dataScope);

    /**
     * 根据分类ID查询商品列表
     *
     * @param categoryId 分类ID
     * @param status     商品状态
     * @return 商品列表
     */
    List<ProductListVO> getProductsByCategoryId(@Param("categoryId") Long categoryId, @Param("status") String status, @Param("dataScope") DataScope dataScope);

    /**
     * 批量更新商品状态
     *
     * @param productIds 商品ID列表
     * @param status     目标状态
     * @param updateBy   更新人
     * @return 更新数量
     */
    int batchUpdateStatus(@Param("productIds") List<Long> productIds, @Param("status") String status, @Param("updateBy") Long updateBy);
}