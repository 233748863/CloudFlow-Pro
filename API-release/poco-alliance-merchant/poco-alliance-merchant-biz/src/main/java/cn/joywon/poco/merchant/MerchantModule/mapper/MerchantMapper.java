package cn.joywon.poco.merchant.MerchantModule.mapper;

import cn.joywon.poco.merchant.MerchantModule.bo.MerchantSimpleInfoBO;
import cn.joywon.poco.merchant.MerchantModule.bo.MiniMerchantIndexBO;
import cn.joywon.poco.merchant.MerchantModule.bo.QualificationBO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantInviteQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantListDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantSimpleInfoVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantInfoVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantListVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.base.MPJBaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

@Mapper
public interface MerchantMapper extends MPJBaseMapper<Merchant> {


    /**
     * 获取商家列表
     *
     * @param page 分页参数
     * @param dto  商家列表查询参数
     * @return 商家列表
     */
    Page<MerchantListVO> getList(@Param("page") Page<MerchantListVO> page,
                                 @Param("dto") MerchantListDTO dto);


    /**
     * 根据商家ID列表获取商家简要信息列表(携带行业信息)
     *
     * @param ids 商家ID列表
     * @return 商家简要信息列表
     */
    List<MerchantSimpleInfoBO> getMerchantSimpleInfoListWithIndustry(@Param("ids") Collection<Long> ids);


    /**
     * 根据商家ID列表获取商家简要信息列表
     *
     * @param ids 商家ID列表
     * @return 商家简要信息列表
     */
    List<MerchantSimpleInfoBO> getMerchantSimpleInfoList(@Param("ids") Collection<Long> ids);


    /**
     * 根据商家ID获取商家简要信息
     *
     * @param merchantId 商家ID
     * @return 商家简要信息
     */
    MerchantSimpleInfoVO getMerchantSimpleInfo(@Param("merchantId") Long merchantId);


    /**
     * 【消费者端】
     * 获取商家首页信息
     *
     * @param merchantId 商家ID
     * @return 商家首页信息
     */
    MiniMerchantIndexBO getMerchantIndexInfo(@Param("merchantId") Long merchantId,
                                             @Param("longitude") Double longitude,
                                             @Param("latitude") Double latitude);


    /**
     * 【消费者端】
     * 根据名称查询商家列表
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 距离升序商家分页列表
     */
    Page<MiniMerchantListVO> queryMerchantByNameWithDistance(@Param("page") Page<MiniMerchantListVO> page,
                                                             @Param("dto") MiniStoreQueryDTO dto);


    /**
     * 【消费者端】
     * 获取商家详细信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家详细信息)
     */
    MiniMerchantInfoVO getMerchantInfo(@Param("merchantId") Long merchantId);


    /**
     * 根据商家ID获取商家资质信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家资质信息)
     */
    QualificationBO getMerchantQualification(@Param("merchantId") Long merchantId);


    /**
     * 根据商家ID获取商家图片列表
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家图片列表)
     */
    String getMerchantImages(@Param("merchantId") Long merchantId);


    /**
     * 根据行业ID列表和地区ID列表查询商家列表
     *
     * @param regionCodes 地区ID列表
     * @param industryIds 行业ID列表
     * @return 商家简要信息列表
     */
    List<MerchantSimpleInfoBO> queryMerchantByIndustryAndRegions(@Param("regionCodes") List<Long> regionCodes,
                                                                 @Param("industryIds") List<Long> industryIds);


    /**
     * 获取联合营销邀请商家列表
     *
     * @param dto 联合营销邀请商家查询参数
     * @return 联合营销邀请商家信息列表
     */
    Page<MerchantSimpleInfoVO> listForInviteJointMarketing(@Param("page") Page<MerchantSimpleInfoVO> page,
                                                           @Param("dto") MerchantInviteQueryDTO dto);


}