package cn.joywon.poco.merchant.MerchantModule.repository;

import cn.joywon.poco.merchant.Common.page.CursorQueryDTO;
import cn.joywon.poco.merchant.Common.page.CursorQueryVO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreCacheBO;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreCacheDTO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantListVO;

import java.util.List;

public interface IStoreCacheRepository {


    /**
     * 添加/更新门店缓存
     *
     * @param dto 门店缓存数据模型
     */
    void upsert(StoreCacheDTO dto);


    /**
     * 批量添加/更新门店缓存
     *
     * @param stores 门店缓存数据模型列表
     */
    void upsertBatchStore(List<StoreCacheBO> stores);


    /**
     * 删除门店缓存
     *
     * @param id         门店ID
     * @param industryId 行业ID
     */
    void deleteById(String id, String industryId);


    /**
     * 删除所有门店缓存
     */
    void dropAllStoreCache();


    /**
     * 根据地理位置获取范围内门店列表
     *
     * @param dto 查询参数
     * @return 门店缓存分页列表
     */
    MiniMerchantListVO getStoreListByRadius(MiniStoreQueryDTO dto);


    CursorQueryVO<StoreCacheDTO> queryNearbyStores(CursorQueryDTO dto, Long industryId);


    /**
     * 查询范围内行业过滤门店列表缓存
     *
     * @param dto 查询参数
     * @return 查询结果(距离升序门店列表缓存)
     */
    CursorQueryVO<MiniMerchantListVO> queryStoreByRadiusAndIndustry(MiniStoreQueryDTO dto);


    /**
     * 根据门店ID获取门店缓存
     *
     * @param storeId 门店ID
     * @return 门店缓存
     */
    StoreCacheDTO getStoreById(String storeId);


}