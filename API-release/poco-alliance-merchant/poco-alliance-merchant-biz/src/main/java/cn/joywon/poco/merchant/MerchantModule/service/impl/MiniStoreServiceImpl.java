package cn.joywon.poco.merchant.MerchantModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.CouponModule.bo.UserClaimedCouponCountBO;
import cn.joywon.poco.merchant.CouponModule.service.ICouponTemplateService;
import cn.joywon.poco.merchant.CouponModule.service.IUserCouponService;
import cn.joywon.poco.merchant.CouponModule.vo.MiniCouponIndexShowVO;
import cn.joywon.poco.merchant.MerchantModule.bo.QualificationBO;
import cn.joywon.poco.merchant.MerchantModule.dto.MiniStoreQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreCacheDTO;
import cn.joywon.poco.merchant.MerchantModule.repository.IStoreCacheRepository;
import cn.joywon.poco.merchant.MerchantModule.service.IMiniStoreService;
import cn.joywon.poco.merchant.MerchantModule.service.IStoreService;
import cn.joywon.poco.merchant.MerchantModule.util.DistanceUtil;
import cn.joywon.poco.merchant.MerchantModule.util.StoreInfoReplace;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniMerchantListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreIndexVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MiniStoreQualificationVO;
import cn.joywon.poco.merchant.PlatformModule.definition.NavigationMenuTypeEnum;
import cn.joywon.poco.merchant.PlatformModule.service.INavigationMenuService;
import cn.joywon.poco.merchant.PlatformModule.vo.MiniNavigationMenuVO;
import cn.joywon.poco.merchant.ProductModule.service.ProductCategoryService;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import cn.joywon.poco.merchant.ProductModule.vo.MiniCategoryMenuVO;
import cn.joywon.poco.merchant.ProductModule.vo.MiniProductIndexShowVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MiniStoreServiceImpl implements IMiniStoreService {

    private final IStoreService storeService;
    private final ProductSkuService productSkuService;
    private final IUserCouponService userCouponService;
    private final ICouponTemplateService couponTemplateService;
    private final INavigationMenuService navigationMenuService;
    private final ProductCategoryService productCategoryService;

    private final IStoreCacheRepository storeCacheRepository;


    /**
     * 查询商家下的门店列表
     *
     * @param merchantId 商家ID
     * @param longitude  用户地理经度
     * @param latitude   用户地理纬度
     * @return 查询结果(门店列表)
     */
    @Override
    public R<List<MiniStoreListVO>> queryStoreListByMerchantId(Long merchantId, Double longitude, Double latitude) {
        List<MiniStoreListVO> vos = storeService.queryStoreListByMerchantId(merchantId, longitude, latitude);
        vos.forEach(vo ->
                vo.setBusinessStatus(StoreInfoReplace.withinBusinessHours(vo.getBusinessStatus(), vo.getBusinessHours())));
        return R.ok(vos);
    }


    /**
     * 用户获取范围内门店列表
     *
     * @param dto 门店查询参数
     * @return 查询结果(门店缓存分页列表)
     */
    @Override
    public R<MiniMerchantListVO> getStoreListByRadius(MiniStoreQueryDTO dto) {
        MiniMerchantListVO vo = storeCacheRepository.getStoreListByRadius(dto);
        vo.setBusinessStatus(StoreInfoReplace.withinBusinessHours(vo.getBusinessStatus(), vo.getBusinessHours()));
        vo.setStoreAddress(StoreInfoReplace.replaceLocationSeparator(vo.getStoreAddress()));
        return R.ok(vo);
    }


    /**
     * 获取门店详情信息
     *
     * @param storeId   门店ID
     * @param longitude 经度
     * @param latitude  纬度
     * @return 查询结果(门店首页详情)
     */
    @Override
    public R<MiniStoreIndexVO> getStoreIndex(Long storeId, Double longitude, Double latitude) {
        MiniStoreIndexVO vo = new MiniStoreIndexVO();
        StoreCacheDTO storeCache = storeCacheRepository.getStoreById(storeId.toString());
        if (storeCache != null) {
            BeanUtil.copyProperties(storeCache, vo);
            vo.setStoreId(storeId);
            vo.setStoreName(storeCache.getName());
            vo.setStorePhone(storeCache.getPhone());
            vo.setStoreLogo(storeCache.getLogoUrl());
            vo.setStoreAddress(storeCache.getAddressDetail());
            vo.setStoreImages(getStoreImages(storeId, false).getData());
            vo.setStoreAddress(StoreInfoReplace.replaceLocationSeparator(vo.getStoreAddress()));
            vo.setBusinessStatus(StoreInfoReplace.withinBusinessHours(vo.getBusinessStatus(), vo.getBusinessHours()));
            vo.setDistance(
                    !(latitude != null && longitude != null) ? 0.0 :
                            DistanceUtil.calculateDistance(vo.getLatitude(), vo.getLongitude(), latitude, longitude)
            );
        } else {
            vo = storeService.getStoreIndex(storeId, longitude, latitude);
            if (vo == null) {
                return R.failed("门店不存在");
            }
            vo.setStoreAddress(StoreInfoReplace.replaceLocationSeparator(vo.getStoreAddress()));
            vo.setStoreImages(JSONUtil.toList(vo.getImages(), String.class));
            vo.setImages(null);
        }

        Long merchantId = vo.getMerchantId();

        /* step-4 获取商家商品 */
        Page<Object> page = Page.of(1, 10);
        Page<MiniProductIndexShowVO> productPageData = productSkuService.getMerchantProducts(page, merchantId);
        if (!ObjUtil.isEmpty(productPageData.getRecords())) {
            vo.setProducts(productPageData.getRecords());
            vo.setProductCount(Long.valueOf(productPageData.getTotal()).intValue());
        }

        /* step-3 获取商家商品分类 */
        if (!CollUtil.isEmpty(vo.getProducts())) {
            Set<Long> categoryIds = vo.getProducts().stream().map(MiniProductIndexShowVO::getCategoryId).collect(Collectors.toSet());
            List<MiniCategoryMenuVO> categoryMenus = productCategoryService.getCategoryMenus(categoryIds);
            vo.setCategories(categoryMenus);
        }

        /* step-5 获取商家导航菜单 */
        List<MiniNavigationMenuVO> naviMenu = navigationMenuService.getMiniNavigationMenuTree(merchantId, NavigationMenuTypeEnum.SIDE);
        vo.setNaviMenus(naviMenu);

        /* step-6 获取商家可用优惠券列表 */
        page = Page.of(1, 10);
        Page<MiniCouponIndexShowVO> couponPageData = couponTemplateService.getMerchantCoupons(page, merchantId);
        if (!ObjUtil.isNull(couponPageData)) {
            vo.setCouponCount(Long.valueOf(couponPageData.getTotal()).intValue());
            vo.setCoupons(couponPageData.getRecords());
        }
        // 获取当前用户已领取该商家优惠券列表
        if (!userHasLogin()) {
            return R.ok(vo);
        }
        List<MiniCouponIndexShowVO> coupons = vo.getCoupons();
        List<UserClaimedCouponCountBO> userClaimedCoupons = userCouponService.checkCouponHasClaimed(
                coupons.stream().map(MiniCouponIndexShowVO::getCouponTemplateId).toList(), getCurrentUserId());
        coupons.forEach(i -> {
            i.setRemainingClaimable(i.getReceiveLimitPerUser());
            i.setClaimable(true);
        });
        // 检查用户在该商家下的优惠券是否可领 & 剩余可领数(如有)
        if (!CollUtil.isEmpty(userClaimedCoupons)) {
            Map<Long, Integer> claimedCountMap = userClaimedCoupons.stream().collect(
                    Collectors.toMap(UserClaimedCouponCountBO::getCouponTemplateId, UserClaimedCouponCountBO::getClaimedCount));
            for (MiniCouponIndexShowVO coupon : coupons) {
                Integer claimedCount = claimedCountMap.get(coupon.getCouponTemplateId());
                if (claimedCount != null) {
                    int remainingClaimable = coupon.getReceiveLimitPerUser() - claimedCount;
                    coupon.setRemainingClaimable(Math.max(remainingClaimable, 0));
                    coupon.setClaimable(remainingClaimable > 0);
                }
            }
        }

        return R.ok(vo);
    }


    /**
     * 获取门店图片列表
     *
     * @param storeId 门店ID
     * @param allShow 是否展示所有图片
     * @return 查询结果(门店图片列表)
     */
    @Override
    public R<List<String>> getStoreImages(Long storeId, Boolean allShow) {
        String imagesJson = storeService.getStoreImages(storeId, allShow);
        if (StrUtil.isBlank(imagesJson)) {
            return R.ok(List.of());
        }
        return R.ok(JSONUtil.toList(imagesJson, String.class));
    }


    /**
     * 获取门店资质信息
     *
     * @param storeId 门店ID
     * @return 查询结果(门店资质信息)
     */
    @Override
    public R<MiniStoreQualificationVO> getStoreQualification(Long storeId) {
        QualificationBO bo = storeService.getStoreQualification(storeId);
        if (ObjUtil.isNull(bo)) {
            return R.failed("门店资质信息不存在");
        }
        MiniStoreQualificationVO vo = new MiniStoreQualificationVO();
        vo.setStoreId(storeId);
        vo.setLicenseNo(bo.getLicenseNo());
        if (StrUtil.isNotBlank(bo.getLicenseImage())) {
            vo.setLicenseImages(JSONUtil.toList(bo.getLicenseImage(), String.class));
        }
        return R.ok(vo);
    }


    private Long getCurrentUserId() {
        PocoUser user = SecurityUtils.getUser();
        Assert.notNull(user, () -> new CheckedException("无效的登录用户"));
        return user.getId();
    }


    private boolean userHasLogin() {
        return SecurityUtils.getUser() != null;
    }

}