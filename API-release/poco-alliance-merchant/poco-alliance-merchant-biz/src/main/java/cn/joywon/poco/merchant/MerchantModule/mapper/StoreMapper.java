package cn.joywon.poco.merchant.MerchantModule.mapper;

import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.merchant.CouponModule.dto.UserClaimableQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.bo.QualificationBO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreCacheBO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreMerchantIndustryBO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantStoreListDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreCacheDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreListDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.Store;
import cn.joywon.poco.merchant.MerchantModule.vo.*;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.base.MPJBaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

@Mapper
public interface StoreMapper extends MPJBaseMapper<Store> {


    /**
     * 获取门店列表
     *
     * @param dto       门店查询参数
     * @param dataScope 数据权限
     * @return 门店列表
     */
    IPage<StoreListVO> getStoreList(@Param("page") Page<StoreListVO> page,
                                    @Param("dto") MerchantStoreListDTO dto,
                                    @Param("dataScope") DataScope dataScope);


    /**
     * 根据门店ID列表获取门店简要信息列表
     *
     * @param storeIds 门店ID列表
     * @return 门店简要信息列表
     */
    List<StoreSimpleInfoVO> getStoreSimpleInfo(@Param("storeIds") Collection<?> storeIds);


    /**
     * 根据区域编码和行业分类ID查询符合条件的门店商家行业关系列表
     *
     * @param regionCode 区域编码
     * @param industryId 行业分类ID
     * @return 门店商家行业关系列表
     */
    Page<StoreMerchantIndustryBO> queryStoresByRegionCodeAndIndustry(@Param("page") Page<?> page,
                                                                     @Param("regionCode") Long regionCode,
                                                                     @Param("industryId") Long industryId);


    /**
     * 【消费者端】
     * 查询范围内门店列表
     *
     * @param dto 门店查询参数
     * @return 查询结果(距离升序门店列表)
     */
    Page<StoreCacheDTO> queryNearbyStores(@Param("page") Page<StoreCacheDTO> page,
                                          @Param("dto") UserClaimableQueryDTO dto);


    /**
     * 【消费者端】
     * 根据范围和行业查询范围内门店列表
     *
     * @param dto 门店查询参数
     * @return 距离升序门店列表
     */
    Page<StoreCacheBO> queryStoreByRadiusAndIndustry(@Param("page") Page<MiniMerchantListVO> page,
                                                     @Param("dto") MiniStoreQueryDTO dto);


    /**
     * 【消费者端】
     * 获取门店图片列表
     *
     * @param storeId 门店ID
     * @param allShow 是否展示所有图片
     * @return 查询结果(门店图片列表)
     */
    String getStoreImages(@Param("storeId") Long storeId, @Param("allShow") Boolean allShow);


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 查询结果(门店资质信息)
     */
    QualificationBO getStoreQualification(@Param("storeId") Long storeId);


    /**
     * 【消费者端】
     * 查询商家下距离升序门店列表
     *
     * @param merchantId 商家ID
     * @param longitude  经度
     * @param latitude   纬度
     * @return 查询结果(距离升序门店列表)
     */
    List<MiniStoreListVO> queryStoreListByMerchantId(@Param("merchantId") Long merchantId,
                                                     @Param("longitude") Double longitude,
                                                     @Param("latitude") Double latitude);


    /**
     * 【消费者端】
     * 获取门店首页信息
     *
     * @param storeId   门店ID
     * @param longitude 经度
     * @param latitude  纬度
     * @return 查询结果(门店首页信息)
     */
    MiniStoreIndexVO getStoreIndex(@Param("storeId") Long storeId,
                                   @Param("longitude") Double longitude,
                                   @Param("latitude") Double latitude);


    /**
     * 【平台端】
     * 为重建门店缓存获取门店分页列表
     *
     * @return 门店分页列表
     */
    List<StoreCacheBO> queryAllStoreForRebuildCacheWithPage(@Param("current") long current,
                                                            @Param("pageSize") long pageSize);


    /**
     * 根据门店ID获取门店
     *
     * @param storeId   门店ID
     * @param dataScope 数据权限
     * @return 门店信息
     */
    Store getStoreById(@Param("storeId") Long storeId, @Param("dataScope") DataScope dataScope);


    /**
     * 【平台端】
     * 获取门店列表
     *
     * @param dto 门店查询参数
     * @return 门店列表
     */
    IPage<StoreListVO> queryStoreList(@Param("page") Page<StoreListVO> page, @Param("dto") StoreListDTO dto);


}