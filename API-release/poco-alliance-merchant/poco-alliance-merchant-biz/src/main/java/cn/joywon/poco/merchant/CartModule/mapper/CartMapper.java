package cn.joywon.poco.merchant.CartModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.CartModule.entity.CartItem;
import cn.joywon.poco.merchant.CartModule.vo.CartItemVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 购物车Mapper
 *
 * @author poco
 * @date 2024-12-25
 */
@Mapper
public interface CartMapper extends PocoBaseMapper<CartItem> {

    /**
     * 根据用户ID和SKU ID查询购物车项
     *
     * @param userId 用户ID
     * @param skuId  SKU ID
     * @return 购物车项
     */
    CartItem getByUserIdAndSkuId(@Param("userId") Long userId, @Param("skuId") Long skuId);

    /**
     * 根据用户ID获取购物车列表（包含商品和SKU信息）
     *
     * @param userId 用户ID
     * @return 购物车列表
     */
    List<CartItemVO> getCartListByUserId(@Param("userId") Long userId);

    /**
     * 物理删除购物车项
     *
     * @param id 购物车项ID
     * @return 影响行数
     */
    int physicalDeleteById(@Param("id") Long id);

    /**
     * 批量物理删除购物车项
     *
     * @param userId 用户ID
     * @param ids    购物车项ID列表
     * @return 影响行数
     */
    int physicalDeleteBatchIds(@Param("userId") Long userId, @Param("ids") List<Long> ids);

    /**
     * 物理清空用户购物车
     *
     * @param userId 用户ID
     * @return 影响行数
     */
    int physicalDeleteByUserId(@Param("userId") Long userId);
}
