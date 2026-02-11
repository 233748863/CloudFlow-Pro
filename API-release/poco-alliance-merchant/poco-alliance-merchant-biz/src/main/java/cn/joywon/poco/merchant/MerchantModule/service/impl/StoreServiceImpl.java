package cn.joywon.poco.merchant.MerchantModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.admin.api.feign.RemoteAreaService;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.UserClaimableQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.bo.QualificationBO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreCacheBO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreMerchantIndustryBO;
import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.dto.*;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.entity.MerchantAudit;
import cn.joywon.poco.merchant.MerchantModule.entity.Store;
import cn.joywon.poco.merchant.MerchantModule.entity.StoreAudit;
import cn.joywon.poco.merchant.MerchantModule.mapper.StoreMapper;
import cn.joywon.poco.merchant.MerchantModule.repository.IStoreCacheRepository;
import cn.joywon.poco.merchant.MerchantModule.service.IStoreService;
import cn.joywon.poco.merchant.MerchantModule.vo.*;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.PlatformModule.entity.Industry;
import cn.joywon.poco.merchant.PlatformModule.service.LbsParseService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.math.NumberUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

import static cn.joywon.poco.merchant.MerchantModule.util.StoreInfoReplace.withinBusinessHours;


@Slf4j
@Service
@RequiredArgsConstructor
public class StoreServiceImpl extends ServiceImpl<StoreMapper, Store> implements IStoreService {

    private final RemoteAreaService remoteAreaService;

    private final LbsParseService lbsParseService;
    private final IStoreCacheRepository storeCacheRepository;

    private final StoreMapper storeMapper;


    /**
     * 创建门店
     *
     * @param dto 门店创建参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> create(StoreCreateDTO dto) {
        Long merchantId = dto.getMerchantId() == null ? getCurrentMerchantId() : Long.valueOf(dto.getMerchantId());

        /* step-1 检查门店名称是否重复 */
        Store store = lambdaQuery().eq(Store::getName, dto.getName()).last("LIMIT 1").one();
        if (store != null) {
            return R.failed("创建门店提交失败, 已存在名称相同门店");
        }

        /* step-2 检查商家状态 */
        // 检查商家是否存在;
        Merchant merchant = Db.getById(merchantId, Merchant.class);
        if (merchant == null || !merchant.getEnable()) {
            return R.failed("创建门店提交失败, 商家不存在或已被禁用");
        }
        // 检查商家是否通过审核
        MerchantAudit merchantAudit = Db.getById(merchant.getAuditId(), MerchantAudit.class);
        if (merchantAudit.getAuditStatus() == AuditStatusEnum.PENDING) {
            return R.failed("创建门店提交失败, 商家当前审核中, 暂不能创建门店");
        }

        /* step-3 检查行业信息 */
        if (ObjUtil.isNotNull(dto.getIndustryId())) {
            Industry industry = Db.getById(dto.getIndustryId(), Industry.class);
            if (industry == null) {
                return R.failed("创建门店提交失败, 所选行业不存在");
            }
        }

        /* step-4 根据传入地址获得地理位置坐标 */
        List<Long> regionCodes = strCodesToList(dto.getRegionCode());
        List<String> locations = getLocationNamesByRegionCodes(regionCodes);
        String location = locations.stream().filter(Objects::nonNull).collect(Collectors.joining("-"));
        Map<String, String> locationMap = parseAddressToLbs(location + dto.getAddressDetail());

        /* step-5 写入门店新增信息 */
        Store storeEntity = new Store();
        String images = null, licenseImages = null;
        CopyOptions copier = CopyOptions.create().setIgnoreProperties(Store::getImages, Store::getLicenseImages);
        BeanUtil.copyProperties(dto, storeEntity, copier);
        if (CollUtil.isNotEmpty(dto.getImages())) {
            images = JSONUtil.toJsonStr(dto.getImages());
        }
        if (CollUtil.isNotEmpty(dto.getLicenseImages())) {
            licenseImages = JSONUtil.toJsonStr(dto.getLicenseImages());
        }
        storeEntity.setLongitude(new BigDecimal(locationMap.get("longitude")));
        storeEntity.setLatitude(new BigDecimal(locationMap.get("latitude")));
        storeEntity.setRegionCode(JSONUtil.toJsonStr(regionCodes));
        storeEntity.setAddressDetail(dto.getAddressDetail());
        storeEntity.setMerchantId(merchantId);
        storeEntity.setLicenseImages(licenseImages);
        storeEntity.setLocation(location);
        storeEntity.setImages(images);
        boolean result = save(storeEntity);
        if (!result) {
            throw new CheckedException("创建门店提交失败, 请重试");
        }

