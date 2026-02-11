package cn.joywon.poco.merchant.CartModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.CartModule.dto.CartAddDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartBatchDeleteDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartSkuUpdateDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartUpdateDTO;
import cn.joywon.poco.merchant.CartModule.entity.CartItem;
import cn.joywon.poco.merchant.CartModule.vo.CartGroupVO;
import cn.joywon.poco.merchant.CartModule.vo.CartOperationResultVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

/**
 * 购物车服务接口
 *
 * @author poco
 * @date 2024-12-25
 */
public interface CartService extends IService<CartItem> {

    /**
     * 添加购物车
     *
     * @param cartAddDTO 添加购物车DTO
     * @return 操作结果（包含购物车统计）
     */
    R<CartOperationResultVO> addCart(CartAddDTO cartAddDTO);

    /**
     * 获取购物车列表（按商家分组）
     *
     * @return 购物车列表
     */
    R<List<CartGroupVO>> getCartList();

    /**
     * 更新购物车数量
     *
     * @param cartUpdateDTO 更新购物车DTO
     * @return 操作结果（包含购物车统计）
     */
    R<CartOperationResultVO> updateCart(CartUpdateDTO cartUpdateDTO);

    /**
     * 更新购物车商品SKU
     *
     * @param cartSkuUpdateDTO 购物车SKU更新DTO
     * @return 操作结果（包含购物车统计）
     */
    R<CartOperationResultVO> updateCartSku(CartSkuUpdateDTO cartSkuUpdateDTO);

    /**
     * 删除购物车项
     *
     * @param id 购物车项ID
     * @return 操作结果（包含购物车统计）
     */
    R<CartOperationResultVO> deleteCart(Long id);

    /**
     * 批量删除购物车项
     *
     * @param cartBatchDeleteDTO 批量删除DTO
     * @return 操作结果（包含购物车统计）
     */
    R<CartOperationResultVO> batchDeleteCart(CartBatchDeleteDTO cartBatchDeleteDTO);

    /**
     * 清空购物车
     *
     * @return 操作结果（包含购物车统计）
     */
    R<CartOperationResultVO> clearCart();
}
