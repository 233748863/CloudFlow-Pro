package cn.joywon.poco.merchant.MerchantModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.UserClaimableQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.bo.QualificationBO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreCacheBO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreMerchantIndustryBO;
import cn.joywon.poco.merchant.MerchantModule.dto.*;
import cn.joywon.poco.merchant.MerchantModule.entity.Store;
import cn.joywon.poco.merchant.MerchantModule.vo.*;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.Collection;
import java.util.List;

public interface IStoreService extends IService<Store> {


    /**
     * 创建门店
     *
     * @param dto 门店创建参数
     * @return 操作结果
     */
    R<?> create(StoreCreateDTO dto);


    /**
     * 删除门店
     *
     * @param storeId 门店ID
     * @param reason  删除原因
     * @return 操作结果
     */
    R<?> delete(Long storeId, String reason);


    /**
     * 修改门店信息
     *
     * @param dto 门店修改参数
     * @return 操作结果
     */
    R<?> updateInfo(StoreInfoUpdateDTO dto);


    /**
     * 修改门店资质信息
     *
     * @param dto 门店资质信息修改参数
     * @return 操作结果
     */
    R<?> updateQualification(StoreQualificationDTO dto);


    /**
     * 修改门店营业状态
     *
     * @param dto 营业状态修改参数
     * @return 响应结果
     */
    R<?> updateBusinessStatus(StoreBizStatusDTO dto);


    /**
     * 重建门店缓存
     *
     * @return 响应结果
     */
    R<?> rebuildStoreCache();


    /**
     * 根据门店ID列表获取门店简要信息列表
     *
     * @param storeIds 门店ID列表
     * @return 门店简要信息列表
     */
    List<StoreSimpleInfoVO> getStoreSimpleInfo(Collection<?> storeIds);


    /**
     * 商家获取门店列表
     *
     * @param dto 商家门店列表查询参数
     * @return 响应结果
     */
    R<PageQueryVO<StoreListVO>> getListByMerchant(MerchantStoreListDTO dto);


    /**
     * 获取门店信息
     *
     * @param storeId 门店ID
     * @return 查询结果
     */
    R<StoreInfoVO> getInfo(Long storeId);


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 查询结果
     */
    R<StoreQualificationVO> getQualification(Long storeId);


    /**
     * 根据区域编码和行业分类ID查询符合条件的门店商家行业关系列表
     *
     * @param regionCode 区域编码
     * @param industryId 行业分类ID
     * @return 查询结果(符合条件的门店商家行业关系列表)
     */
    Page<StoreMerchantIndustryBO> queryStoresByRegionCodeAndIndustry(Page<?> page, Long regionCode, Long industryId);


    /**
     * 【消费者端】
     * 查询范围内门店列表
     *
     * @param dto 门店查询参数
     * @return 查询结果(距离升序门店列表)
     */
    Page<StoreCacheDTO> queryNearbyStores(UserClaimableQueryDTO dto);


    /**
     * 【消费者端】
     * 根据范围和行业查询范围内门店列表
     *
     * @param dto 门店查询参数
     * @return 查询结果(距离升序门店列表)
     */
    Page<StoreCacheBO> queryStoreByRadiusAndIndustry(MiniStoreQueryDTO dto);


    /**
     * 【消费者端】
     * 获取门店图片列表
     *
     * @param storeId 门店ID
     * @param allShow 是否展示所有图片
     * @return 查询结果(门店图片列表)
     */
    String getStoreImages(Long storeId, Boolean allShow);


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 查询结果(门店资质信息)
     */
    QualificationBO getStoreQualification(Long storeId);


    /**
     * 【消费者端】
     * 查询商家下距离升序门店列表
     *
     * @param merchantId 商家ID
     * @param longitude  经度
     * @param latitude   纬度
     * @return 查询结果(距离升序门店列表)
     */
    List<MiniStoreListVO> queryStoreListByMerchantId(Long merchantId, Double longitude, Double latitude);


    /**
     * 【消费者端】
     * 获取门店首页信息
     *
     * @param storeId   门店ID
     * @param longitude 经度
     * @param latitude  纬度
     * @return 响应结果
     */
    MiniStoreIndexVO getStoreIndex(Long storeId, Double longitude, Double latitude);


    /**
     * 【平台端】
     * 查询门店列表
     *
     * @param dto 查询参数
     * @return 查询结果(门店列表)
     */
    R<PageQueryVO<StoreListVO>> queryStoreList(StoreListDTO dto);


}