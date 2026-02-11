package cn.joywon.poco.merchant.MarketingModule.definition;

/**
 * 积分商城商品分类缓存键定义
 */
public interface PointsMallCacheKey {

    /**
     * 积分商城商品分类父级缓存键
     */
    String CATEGORY_PARENT_CACHE_KEY = "points_mall:category:parent";

    /**
     * 积分商城商品分类子级缓存键
     */
    String CATEGORY_TREE_CACHE_KEY = "points_mall:category:tree";


    /**
     * 积分商城商品分布式锁缓存键前缀
     */
    String LOCK_KEY_PREFIX_PRODUCT = "points_mall:product:lock:";

    /**
     * 积分商城商品上架缓存键前缀
     */
    String KEY_PREFIX_PRODUCT_ON_SHELF = "points_mall:product:on_shelf:";

    /**
     * 积分商城商品下架缓存键前缀
     */
    String KEY_PREFIX_PRODUCT_OFF_SHELF = "points_mall:product:off_shelf:";

    /**
     * 积分商城商品库存缓存键前缀
     */
    String KEY_PREFIX_PRODUCT_STOCK = "points_mall:product:stock:";

}