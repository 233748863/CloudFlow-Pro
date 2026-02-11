package cn.joywon.poco.merchant.MerchantModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.bo.MerchantSimpleInfoBO;
import cn.joywon.poco.merchant.MerchantModule.bo.MiniMerchantIndexBO;
import cn.joywon.poco.merchant.MerchantModule.bo.QualificationBO;
import cn.joywon.poco.merchant.MerchantModule.dto.*;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.vo.*;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.Collection;
import java.util.List;

public interface IMerchantService extends IService<Merchant> {


    /**
     * 商家入驻申请
     *
     * @param dto 商家入驻申请参数
     * @return 操作结果
     */
    R<?> create(MerchantCreateDTO dto);


    /**
     * 商家信息修改
     *
     * @param dto 商家信息修改参数
     * @return 操作结果
     */
    R<?> infoUpdate(MerchantUpdateDTO dto);


    /**
     * 商家资质信息重新上传
     *
     * @param dto 商家资质信息参数
     * @return 操作结果
     */
    R<?> qualificationUpload(MerchantQualificationDTO dto);


    /**
     * 获取商家列表
     *
     * @param dto 商家列表查询参数
     * @return 查询结果(商家列表分页)
     */
    R<PageQueryVO<MerchantListVO>> getList(MerchantListDTO dto);


    /**
     * 获取商家简要信息(不需要权限)
     *
     * @param merchantId 商家ID
     * @return 商家简要信息
     */
    R<MerchantSimpleInfoVO> getSimpleInfo(Long merchantId);


    /**
     * 商家信息详情
     *
     * @return 商家信息
     */
    R<MerchantInfoVO> getInfo();


    /**
     * 获取商家资质信息
     *
     * @return 商家资质信息
     */
    R<MerchantQualificationVO> getQualification();


    /**
     * 根据商家ID列表获取商家简要信息列表(携带行业信息)
     *
     * @param ids 商家ID列表
     * @return 商家简要信息列表
     */
    List<MerchantSimpleInfoBO> getMerchantSimpleInfoListWithIndustry(Collection<Long> ids);


    /**
     * 根据商家ID列表获取商家简要信息列表
     *
     * @param ids 商家ID列表
     * @return 商家简要信息列表
     */
    List<MerchantSimpleInfoBO> getMerchantSimpleInfoList(Collection<Long> ids);


    /**
     * 根据商家ID获取商家简要信息
     *
     * @param merchantId 商家ID
     * @return 商家简要信息
     */
    MerchantSimpleInfoVO getMerchantSimpleInfo(Long merchantId);


    /**
     * 【消费者端】
     * 获取商家首页信息
     *
     * @param merchantId 商家ID
     * @param longitude  用户地理经度
     * @param latitude   用户地理纬度
     * @return 查询结果(商家首页信息)
     */
    MiniMerchantIndexBO getMerchantIndexInfo(Long merchantId, Double longitude, Double latitude);


    /**
     * 【消费者端】
     * 根据名称查询商家列表
     *
     * @param dto 查询参数
     * @return 查询结果(距离升序商家分页列表)
     */
    PageQueryVO<MiniMerchantListVO> queryMerchantByNameWithDistance(MiniStoreQueryDTO dto);


    /**
     * 【消费者端】
     * 获取商家详细信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家详细信息)
     */
    MiniMerchantInfoVO getMerchantInfo(Long merchantId);


    /**
     * 获取商家资质信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家资质信息)
     */
    QualificationBO getMerchantQualification(Long merchantId);


    /**
     * 获取商家图片
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家图片列表)
     */
    String getMerchantImages(Long merchantId);


    /**
     * 设置平台默认商家信息
     *
     * @return 平台默认商家信息
     */
    MerchantSimpleInfoVO setPlatformMerchantInfo();


    /**
     * 根据行业ID列表和地区ID列表查询商家列表
     *
     * @param regionCodes 地区ID列表
     * @param industryIds 行业ID列表
     * @return 商家简要信息列表
     */
    List<MerchantSimpleInfoBO> queryMerchantByIndustryAndRegions(List<Long> regionCodes, List<Long> industryIds);


    /**
     * 获取联合营销邀请商家列表
     *
     * @param dto 联合营销邀请商家查询参数
     * @return 查询结果(联合营销邀请商家信息列表)
     */
    R<PageQueryVO<MerchantSimpleInfoVO>> listForInviteJointMarketing(MerchantInviteQueryDTO dto);


}