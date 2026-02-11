package cn.joywon.poco.merchant.MerchantModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.CursorQueryVO;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.bo.MerchantCouponGroupBO;
import cn.joywon.poco.merchant.CouponModule.bo.UserClaimedCouponCountBO;
import cn.joywon.poco.merchant.CouponModule.service.ICouponTemplateService;
import cn.joywon.poco.merchant.CouponModule.service.IUserCouponService;
import cn.joywon.poco.merchant.CouponModule.vo.MiniCouponIndexShowVO;
import cn.joywon.poco.merchant.MerchantModule.bo.MiniMerchantIndexBO;
import cn.joywon.poco.merchant.MerchantModule.bo.QualificationBO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreCacheBO;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.Store;
import cn.joywon.poco.merchant.MerchantModule.repository.IStoreCacheRepository;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.MerchantModule.service.IMiniMerchantService;
import cn.joywon.poco.merchant.MerchantModule.service.IStoreService;
import cn.joywon.poco.merchant.MerchantModule.util.StoreInfoReplace;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantIndexVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantInfoVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantQualificationVO;
import cn.joywon.poco.merchant.ProductModule.bo.MerchantProductGroupBO;
import cn.joywon.poco.merchant.ProductModule.service.ProductCategoryService;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import cn.joywon.poco.merchant.ProductModule.vo.MiniCategoryMenuVO;
import cn.joywon.poco.merchant.ProductModule.vo.MiniProductHomeListVO;
import cn.joywon.poco.merchant.ProductModule.vo.MiniProductIndexShowVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

import static cn.joywon.poco.merchant.MerchantModule.util.StoreInfoReplace.withinBusinessHours;

@Slf4j
@Service
@RequiredArgsConstructor
public class MiniMerchantServiceImpl implements IMiniMerchantService {

    private final IStoreService storeService;
    private final IMerchantService merchantService;
    private final ProductSkuService productSkuService;
    private final IUserCouponService userCouponService;
    private final ICouponTemplateService couponTemplateService;
    private final ProductCategoryService productCategoryService;

    private final IStoreCacheRepository storeCacheRepository;


    /**
     * 查询范围内商家列表
     *
     * @param dto 商家查询参数
     * @return 查询结果(距离升序商家列表)
     */
    @Override
    public R<CursorQueryVO<MiniMerchantListVO>> queryMerchantByRadiusAndIndustry(MiniStoreQueryDTO dto) {
        List<MiniMerchantListVO> storeListVos = new ArrayList<>();
        CursorQueryVO<MiniMerchantListVO> cursorQueryVo;

        /* step-1 获取附近门店列表 */
        cursorQueryVo = storeCacheRepository.queryStoreByRadiusAndIndustry(dto);
        if (ObjUtil.isNotEmpty(cursorQueryVo)) {
            // if - 缓存中存在数据, 使用缓存数据
            storeListVos = cursorQueryVo.getRecords();

        } else {
            // else - 缓存中没有数据, 查询数据库
            Page<StoreCacheBO> pageData = storeService.queryStoreByRadiusAndIndustry(dto);
            if (ObjUtil.isNull(pageData) || CollUtil.isEmpty(pageData.getRecords())) {
                dto.setRadius(dto.getRadius() * 10);
                pageData = storeService.queryStoreByRadiusAndIndustry(dto);
                if (ObjUtil.isNull(pageData) || CollUtil.isEmpty(pageData.getRecords())) {
                    log.error("#MiniStoreServiceImpl.queryStoreByRadiusAndIndustry() 方法查询数据有误, 无可用数据");
                    return R.failed("暂无可用商家门店");
                }
            }
            for (StoreCacheBO bo : pageData.getRecords()) {
                MiniMerchantListVO vo = BeanUtil.copyProperties(bo, MiniMerchantListVO.class);
                vo.setStoreAddress(StoreInfoReplace.replaceLocationSeparator(bo.getAddressDetail()));
                vo.setBusinessStatus(withinBusinessHours(vo.getBusinessStatus(), vo.getBusinessHours()));
                vo.setMerchantLogo(bo.getMerchantLogo());
                storeListVos.add(vo);
            }
            cursorQueryVo = new CursorQueryVO<>();
            cursorQueryVo.setSize(Long.valueOf(pageData.getSize()).intValue());
            cursorQueryVo.setTotal(Long.valueOf(pageData.getTotal()).intValue());
            cursorQueryVo.setRecords(storeListVos);

            // 将数据库查询结果写入缓存
            storeCacheRepository.upsertBatchStore(pageData.getRecords());
        }

        /* step-2 填充商家商品 & 优惠券信息 */
        fillMerchantListVO(storeListVos);

        return R.ok(cursorQueryVo);
    }


