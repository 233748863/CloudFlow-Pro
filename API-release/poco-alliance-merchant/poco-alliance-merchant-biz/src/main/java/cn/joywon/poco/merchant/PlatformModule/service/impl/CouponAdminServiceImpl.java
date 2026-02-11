package cn.joywon.poco.merchant.PlatformModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.admin.api.feign.RemoteUserService;
import cn.joywon.poco.admin.api.vo.UserNameVO;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.bo.CouponTemplateAuditDetailBO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateAuditDTO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateAuditListDTO;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.mapper.CouponTemplateMapper;
import cn.joywon.poco.merchant.CouponModule.vo.CouponTemplateAuditDetailVO;
import cn.joywon.poco.merchant.CouponModule.vo.CouponTemplateAuditListVO;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.service.IStoreService;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreSimpleInfoVO;
import cn.joywon.poco.merchant.PlatformModule.service.ICouponAdminService;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuSimpleInfoVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CouponAdminServiceImpl extends
        ServiceImpl<CouponTemplateMapper, CouponTemplate> implements ICouponAdminService {

    private final RemoteUserService remoteUserService;

    private final ProductSkuService productSkuService;
    private final IStoreService storeService;


    /**
     * 审核优惠券模板
     *
     * @param dto 优惠券模板审核参数
     * @return 操作结果
     */
    @Override
    public R<?> auditHandle(CouponTemplateAuditDTO dto) {
        /* step-1 检查优惠券模板状态 */
        CouponTemplate entity = getById(dto.getCouponTemplateId());
        if (ObjUtil.isNull(entity)) {
            return R.failed("审核失败, 该优惠券模板不存在");
        }
        if (entity.getCouponStatus() != CouponStatusEnum.TEMPLATE_ACTIVE) {
            return R.failed("审核失败, 该优惠券模板已审核");
        }

        /* step-2 写入更新 */
        CouponStatusEnum auditStatus = CouponStatusEnum.valueOf(dto.getAuditResult());
        entity.setCouponStatus(auditStatus);
        entity.setAuditRemark(dto.getAuditRemark());
        entity.setAuditTime(LocalDateTime.now());
        entity.setAuditBy(getPrincipalId());
        if (auditStatus == CouponStatusEnum.TEMPLATE_ACTIVE) {
            entity.setEnable(true);
        }
        boolean result = updateById(entity);

        // TODO MMX 推送审核结果
        return result ? R.ok() : R.failed("审核失败, 请联系管理员");
    }


    /**
     * 获取优惠券模板列表
     *
     * @param dto 优惠券模板列表参数
     * @return 查询结果(优惠券模板列表)
     */
    @Override
    public R<PageQueryVO<CouponTemplateAuditListVO>> getList(CouponTemplateAuditListDTO dto) {
        MPJLambdaWrapper<CouponTemplate> wrapper = initCouponTemplateJoinMerchantWrapper()
                // 指定字段别名
                .selectAs(CouponTemplate::getLogoUrl, CouponTemplateAuditListVO::getCouponLogoUrl)
                .selectAs(CouponTemplate::getId, CouponTemplateAuditListVO::getCouponTemplateId)
                .selectAs(Merchant::getName, CouponTemplateAuditListVO::getMerchantName)
                // 构建查询条件
                .like(StrUtil.isNotBlank(dto.getName()), CouponTemplate::getName, dto.getName())
                .in(CollUtil.isNotEmpty(dto.getCouponStatus()), CouponTemplate::getCouponStatus, dto.getCouponStatus())
                .eq(CollUtil.isEmpty(dto.getCouponStatus()), CouponTemplate::getCouponStatus, CouponStatusEnum.TEMPLATE_ACTIVE)
                .in(CollUtil.isNotEmpty(dto.getType()), CouponTemplate::getType, dto.getType())
                .le(ObjUtil.isNotNull(dto.getEndTime()), CouponTemplate::getCreatedTime, dto.getEndTime())
                .ge(ObjUtil.isNotNull(dto.getBeginTime()), CouponTemplate::getCreatedTime, dto.getBeginTime())
                .orderByAsc(ObjUtil.isNotNull(dto.getOrderByACreateTime()) && dto.getOrderByACreateTime(), CouponTemplate::getCreatedTime)
                .orderByDesc(ObjUtil.isNotNull(dto.getOrderByACreateTime()) && !dto.getOrderByACreateTime(), CouponTemplate::getCreatedTime)
                .orderByDesc(ObjUtil.isNull(dto.getOrderByACreateTime()), CouponTemplate::getCreatedTime);

        Page<CouponTemplateAuditListVO> pageData = baseMapper.selectJoinPage(dto.page(), CouponTemplateAuditListVO.class, wrapper);

        return R.ok(PageQueryVO.of(
                pageData, i -> {
                    switch (i.getType()) {
                        case COUPON_TYPE_CASH -> i.setDiscountRate(BigDecimal.ZERO);
                        case COUPON_TYPE_DISCOUNT -> i.setDiscountAmount(BigDecimal.ZERO);
                    }
                    return i;
                }));
    }


    /**
     * 获取优惠券模板详情
     *
     * @param couponTemplateId 优惠券模板ID
     * @return 查询结果(优惠券模板详情)
     */
    @Override
    public R<CouponTemplateAuditDetailVO> getDetail(Long couponTemplateId) {
        /* step-1 构建查询条件 */
        MPJLambdaWrapper<CouponTemplate> wrapper = initCouponTemplateJoinMerchantWrapper()
                // 查询优惠券模板属性
                .select(CouponTemplate::getAuditBy,
                        CouponTemplate::getAuditRemark,
                        CouponTemplate::getDescription,
                        CouponTemplate::getValidEndTime,
                        CouponTemplate::getApplicableSkus,
                        CouponTemplate::getMinSpendAmount,
                        CouponTemplate::getValidStartTime,
                        CouponTemplate::getApplicableStores,
                        CouponTemplate::getReceiveLimitPerUser,
                        CouponTemplate::getValidDaysFromReceive)
                // 查询关联商家属性
                .select(Merchant::getLogoUrl)
                // 指定字段别名
                .selectAs(CouponTemplate::getAuditBy, CouponTemplateAuditDetailBO::getAuditId)
                .selectAs(CouponTemplate::getId, CouponTemplateAuditDetailBO::getCouponTemplateId)
                .selectAs(CouponTemplate::getLogoUrl, CouponTemplateAuditDetailBO::getCouponLogoUrl)
                .selectAs(Merchant::getName, CouponTemplateAuditDetailBO::getMerchantName)
                .selectAs(Merchant::getLogoUrl, CouponTemplateAuditDetailBO::getMerchantLogoUrl)
                // 构建查询条件
                .eq(CouponTemplate::getId, couponTemplateId);

        /* step-2 执行查询 */
        CouponTemplateAuditDetailBO bo = baseMapper.selectJoinOne(CouponTemplateAuditDetailBO.class, wrapper);
        if (ObjUtil.isNull(bo)) {
            return R.ok(new CouponTemplateAuditDetailVO());
        }

        /* step-2 填充其他属性 */
        switch (bo.getType()) {
            case COUPON_TYPE_CASH -> bo.setDiscountRate(BigDecimal.ZERO);
            case COUPON_TYPE_DISCOUNT -> bo.setDiscountAmount(BigDecimal.ZERO);
        }
        CouponTemplateAuditDetailVO vo = BeanUtil.copyProperties(bo, CouponTemplateAuditDetailVO.class);
        // 填充审核人名称
        if (ObjUtil.isNotNull(bo.getAuditId())) {
            R<List<UserNameVO>> remoteResult = remoteUserService.getUserNames(List.of(bo.getAuditId()));
            if (remoteResult.isOk() && CollUtil.isNotEmpty(remoteResult.getData())) {
                vo.setAuditName(remoteResult.getData().get(0).getUserName());
            }
        }
        // 填充适用门店映射
        if (StrUtil.isNotBlank(bo.getApplicableStores())) {
            List<StoreSimpleInfoVO> stores = storeService.getStoreSimpleInfo(JSONUtil.toList(bo.getApplicableStores(), Long.class));
            vo.setAvailableStores(stores);
        }
        // 填充适用商品映射
        if (StrUtil.isNotBlank(bo.getApplicableSkus())) {
            List<ProductSkuSimpleInfoVO> skus = productSkuService.getSkuSimpleInfoWithCategory(JSONUtil.toList(bo.getApplicableSkus(), Long.class));
            vo.setAvailableSkus(skus);
        }

        return R.ok(vo);
    }


    /**
     * 初始化优惠券模板关联商家查询条件
     *
     * @return 优惠券模板关联商家查询条件
     */
    private MPJLambdaWrapper<CouponTemplate> initCouponTemplateJoinMerchantWrapper() {
        return new MPJLambdaWrapper<>(CouponTemplate.class)
                // 查询优惠券模板属性
                .select(CouponTemplate::getId,
                        CouponTemplate::getName,
                        CouponTemplate::getType,
                        CouponTemplate::getScope,
                        CouponTemplate::getEnable,
                        CouponTemplate::getLogoUrl,
                        CouponTemplate::getSummary,
                        CouponTemplate::getMerchantId,
                        CouponTemplate::getCreatedTime,
                        CouponTemplate::getCouponStatus,
                        CouponTemplate::getDiscountRate,
                        CouponTemplate::getValidityType,
                        CouponTemplate::getTotalQuantity,
                        CouponTemplate::getDiscountAmount)
                // 查询关联商家属性
                .select(Merchant::getName)
                // 表关联
                .leftJoin(Merchant.class, Merchant::getId, CouponTemplate::getMerchantId);
    }


    /**
     * 获取当前操作用户ID
     *
     * @return 当前操作用户ID
     */
    private Long getPrincipalId() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            throw new RuntimeException("用户未登录");
        }
        return user.getId();
    }


}