package cn.joywon.poco.merchant.PlatformModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.admin.api.feign.RemoteUserService;
import cn.joywon.poco.admin.api.vo.UserNameVO;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.dto.AuditResultDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreAuditQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreCacheDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.entity.Store;
import cn.joywon.poco.merchant.MerchantModule.entity.StoreAudit;
import cn.joywon.poco.merchant.MerchantModule.repository.IStoreCacheRepository;
import cn.joywon.poco.merchant.MerchantModule.vo.AuditStatusVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreAuditDetailVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreAuditListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreDetailVO;
import cn.joywon.poco.merchant.PlatformModule.entity.Industry;
import cn.joywon.poco.merchant.PlatformModule.mapper.StoreAuditMapper;
import cn.joywon.poco.merchant.PlatformModule.service.IStoreAdminService;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class StoreAdminServiceImpl extends ServiceImpl<StoreAuditMapper, StoreAudit> implements IStoreAdminService {

    private final RemoteUserService remoteUserService;

    private final StoreAuditMapper storeAuditMapper;
    private final IStoreCacheRepository storeCacheRepository;


    /**
     * 审核门店信息
     *
     * @param dto 审核参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> auditHandle(AuditResultDTO dto) {
        /* step-1 检查审核记录 & 门店状态 */
        StoreAudit entity = getById(dto.getAuditId());
        if (entity == null) {
            return R.failed("审核失败, 该审核记录不存在");
        }
        if (entity.getAuditStatus() != AuditStatusEnum.PENDING) {
            return R.failed("审核失败, 该门店已被审核");
        }
        Store store = Db.getById(entity.getStoreId(), Store.class);
        if (ObjUtil.isNull(store)) {
            log.error("无法根据审核记录关联的门店ID查询得到门店信息, 审核记录ID: {}, 门店ID: {}", entity.getId(), entity.getStoreId());
            return R.failed("审核失败, 该门店不存在");
        }
        Long oldIndustryId = store.getIndustryId();

        /* step-2 更新审核记录 */
        AuditStatusEnum auditResult = AuditStatusEnum.valueOf(dto.getAuditResult());
        entity.setAuditBy(getCurrentUser().getId());
        entity.setAuditRemark(dto.getAuditRemark());
        entity.setAuditTime(LocalDateTime.now());
        entity.setAuditStatus(auditResult);
        boolean result = updateById(entity);
        if (!result) {
            return R.failed("更新审核记录失败");
        }
        // TODO MMX 推送审核结果
        if (auditResult == AuditStatusEnum.REJECTED) {
            if (entity.getAuditType() == AuditStatusEnum.DELETE) {
                String storeName = store.getName();
                int i = storeName.indexOf(")");
                storeName = (i != -1) ? storeName.substring(i + 1) : storeName;
                store.setName(storeName);
                store.setEnable(true);
                result = Db.updateById(store);
                if (!result) {
                    throw new CheckedException("更新门店信息失败, 请重试");
                }
            }

            return R.ok();
        }

        /* step-3 更新门店信息 */
        // 根据审核类型更新门店信息
        switch (entity.getAuditType()) {
            case CREATE -> {
                store.setEnable(true);
                store.setBusinessStatus(BusinessStatusEnum.STORE_OPEN);
                result = Db.updateById(store);
                // 将门店写入缓存
                StoreCacheDTO storeCache = BeanUtil.copyProperties(store, StoreCacheDTO.class);
                storeCache.setBusinessStatus(store.getBusinessStatus().getValue());
                storeCacheRepository.upsert(storeCache);
            }
            case DELETE -> {
                store.setEnable(false);
                store.setDeleted(true);
                store.setName(entity.getName());
                store.setDeletedTime(LocalDateTime.now());
                store.setBusinessStatus(BusinessStatusEnum.STORE_DELETED);
                result = Db.updateById(store);
                // 删除门店缓存
                storeCacheRepository.deleteById(store.getId().toString(), oldIndustryId.toString());
            }
            case REVISION, BIZ_STATUS -> {
                CopyOptions copier = CopyOptions.create().setIgnoreProperties(StoreAudit::getId,
                        StoreAudit::getCreatedBy, StoreAudit::getCreatedTime,
                        StoreAudit::getUpdatedBy, StoreAudit::getUpdatedTime);
                BeanUtil.copyProperties(entity, store, copier);
                result = Db.updateById(store);
                // 更新门店缓存
                storeCacheRepository.deleteById(store.getId().toString(), oldIndustryId.toString());
                StoreCacheDTO storeCache = BeanUtil.copyProperties(store, StoreCacheDTO.class);
                storeCache.setBusinessHours(store.getBusinessStatus().getValue());
                storeCacheRepository.upsert(storeCache);
            }
        }
        Assert.isTrue(result, () -> new RuntimeException("更新门店信息失败, 请重试"));

        return R.ok();
    }


    /**
     * 查询门店审核列表
     *
     * @param dto 查询参数
     * @return 查询结果
     */
    @Override
    public R<PageQueryVO<StoreAuditListVO>> queryAuditList(StoreAuditQueryDTO dto) {
        Page<StoreAuditListVO> pageData = storeAuditMapper.queryAuditList(dto.page(), dto);
        return R.ok(PageQueryVO.of(pageData));
    }


    /**
     * 获取门店审核详情
     *
     * @param id 审核记录ID
     * @return 查询结果
     */
    @Override
    public R<StoreAuditDetailVO> getAuditDetail(Long id) {
        // 检查审核记录状态
        StoreAudit entity = getById(id);
        if (entity == null) {
            return R.ok(new StoreAuditDetailVO());
        }

        // 获取关联表信息
        MPJLambdaWrapper<StoreAudit> wrapper = new MPJLambdaWrapper<StoreAudit>()
                .select(Merchant::getName)
                .selectAs(Merchant::getName, StoreAuditDetailVO::getMerchantName)
                .select(Industry::getName)
                .selectAs(Industry::getName, StoreAuditDetailVO::getIndustryName)
                .leftJoin(Merchant.class, Merchant::getId, StoreAudit::getMerchantId)
                .leftJoin(Industry.class, Industry::getId, StoreAudit::getIndustryId)
                .eq(StoreAudit::getId, id);
        StoreAuditDetailVO vo = storeAuditMapper.selectJoinOne(StoreAuditDetailVO.class, wrapper);

        // 组装返回数据
        CopyOptions copier = CopyOptions.create().setIgnoreProperties(StoreAudit::getImages, StoreAudit::getLicenseImages);
        BeanUtil.copyProperties(entity, vo, copier);
        vo.setRegionCode(String.join(",", JSONUtil.toList(entity.getRegionCode(), String.class)));
        vo.setStoreName(entity.getName());
        vo.setAuditId(entity.getId());
        if (StrUtil.isNotBlank(entity.getImages())) {
            vo.setImages(JSONUtil.toList(entity.getImages(), String.class));
        }
        if (StrUtil.isNotBlank(entity.getLicenseImages())) {
            vo.setLicenseImages(JSONUtil.toList(entity.getLicenseImages(), String.class));
        }

        return R.ok(vo);
    }


    /**
     * 获取门店详情
     *
     * @param storeId 门店ID
     * @return 查询结果(门店详情)
     */
    @Override
    public R<StoreDetailVO> getDetail(Long storeId) {
        Store storeEntity = Db.getById(storeId, Store.class);
        if (ObjUtil.isNull(storeEntity)) {
            return R.ok(new StoreDetailVO());
        }

        StoreDetailVO vo = new StoreDetailVO();
        // 填充门店主要信息
        StoreAudit storeAuditEntity = getById(storeEntity.getAuditId());
        CopyOptions copier = CopyOptions.create()
                .setIgnoreProperties(StoreAudit::getId, StoreAudit::getImages, StoreAudit::getLicenseImages);
        BeanUtil.copyProperties(storeAuditEntity, vo, copier);
        vo.setRegionCode(String.join(",", JSONUtil.toList(storeAuditEntity.getRegionCode(), String.class)));
        vo.setStoreId(storeEntity.getId());
        if (StrUtil.isNotBlank(storeAuditEntity.getImages())) {
            vo.setImages(JSONUtil.toList(storeAuditEntity.getImages(), String.class));
        }
        if (StrUtil.isNotBlank(storeAuditEntity.getLicenseImages())) {
            vo.setLicenseImages(JSONUtil.toList(storeAuditEntity.getLicenseImages(), String.class));
        }
        // 填充审核人名称
        if (ObjUtil.isNotNull(storeAuditEntity.getAuditBy())) {
            R<List<UserNameVO>> remoteResult = remoteUserService.getUserNames(List.of(storeAuditEntity.getAuditBy()));
            if (remoteResult.isOk() && CollUtil.isNotEmpty(remoteResult.getData())) {
                vo.setAuditName(remoteResult.getData().get(0).getUserName());
            }
        }

        // 填充门店所属商家信息
        Merchant merchantEntity = Db.getById(storeEntity.getMerchantId(), Merchant.class);
        if (ObjUtil.isNull(merchantEntity)) {
            return R.ok(vo);
        }
        vo.setMerchantId(merchantEntity.getId());
        vo.setMerchantName(merchantEntity.getName());
        vo.setMerchantLogoUrl(merchantEntity.getLogoUrl());
        vo.setMerchantContactPhone(merchantEntity.getContactPhone());
        vo.setMerchantBusinessStatus(merchantEntity.getBusinessStatus());

        return R.ok(vo);
    }


    /**
     * 获取门店审核状态
     *
     * @param storeId 门店ID
     * @return 查询结果(门店审核状态)
     */
    @Override
    public R<AuditStatusVO> getAuditStatus(Long storeId) {
        PocoUser currentMerchant = getCurrentUser();
        Long merchantId = currentMerchant.getDeptId();
        Store store = Db.getById(storeId, Store.class);
        AuditStatusVO vo = new AuditStatusVO();
        if (ObjUtil.isNull(store)) {
            return R.failed("获取失败, 无效的门店");
        }
        if (!ObjUtil.equals(merchantId, store.getId()) || !ObjUtil.equals(merchantId, store.getMerchantId())) {
            return R.failed("获取失败, 无效的门店");
        }
        StoreAudit entity = getById(store.getAuditId());
        BeanUtil.copyProperties(entity, vo);
        vo.setAuditId(entity.getId());

        return R.ok(vo);
    }


    /**
     * 获取门店审核历史列表
     *
     * @param storeId  门店ID
     * @param sortDesc 是否按提交审核时间降序排序
     * @return 查询结果(审核历史列表)
     */
    @Override
    public R<List<AuditStatusVO>> getAuditHistoryList(Long storeId, Boolean sortDesc) {
        Long merchantId = getCurrentUser().getDeptId();

        Store store = Db.getById(storeId, Store.class);
        if (ObjUtil.isNull(store) || !ObjUtil.equals(store.getMerchantId(), merchantId)) {
            return R.failed("无效的门店ID");
        }

        List<AuditStatusVO> historyList = storeAuditMapper.getAuditHistoryList(storeId, sortDesc);
        return R.ok(historyList);
    }


    private PocoUser getCurrentUser() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            throw new RuntimeException("无效的登录用户");
        }
        return user;
    }

}