    /**
     * 根据名称查询商家列表
     *
     * @param dto 查询参数
     * @return 查询结果(距离升序商家分页列表)
     */
    @Override
    public R<PageQueryVO<MiniMerchantListVO>> queryMerchantByName(MiniStoreQueryDTO dto) {
        PageQueryVO<MiniMerchantListVO> pageData = merchantService.queryMerchantByNameWithDistance(dto);
        if (CollUtil.isEmpty(pageData.getRecords())) {
            return R.ok(pageData);
        }
        fillMerchantListVO(pageData.getRecords());

        return R.ok(pageData);
    }


    /**
     * 获取门店首页
     *
     * @param merchantId 商家ID
     * @param longitude  用户地理经度
     * @param latitude   用户地理纬度
     * @return 查询结果(商家首页信息)
     */
    @Override
    public R<MiniMerchantIndexVO> getMerchantIndex(Long merchantId, Double longitude, Double latitude) {
        /* step-1 获取商家基本信息 */
        MiniMerchantIndexBO merchantBO = merchantService.getMerchantIndexInfo(merchantId, longitude, latitude);
        if (ObjUtil.isNull(merchantBO)) {
            return R.failed("商家不存在");
        }
        MiniMerchantIndexVO vo = BeanUtil.copyProperties(merchantBO, MiniMerchantIndexVO.class);
        if (StrUtil.isNotBlank(merchantBO.getMerchantImages())) {
            vo.setMerchantImages(JSONUtil.toList(merchantBO.getMerchantImages(), String.class));
        }
        if (StrUtil.isNotBlank(merchantBO.getStoreImages())) {
            vo.setStoreImages(JSONUtil.toList(merchantBO.getStoreImages(), String.class));
        }
        Long storeCount = Db.lambdaQuery(Store.class)
                .eq(Store::getMerchantId, merchantId)
                .in(Store::getBusinessStatus, List.of(BusinessStatusEnum.STORE_OPEN, BusinessStatusEnum.STORE_RESTING))
                .count();
        vo.setBusinessStatus(StoreInfoReplace.withinBusinessHours(vo.getBusinessStatus(), vo.getBusinessHours()));
        vo.setStoreAddress(StoreInfoReplace.replaceLocationSeparator(merchantBO.getStoreAddress()));
        vo.setStoreCount(storeCount.intValue());

        /* step-2 获取商家商品信息 */
        Page<MiniProductIndexShowVO> productPageData = productSkuService.getMerchantProducts(Page.of(1, 10), merchantId);
        if (ObjUtil.isNotNull(productPageData)) {
            vo.setProductCount(Long.valueOf(productPageData.getTotal()).intValue());
            vo.setProducts(productPageData.getRecords());
        }

        /* step-3 获取商家商品分类信息 */
        if (CollUtil.isNotEmpty(vo.getProducts())) {
            Set<Long> categoryIds = vo.getProducts().stream().map(MiniProductIndexShowVO::getCategoryId).collect(Collectors.toSet());
            List<MiniCategoryMenuVO> categoryMenus = productCategoryService.getCategoryMenus(categoryIds);
            vo.setCategories(categoryMenus);
        }

        /* step-4 获取商家优惠券信息 */
        // 获取商家可用优惠券列表
        Page<Object> page = Page.of(1, 10);
        Page<MiniCouponIndexShowVO> couponPageData = couponTemplateService.getMerchantCoupons(page, merchantId);
        if (ObjUtil.isNotNull(couponPageData)) {
            vo.setCouponCount(Long.valueOf(couponPageData.getTotal()).intValue());
            vo.setCoupons(couponPageData.getRecords());
        }
        // 如果用户没有登录, 中止获取用户优惠券信息
        if (!userHasLogin()) {
            return R.ok(vo);
        }
        // 获取当前用户已领取该商家优惠券列表
        List<MiniCouponIndexShowVO> coupons = vo.getCoupons();
        List<UserClaimedCouponCountBO> userClaimedCoupons = userCouponService.checkCouponHasClaimed(
                coupons.stream().map(MiniCouponIndexShowVO::getCouponTemplateId).toList(), getCurrentUserId());
        coupons.forEach(i -> {
            i.setClaimable(true);
            i.setRemainingClaimable(i.getReceiveLimitPerUser());
        });
        // 检查用户在该商家下的优惠券是否可领 & 剩余可领数(如有)
        if (CollUtil.isNotEmpty(userClaimedCoupons)) {
            Map<Long, Integer> claimedCountMap = userClaimedCoupons.stream().collect(
                    Collectors.toMap(UserClaimedCouponCountBO::getCouponTemplateId, UserClaimedCouponCountBO::getClaimedCount));
            for (MiniCouponIndexShowVO coupon : coupons) {
                Integer claimedCount = claimedCountMap.get(coupon.getCouponTemplateId());
                if (claimedCount == null) {
                    continue;
                }
                int remainingClaimable = coupon.getReceiveLimitPerUser() - claimedCount;
                coupon.setRemainingClaimable(Math.max(remainingClaimable, 0));
                coupon.setClaimable(remainingClaimable > 0);
            }
        }

        return R.ok(vo);
    }


