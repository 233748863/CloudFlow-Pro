package cn.joywon.poco.merchant.CouponModule.bo;

import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import lombok.Data;

import java.util.Set;

/**
 * 优惠券适用范围业务对象
 * <p>
 * 用于封装优惠券的适用范围信息，包括：
 * - 适用范围类型（全平台/商家/门店）
 * - 适用的商家ID列表
 * - 适用的门店ID列表
 * - 适用的商品SKU ID列表
 * </p>
 * <p>
 * 该对象主要用于购物车下单时，筛选符合优惠券使用条件的商品。
 * </p>
 *
 * @author poco
 * @date 2026-01-27
 */
@Data
public class CouponApplicableScopeBO {

    /**
     * 适用范围类型
     * GLOBAL(全平台), MERCHANT_OWN(商家自身), STORE(门店)
     */
    private CouponTemplateEnum scopeType;

    /**
     * 适用的商家ID列表
     * <p>
     * 为空表示不限商家（全平台券）
     * 不为空表示只能在指定商家使用（商家自有券）
     * </p>
     */
    private Set<Long> applicableMerchantIds;

    /**
     * 适用的门店ID列表
     * <p>
     * 为空表示不限门店
     * 不为空表示只能在指定门店使用（门店券）
     * </p>
     */
    private Set<Long> applicableStoreIds;

    /**
     * 适用的商品SKU ID列表
     * <p>
     * 为空表示不限商品（通用券）
     * 不为空表示只能用于指定商品（商品券）
     * </p>
     * <p>
     * 这是优惠券最细粒度的限制，优先级最高。
     * 例如：奶茶券、手机券等
     * </p>
     */
    private Set<Long> applicableSkuIds;

}
