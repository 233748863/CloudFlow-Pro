package cn.joywon.poco.merchant.MerchantModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreIndexVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreQualificationVO;

import java.util.List;

public interface IMiniStoreService {


    /**
     * 查询商家下的门店列表
     *
     * @param merchantId 商家ID
     * @param longitude  用户地理经度
     * @param latitude   用户地理纬度
     * @return 查询结果(门店列表)
     */
    R<List<MiniStoreListVO>> queryStoreListByMerchantId(Long merchantId, Double longitude, Double latitude);


    /**
     * 用户获取范围内门店列表
     *
     * @param dto 门店查询参数
     * @return 查询结果(门店缓存分页列表)
     */
    R<MiniMerchantListVO> getStoreListByRadius(MiniStoreQueryDTO dto);


    /**
     * 获取门店首页详情
     *
     * @param storeId   门店ID
     * @param longitude 经度
     * @param latitude  纬度
     * @return 查询结果(门店首页详情)
     */
    R<MiniStoreIndexVO> getStoreIndex(Long storeId, Double longitude, Double latitude);


    /**
     * 获取门店图片列表
     *
     * @param storeId 门店ID
     * @param allShow 是否展示所有图片
     * @return 查询结果(门店图片列表)
     */
    R<List<String>> getStoreImages(Long storeId, Boolean allShow);


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 查询结果(门店资质信息)
     */
    R<MiniStoreQualificationVO> getStoreQualification(Long storeId);


}