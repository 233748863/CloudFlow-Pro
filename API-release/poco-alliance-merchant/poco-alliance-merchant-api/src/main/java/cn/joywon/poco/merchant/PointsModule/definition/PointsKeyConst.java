package cn.joywon.poco.merchant.PointsModule.definition;

public interface PointsKeyConst {


    /**
     * 积分批次 Redis 锁 key 前缀
     */
    String LOCK_KEY_PREFIX_POINTS_BATCH = "points:lock:batch:";


    /**
     * 积分账户 Redis 锁 key 前缀
     */
    String LOCK_KEY_PREFIX_POINTS_ACCOUNT = "points:lock:account:";


}