    /**
     * 获取商家详细信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家详细信息)
     */
    @Override
    public R<MiniMerchantInfoVO> getMerchantInfo(Long merchantId) {
        MiniMerchantInfoVO vo = merchantService.getMerchantInfo(merchantId);
        return R.ok(vo);
    }


    /**
     * 获取商家资质信息
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家资质信息)
     */
    @Override
    public R<MiniMerchantQualificationVO> getMerchantQualification(Long merchantId) {
        QualificationBO bo = merchantService.getMerchantQualification(merchantId);
        if (ObjUtil.isNull(bo)) {
            return R.failed("商家资质信息不存在");
        }
        MiniMerchantQualificationVO vo = new MiniMerchantQualificationVO();
        vo.setMerchantId(merchantId);
        vo.setLicenseNo(bo.getLicenseNo());
        vo.setLegalPerson(bo.getLegalPerson());
        if (StrUtil.isNotBlank(bo.getLicenseImage())) {
            vo.setLicenseImages(JSONUtil.toList(bo.getLicenseImage(), String.class));
        }

        return R.ok(vo);
    }


    /**
     * 获取商家图片列表
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家图片列表)
     */
    @Override
    public R<List<String>> getMerchantImages(Long merchantId) {
        String imagesJson = merchantService.getMerchantImages(merchantId);
        if (StrUtil.isBlank(imagesJson)) {
            return R.ok(List.of());
        }
        return R.ok(JSONUtil.toList(imagesJson, String.class));
    }


    /**
     * 填充商家列表商品 & 优惠券信息
     *
     * @param merchants 商家列表
     */
    private void fillMerchantListVO(List<MiniMerchantListVO> merchants) {
        Set<Long> merchantIds = merchants.stream().map(MiniMerchantListVO::getMerchantId).collect(Collectors.toSet());

        /* step-1 获取商家商品信息 */
        List<MerchantProductGroupBO> merchantProducts = productSkuService.queryMerchantProductGroups(merchantIds);
        Map<Long, List<MiniProductHomeListVO>> merchantProductMap = new HashMap<>();
        if (CollUtil.isNotEmpty(merchantProducts)) {
            merchantProductMap = merchantProducts.stream()
                    .collect(Collectors.toMap(MerchantProductGroupBO::getMerchantId, MerchantProductGroupBO::getProducts));
        }

        /* step-2 获取商家优惠券信息 */
        List<MerchantCouponGroupBO> merchantCoupons = couponTemplateService.queryMerchantCouponGroups(merchantIds);
        Map<Long, List<MiniCouponIndexShowVO>> merchantCouponMap = new HashMap<>();
        if (CollUtil.isNotEmpty(merchantCoupons)) {
            merchantCouponMap = merchantCoupons.stream()
                    .collect(Collectors.toMap(MerchantCouponGroupBO::getMerchantId, MerchantCouponGroupBO::getCoupons));
        }

        /* step-3 组装返回数据 */
        for (MiniMerchantListVO vo : merchants) {
            Long merchantId = vo.getMerchantId();
            vo.setProducts(merchantProductMap.get(merchantId));
            vo.setCoupons(merchantCouponMap.get(merchantId));
        }

    }


    private Long getCurrentUserId() {
        PocoUser user = SecurityUtils.getUser();
        Assert.notNull(user, () -> new RuntimeException("无效的登录用户"));
        return user.getId();
    }


    private boolean userHasLogin() {
        return SecurityUtils.getUser() != null;
    }


}