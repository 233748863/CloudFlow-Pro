package cn.joywon.poco.merchant.MarketingModule.repository;

import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductOnOffShelfDTO;

public interface IPointsMallProductCacheRepository {


    /**
     * 积分商品定时上架商品
     *
     * @param dto 商品上架/下架参数
     */
    boolean pendingOnOrOffShelf(PointsMallProductOnOffShelfDTO dto);


}