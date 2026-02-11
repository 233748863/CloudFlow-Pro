package cn.joywon.poco.merchant.MerchantModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.CursorQueryVO;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantIndexVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantInfoVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantQualificationVO;

import java.util.List;

public interface IMiniMerchantService {


    /**
     * 查询范围内商家列表
     *
     * @param dto 商家查询参数
     * @return 查询结果(距离升序商家列表)
     */
    R<CursorQueryVO<MiniMerchantListVO>> queryMerchantByRadiusAndIndustry(MiniStoreQueryDTO dto);


    /**
     * 根据名称查询商家列表
     *
     * @param dto 查询参数
     * @return 查询结果(距离升序商家分页列表)
     */
    R<PageQueryVO<MiniMerchantListVO>> queryMerchantByName(MiniStoreQueryDTO dto);


    /**
     * 获取商家首页
     *
     * @param merchantId 商家ID
     * @param longitude  用户地理经度
     * @param latitude   用户地理纬度
     * @return 查询结果(商家首页)
     */
    R<MiniMerchantIndexVO> getMerchantIndex(Long merchantId, Double longitude, Double latitude);


    /**
     * 获取商家详细信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家详细信息)
     */
    R<MiniMerchantInfoVO> getMerchantInfo(Long merchantId);


    /**
     * 获取商家资质信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家资质信息)
     */
    R<MiniMerchantQualificationVO> getMerchantQualification(Long merchantId);


    /**
     * 获取商家图片列表
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家图片列表)
     */
    R<List<String>> getMerchantImages(Long merchantId);


}