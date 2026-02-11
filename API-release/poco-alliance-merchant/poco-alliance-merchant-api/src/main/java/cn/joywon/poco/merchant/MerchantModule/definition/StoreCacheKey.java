package cn.joywon.poco.merchant.MerchantModule.definition;

/**
 * 门店/商家功能缓存键定义
 */
public interface StoreCacheKey {

    /**
     * 门店门店位置缓存键
     */
    String KEY_STORE_GEO = "store:geo";

    /**
     * 门店缓存键(顶层KEY)
     */
    String KEY_STORE_HASH = "store:hash";

    /**
     * 门店行业位置缓存键前缀
     */
    String KEY_PREFIX_STORE_GEO_INDUSTRY = "store:geo:industry:";

}