        /* step-6 写入门店审核信息 */
        StoreAudit storeAuditEntity = BeanUtil.copyProperties(storeEntity, StoreAudit.class);
        storeAuditEntity.setAuditType(AuditStatusEnum.CREATE);
        storeAuditEntity.setLicenseImages(licenseImages);
        storeAuditEntity.setStoreId(storeEntity.getId());
        storeAuditEntity.setModifyReason("新增创建");
        storeAuditEntity.setImages(images);
        storeAuditEntity.setId(null);
        result = Db.save(storeAuditEntity);
        if (!result) {
            throw new CheckedException("创建门店提交失败, 请重试");
        }

        /* step-7 更新门店关联审核记录ID */
        Store updateEntity = new Store();
        updateEntity.setId(storeAuditEntity.getStoreId());
        updateEntity.setAuditId(storeAuditEntity.getId());
        result = updateById(updateEntity);
        if (!result) {
            throw new CheckedException("创建门店提交失败, 请重试");
        }

        return R.ok();
    }


    /**
     * 删除门店
     *
     * @param storeId 门店ID
     * @param reason  删除原因
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> delete(Long storeId, String reason) {

        /* step-1 检查门店状态 */
        // 检查门店状态
        Store entity = storeMapper.getStoreById(storeId, initDataScope());
        if (ObjUtil.isNull(entity)) {
            return R.failed("删除门店失败, 该门店不存在");
        }
        if (entity.getBusinessStatus() != BusinessStatusEnum.STORE_CLOSE) {
            return R.failed("删除门店失败, 该门店当前正在营业, 不能删除");
        }
        entity.setEnable(false);

        // 检查门店是否有未完成订单
        Long checkCount = Db.lambdaQuery(Order.class)
                .eq(Order::getStoreId, storeId)
                .isNull(Order::getCompletionTime)
                .count();
        if (checkCount > 0) {
            return R.failed("删除门店失败, 该门店存在未完成订单");
        }

        /* step-2 提交审核记录 */
        StoreAudit storeAuditEntity = BeanUtil.copyProperties(entity, StoreAudit.class);
        storeAuditEntity.setAuditType(AuditStatusEnum.DELETE);
        storeAuditEntity.setModifyReason(reason);
        storeAuditEntity.setStoreId(storeId);
        storeAuditEntity.setId(null);
        boolean result = Db.save(storeAuditEntity);
        if (!result) {
            return R.failed("删除门店提交失败, 请重试");
        }

        /* step-3 更新门店状态 */
        entity.setName("(删除审核中)" + entity.getName());
        result = updateById(entity);
        if (!result) {
            throw new RuntimeException("删除门店提交失败, 请重试");
        }

        return R.ok();
    }


    /**
     * 修改门店信息
     *
     * @param dto 门店修改参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> updateInfo(StoreInfoUpdateDTO dto) {
        Long merchantId = getCurrentMerchantId();

        /* step-1 检查门店状态 */
        Store storeEntity = null;
        // 检查名称是否重复
        if (StrUtil.isNotBlank(dto.getName())) {
            storeEntity = lambdaQuery().eq(Store::getName, dto.getName()).last("LIMIT 1").one();
            if (ObjUtil.isNotNull(storeEntity) && !ObjUtil.equals(storeEntity.getId(), Long.valueOf(dto.getStoreId()))) {
                return R.failed("修改门店信息提交失败, 已存在名称相同门店");
            }
        }
        // 检查门店是否存在
        if (ObjUtil.isNull(storeEntity)) {
            storeEntity = getById(dto.getStoreId());
            if (ObjUtil.isNull(storeEntity) || !ObjUtil.equals(storeEntity.getMerchantId(), merchantId)) {
                return R.failed("修改门店信息提交失败, 该门店不存在");
            }
            if (!storeEntity.getEnable()) {
                return R.failed("修改门店信息提交失败, 该门店已禁用");
            }
        }
        // 检查门店是否属于当前商家
        if (!ObjUtil.equals(storeEntity.getMerchantId(), merchantId)) {
            return R.failed("修改门店信息提交失败, 该门店不存在");
        }
        // 检查门店是否正在审核
        StoreAudit storeAudit = Db.getById(storeEntity.getAuditId(), StoreAudit.class);
        if (storeAudit.getAuditStatus() == AuditStatusEnum.PENDING) {
            return R.failed("门店当前已在审批中, 请勿重复提交");
        }
        // 检查所选行业是否存在
        Industry industry = Db.getById(dto.getIndustryId(), Industry.class);
        if (ObjUtil.isNull(industry)) {
            return R.failed("修改门店信息提交失败, 所选行业不存在");
        }

        /* step-2 获取新的地址信息(如有) */
        String location = null;
        List<Long> regionCodes = null;
        Map<String, String> locationMap = null;
        if (StrUtil.isNotBlank(dto.getAddressDetail())) {
            regionCodes = strCodesToList(dto.getRegionCode());
            List<String> locations = getLocationNamesByRegionCodes(regionCodes);
            location = locations.stream().filter(Objects::nonNull).collect(Collectors.joining("-"));
            locationMap = parseAddressToLbs(location + dto.getAddressDetail());
        }

        /* step-2 写入门店审核信息 */
        // 拷贝修改信息到实体
        CopyOptions copier = CopyOptions.create().ignoreNullValue().setIgnoreProperties(Store::getImages);
        BeanUtil.copyProperties(dto, storeEntity, copier);
        // 拷贝门店原有信息到审核记录
        copier = CopyOptions.create().setIgnoreProperties(
                Store::getCreatedBy, Store::getCreatedTime, Store::getUpdatedBy, Store::getUpdatedTime
        );
        StoreAudit storeAuditEntity = new StoreAudit();
        BeanUtil.copyProperties(storeEntity, storeAuditEntity, copier);
        storeAuditEntity.setId(null);
        storeAuditEntity.setAuditType(AuditStatusEnum.REVISION);
        storeAuditEntity.setAuditStatus(AuditStatusEnum.PENDING);
        storeAuditEntity.setStoreId(storeEntity.getId());
        if (CollUtil.isNotEmpty(dto.getImages())) {
            storeAuditEntity.setImages(JSONUtil.toJsonStr(dto.getImages()));
        }
        if (CollUtil.isNotEmpty(locationMap) && StrUtil.isNotBlank(location)) {
            storeAuditEntity.setLongitude(new BigDecimal(locationMap.get("longitude")));
            storeAuditEntity.setLatitude(new BigDecimal(locationMap.get("latitude")));
            storeAuditEntity.setRegionCode(JSONUtil.toJsonStr(regionCodes));
            storeAuditEntity.setAddressDetail(dto.getAddressDetail());
            storeAuditEntity.setModifyReason(dto.getModifyReason());
            storeAuditEntity.setLocation(location);
        }
        boolean result = Db.save(storeAuditEntity);
        if (!result) {
            throw new CheckedException("修改门店信息提交失败, 请重试");
        }

        /* step-3 更新门店关联审核记录 */
        Store updateEntity = new Store();
        updateEntity.setId(storeAuditEntity.getStoreId());
        updateEntity.setAuditId(storeAuditEntity.getId());
        result = updateById(updateEntity);
        if (!result) {
            throw new CheckedException("修改门店信息提交失败, 请重试");
        }

        return R.ok();
    }


    /**
     * 修改门店资质信息
     *
     * @param dto 门店资质信息修改参数
     * @return 操作结果
     */
    @Override
    public R<?> updateQualification(StoreQualificationDTO dto) {
        /* step-1 检查门店状态 */
        Store entityEntity = getById(dto.getStoreId());
        if (ObjUtil.isNull(entityEntity)) {
            return R.failed("修改门店信息提交失败, 该门店不存在");
        }
        if (!ObjUtil.equals(entityEntity.getMerchantId(), getCurrentMerchantId())) {
            return R.failed("修改门店资质信息提交失败, 该门店不存在");
        }

        /* step-2 新增审核记录 */
        CopyOptions copier = CopyOptions.create().setIgnoreProperties(
                Store::getCreatedBy, Store::getCreatedTime, Store::getUpdatedBy, Store::getUpdatedTime);
        StoreAudit storeAuditEntity = new StoreAudit();
        BeanUtil.copyProperties(entityEntity, storeAuditEntity, copier);
        copier = CopyOptions.create().ignoreNullValue().setIgnoreProperties(StoreQualificationDTO::getLicenseImages);
        BeanUtil.copyProperties(dto, storeAuditEntity, copier);
        if (CollUtil.isNotEmpty(dto.getLicenseImages())) {
            storeAuditEntity.setLicenseImages(JSONUtil.toJsonStr(dto.getLicenseImages()));
        }
        storeAuditEntity.setId(null);
        storeAuditEntity.setAuditType(AuditStatusEnum.REVISION);
        boolean result = Db.save(storeAuditEntity);
        if (!result) {
            return R.failed("修改门店信息提交失败, 请重试");
        }

        /* step-2 更新门店关联审核记录 */
        Store updateEntity = new Store();
        updateEntity.setId(Long.valueOf(dto.getStoreId()));
        updateEntity.setAuditId(storeAuditEntity.getId());
        result = updateById(updateEntity);
        if (!result) {
            throw new CheckedException("修改门店资质信息提交失败, 请重试");
        }

        return R.ok();
    }


    /**
     * 修改门店营业状态
     *
     * @param dto 营业状态修改参数
     * @return 响应结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> updateBusinessStatus(StoreBizStatusDTO dto) {
        /* step-1 检查门店状态 */
        Store entity = storeMapper.getStoreById(Long.valueOf(dto.getStoreId()), initDataScope());
        if (ObjUtil.isNull(entity)) {
            return R.failed("修改门店营业状态提交失败, 该门店不存在");
        }
        if (!entity.getEnable()) {
            return R.failed("修改门店营业状态提交失败, 该门店已禁用");
        }
        StoreAudit storeAudit = Db.getById(entity.getAuditId(), StoreAudit.class);
        if (storeAudit.getAuditStatus() == AuditStatusEnum.PENDING) {
            return R.failed("修改门店营业状态提交失败, 门店当前正在审核中");
        }
        if (StrUtil.isBlank(dto.getBusinessHours())) {
            if (dto.getBusinessStatus().equals(entity.getBusinessStatus().getValue())) {
                return R.failed("修改门店营业状态提交失败, 门店当前营业状态与提交状态相同");
            }
        }

        /* step-2 写入门店审核信息 */
        StoreAudit storeAuditEntity = new StoreAudit();
        BeanUtil.copyProperties(entity, storeAuditEntity);
        storeAuditEntity.setBusinessStatus(BusinessStatusEnum.getByValue(dto.getBusinessStatus()));
        storeAuditEntity.setBusinessHours(dto.getBusinessHours());
        storeAuditEntity.setAuditType(AuditStatusEnum.BIZ_STATUS);
        storeAuditEntity.setAuditStatus(AuditStatusEnum.PENDING);
        storeAuditEntity.setModifyReason(dto.getModifyReason());
        storeAuditEntity.setStoreId(entity.getId());
        storeAuditEntity.setId(null);
        boolean result = Db.save(storeAuditEntity);
        if (!result) {
            return R.failed("修改门店营业状态提交失败, 请重试");
        }

        /* step-3 更新门店关联审核记录 */
        Store updateEntity = new Store();
        updateEntity.setId(storeAuditEntity.getStoreId());
        updateEntity.setAuditId(storeAuditEntity.getId());
        result = updateById(updateEntity);
        if (!result) {
            throw new CheckedException("修改门店营业状态提交失败, 请重试");
        }

        return R.ok();
    }


    /**
     * 重建门店缓存
     *
     * @return 响应结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> rebuildStoreCache() {
        storeCacheRepository.dropAllStoreCache();

        long current = 1, pageSize = 100L;
        while (true) {
            List<StoreCacheBO> stores = storeMapper.queryAllStoreForRebuildCacheWithPage(current, pageSize);
            if (CollUtil.isEmpty(stores)) {
                break;
            }
            storeCacheRepository.upsertBatchStore(stores);

            if (stores.size() < pageSize) {
                break;
            }
            current++;
        }

        return R.ok();
    }


    /**
     * 根据门店ID列表获取门店简要信息列表
     *
     * @param storeIds 门店ID列表
     * @return 门店简要信息列表
     */
    @Override
    public List<StoreSimpleInfoVO> getStoreSimpleInfo(Collection<?> storeIds) {
        return storeMapper.getStoreSimpleInfo(storeIds);
    }


    /**
     * 商家获取门店列表
     *
     * @param dto 商家门店列表查询参数
     * @return 响应结果
     */
    @Override
    public R<PageQueryVO<StoreListVO>> getListByMerchant(MerchantStoreListDTO dto) {
        IPage<StoreListVO> pageData = storeMapper.getStoreList(dto.page(), dto, initDataScope());
        return R.ok(PageQueryVO.of(pageData));
    }


    /**
     * 获取门店信息
     *
     * @param storeId 门店ID
     * @return 查询结果
     */
    @Override
    public R<StoreInfoVO> getInfo(Long storeId) {
        Store entity = storeMapper.getStoreById(storeId, initDataScope());
        if (ObjUtil.isNull(entity)) {
            return R.failed("查询门店信息失败, 无效的门店");
        }

        StoreInfoVO vo = new StoreInfoVO();
        CopyOptions copier = CopyOptions.create().setIgnoreProperties(Store::getImages);
        BeanUtil.copyProperties(entity, vo, copier);
        vo.setRegionCode(String.join(",", JSONUtil.toList(entity.getRegionCode(), String.class)));
        vo.setStoreId(entity.getId());
        if (StrUtil.isNotBlank(entity.getImages())) {
            vo.setImages(JSONUtil.toList(entity.getImages(), String.class));
        }

        StoreAudit storeAudit = Db.getById(entity.getAuditId(), StoreAudit.class);
        if (!ObjUtil.isNotNull(storeAudit)) {
            return R.ok(vo);
        }
        switch (storeAudit.getAuditStatus()) {
            case APPROVED, REJECTED -> vo.setAuditing(false);
            case PENDING -> vo.setAuditing(true);
        }

        return R.ok(vo);
    }


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 查询结果
     */
    @Override
    public R<StoreQualificationVO> getQualification(Long storeId) {
        Store entity = storeMapper.getStoreById(storeId, initDataScope());
        if (ObjUtil.isNull(entity)) {
            return R.failed("查询门店资质信息失败, 无效的门店");
        }

        StoreQualificationVO vo = new StoreQualificationVO();
        vo.setStoreId(storeId);
        vo.setLicenseNo(entity.getLicenseNo());
        if (StrUtil.isNotBlank(entity.getLicenseImages())) {
            vo.setLicenseImages(JSONUtil.toList(entity.getLicenseImages(), String.class));
        }

        StoreAudit storeAudit = Db.getById(entity.getAuditId(), StoreAudit.class);
        if (ObjUtil.isNull(storeAudit)) {
            return R.ok(vo);
        }
        switch (storeAudit.getAuditStatus()) {
            case APPROVED, REJECTED -> vo.setAuditing(false);
            case PENDING -> vo.setAuditing(true);
        }

        return R.ok(vo);
    }


    /**
     * 根据区域编码和行业分类ID查询符合条件的门店商家行业关系列表
     *
     * @param regionCode 区域编码
     * @param industryId 行业分类ID
     * @return 查询结果(符合条件的门店商家行业关系列表)
     */
    @Override
    public Page<StoreMerchantIndustryBO> queryStoresByRegionCodeAndIndustry(Page<?> page, Long regionCode, Long industryId) {
        return storeMapper.queryStoresByRegionCodeAndIndustry(page, regionCode, industryId);
    }


    /**
     * 【消费者端】
     * 查询范围内门店列表
     *
     * @param dto 门店查询参数
     * @return 查询结果(距离升序门店列表)
     */
    @Override
    public Page<StoreCacheDTO> queryNearbyStores(UserClaimableQueryDTO dto) {
        dto.setRadius(dto.getRadius() == null || dto.getRadius() == 0.0 ? 5.0 : dto.getRadius());
        Page<StoreCacheDTO> page = Page.of(dto.getPageNum() == 0 ? 1 : dto.getPageNum(), dto.getPageSize());
        return storeMapper.queryNearbyStores(page, dto);
    }


    /**
     * 【消费者端】
     * 根据范围和行业查询范围内门店列表
     *
     * @param dto 门店查询参数
     * @return 查询结果(距离升序门店列表)
     */
    @Override
    public Page<StoreCacheBO> queryStoreByRadiusAndIndustry(MiniStoreQueryDTO dto) {
        dto.setRadius(dto.getRadius() == null || dto.getRadius() == 0.0 ? 5.0 : dto.getRadius());
        Page<MiniMerchantListVO> page = Page.of(dto.getPageNum() == 0 ? 1 : dto.getPageNum(), dto.getPageSize());
        return storeMapper.queryStoreByRadiusAndIndustry(page, dto);
    }


    /**
     * 【消费者端】
     * 获取门店图片列表
     *
     * @param storeId 门店ID
     * @param allShow 是否展示所有图片
     * @return 查询结果(门店图片列表)
     */
    @Override
    public String getStoreImages(Long storeId, Boolean allShow) {
        return storeMapper.getStoreImages(storeId, allShow);
    }


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 查询结果(门店资质信息)
     */
    @Override
    public QualificationBO getStoreQualification(Long storeId) {
        return storeMapper.getStoreQualification(storeId);
    }


    /**
     * 【消费者端】
     * 查询商家下距离升序门店列表
     *
     * @param merchantId 商家ID
     * @param longitude  经度
     * @param latitude   纬度
     * @return 查询结果(距离升序门店列表)
     */
    @Override
    public List<MiniStoreListVO> queryStoreListByMerchantId(Long merchantId, Double longitude, Double latitude) {
        return storeMapper.queryStoreListByMerchantId(merchantId, longitude, latitude);
    }


    /**
     * 【消费者端】
     * 获取门店首页信息
     *
     * @param storeId 门店ID
     * @return 获取门店首页信息
     */
    @Override
    public MiniStoreIndexVO getStoreIndex(Long storeId, Double longitude, Double latitude) {
        return storeMapper.getStoreIndex(storeId, longitude, latitude);
    }


    /**
     * 【平台端】
     * 查询门店列表
     *
     * @param dto 查询参数
     * @return 查询结果(门店列表)
     */
    @Override
    public R<PageQueryVO<StoreListVO>> queryStoreList(StoreListDTO dto) {
        if (CollUtil.isNotEmpty(dto.getRegionCodes())) {
            dto.setRegionJson(JSONUtil.toJsonStr(dto.getRegionCodes()));
        }
        IPage<StoreListVO> pageData = storeMapper.queryStoreList(dto.page(), dto);

        return R.ok(PageQueryVO.of(pageData, vo -> {
            vo.setBusinessStatus(withinBusinessHours(vo.getBusinessStatus(), vo.getBusinessHours()));
            return vo;
        }));
    }


    /**
     * 将逗号分割的地区编码字符串转化为地区编码列表
     *
     * @param strRegionCodes 地区编码字符串
     * @return 地区编码列表
     */
    private List<Long> strCodesToList(String strRegionCodes) {
        if (!StrUtil.isNotBlank(strRegionCodes)) {
            throw new RuntimeException("提交失败, 请填写正确有效的地区编码");
        }
        List<Long> regionCodes = Arrays.stream(StringUtils.split(strRegionCodes, ","))
                .map(String::trim)
                .filter(s -> NumberUtils.isParsable(s) && NumberUtils.isCreatable(s))
                .map(NumberUtils::toLong)
                .toList();
        if (!CollUtil.isNotEmpty(regionCodes) || regionCodes.size() < 2) {
            throw new RuntimeException("提交失败, 请填写正确有效的地区编码");
        }
        return regionCodes;
    }


    /**
     * 根据地区编码列表获取地区名称列表
     *
     * @param regionCodes 地区编码列表
     * @return 地区名称列表
     */
    private List<String> getLocationNamesByRegionCodes(List<Long> regionCodes) {
        R<List<String>> remoteResult = remoteAreaService.getLocationsByCodes(regionCodes);
        if (!remoteResult.isOk()) {
            throw new RuntimeException("提交失败, 请稍后重试");
        }
        List<String> locations = remoteResult.getData();
        if (!CollUtil.isNotEmpty(locations) || regionCodes.size() != locations.size()) {
            throw new RuntimeException("提交失败, 请填写正确有效的地区编码");
        }
        String prev = null;
        Iterator<String> iterator = locations.iterator();
        while (iterator.hasNext()) {
            String curr = iterator.next();
            if (StrUtil.isNotBlank(prev) && curr.equals(prev)) {
                iterator.remove();
            }
            prev = curr;
        }
        return locations;
    }


    /**
     * 解析地址信息为经纬度
     *
     * @param address 详细地址
     * @return 经纬度
     */
    private Map<String, String> parseAddressToLbs(String address) {
        Map<String, String> localtionMap = lbsParseService.lbsParse(address);
        if (!CollUtil.isNotEmpty(localtionMap)) {
            throw new RuntimeException("提交失败, 请填写正确有效的位置信息");
        }
        return localtionMap;
    }


    private Long getCurrentMerchantId() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            throw new RuntimeException("无效的登录用户");
        }
        return user.getDeptId();
    }


    private DataScope initDataScope() {
        DataScope dataScope = DataScope.of();
        dataScope.setScopeUserName("created_by");
        dataScope.setScopeDeptName("merchant_id");
        return dataScope;
    }


}