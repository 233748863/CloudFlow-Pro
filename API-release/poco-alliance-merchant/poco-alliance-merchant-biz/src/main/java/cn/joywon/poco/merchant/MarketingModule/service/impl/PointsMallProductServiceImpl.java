package cn.joywon.poco.merchant.MarketingModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.service.ICouponTemplateService;
import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallCacheKey;
import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallProductEnum;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductCreateDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductOnOffShelfDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductUpdateDTO;
import cn.joywon.poco.merchant.MarketingModule.entity.PointsMallCategory;
import cn.joywon.poco.merchant.MarketingModule.entity.PointsMallProduct;
import cn.joywon.poco.merchant.MarketingModule.mapper.PointsMallProductMapper;
import cn.joywon.poco.merchant.MarketingModule.repository.IPointsMallProductCacheRepository;
import cn.joywon.poco.merchant.MarketingModule.service.IPointsMallCategoryService;
import cn.joywon.poco.merchant.MarketingModule.service.IPointsMallProductService;
import com.baomidou.lock.annotation.Lock4j;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointsMallProductServiceImpl extends
        ServiceImpl<PointsMallProductMapper, PointsMallProduct> implements IPointsMallProductService {

    private final ICouponTemplateService couponTemplateService;
    private final IPointsMallCategoryService pointsMallCategoryService;
    private final IPointsMallProductCacheRepository pointsMallProductCacheRepository;


    /**
     * 创建积分商城商品
     *
     * @param dto 积分商城商品创建参数
     * @return 操作结果
     */
    @Override
    public R<?> createProduct(PointsMallProductCreateDTO dto) {
        // 检查商品分类
        validateCategory(dto.getCategoryId());
        // 检查优惠券模板(如有)
        if (ObjUtil.equal(dto.getType(), PointsMallProductEnum.VIRTUAL_COUPON.getValue())) {
            Assert.notBlank(dto.getCouponId(), () -> new CheckedException("商品创建失败, 商品类型为虚拟券时关联的优惠券不能为空"));
            validateCouponTemplate(dto.getCouponId());
        }

        PointsMallProduct entity = BeanUtil.copyProperties(dto, PointsMallProduct.class);
        initProductImages(entity, dto.getImages());

        return save(entity) ? R.ok() : R.failed("商品创建失败, 请重试");
    }


    /**
     * 删除积分商城商品
     *
     * @param id 商品ID
     * @return 操作结果
     */
    @Override
    public R<?> deleteProduct(String id) {
        PointsMallProduct entity = getById(id);
        Assert.notNull(entity, () -> new CheckedException("商品删除失败, 商品不存在"));

        entity.setDeleted(true);
        entity.setDeletedTime(LocalDateTime.now());

        return updateById(entity) ? R.ok() : R.failed("商品删除失败, 请重试");
    }


    /**
     * 更新积分商城商品
     *
     * @param dto 积分商城商品更新参数
     * @return 操作结果
     */
    @Override
    public R<?> updateProduct(PointsMallProductUpdateDTO dto) {
        // 检查商品状态
        PointsMallProduct entity = getById(dto.getId());
        Assert.notNull(entity, () -> new CheckedException("商品更新失败, 商品不存在"));
        // 检查商品分类(如有)
        if (StrUtil.isNotBlank(dto.getCategoryId())) {
            validateCategory(dto.getCategoryId());
        }
        // 检查优惠券模板(如有)
        if (StrUtil.isNotBlank(dto.getCouponId()) && entity.getType() == PointsMallProductEnum.VIRTUAL_COUPON) {
            validateCouponTemplate(dto.getCouponId());
        }

        CopyOptions copier = CopyOptions.create().ignoreNullValue();
        BeanUtil.copyProperties(dto, entity, copier);
        initProductImages(entity, dto.getImages());

        return updateById(entity) ? R.ok() : R.failed("商品更新失败, 请重试");
    }


    /**
     * 发布积分商城商品
     *
     * @param dto 商品上/下架参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    @Lock4j(name = PointsMallCacheKey.LOCK_KEY_PREFIX_PRODUCT, keys = {"#dto.id"})
    public R<?> onOffShelfProduct(PointsMallProductOnOffShelfDTO dto) {
        PointsMallProduct entity = getById(dto.getId());
        Assert.notNull(entity, () -> new CheckedException("操作失败, 商品不存在"));
        if (dto.getOnShelf()) {
            Assert.isTrue(entity.getStock() != 0, () -> new CheckedException("操作失败, 商品库存当前为0"));
        }

        // 上架操作
        boolean result;
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime shelfTime = dto.getOnOffShelfTime();
        if (dto.getOnShelf()) {
            if (shelfTime == null || shelfTime.isBefore(now)) {
                // 即刻上架
                entity.setOnShelf(true);
                entity.setStatus(PointsMallProductEnum.ON_SHELF);
                result = updateById(entity);
                Assert.isTrue(result, () -> new CheckedException("积分商品上架操作失败, 请重试"));
            } else {
                // 定时上架
                entity.setStatus(PointsMallProductEnum.PENDING_ON_SHELF);
                result = updateById(entity);
                Assert.isTrue(result, () -> new CheckedException("积分商品上架操作失败, 请重试"));
                result = pointsMallProductCacheRepository.pendingOnOrOffShelf(dto);
                Assert.isTrue(result, () -> new CheckedException("积分商品上架操作失败, 请重试"));
            }
            return R.ok();
        }

        // 下架操作
        if (shelfTime == null || shelfTime.isBefore(now)) {
            // 即刻下架
            entity.setStatus(PointsMallProductEnum.OFF_SHELF);
            result = updateById(entity);
            Assert.isTrue(result, () -> new CheckedException("积分商品下架操作失败, 请重试"));
        } else {
            // 定时下架
            result = pointsMallProductCacheRepository.pendingOnOrOffShelf(dto);
            Assert.isTrue(result, () -> new CheckedException("积分商品下架操作失败, 请重试"));
        }

        return R.ok();
    }


    /**
     * 积分商城商品上/下架(消息监听处理调用)
     *
     * @param productId 商品ID
     * @param onShelf   商品上/下架
     */
    @Override
    @Lock4j(name = PointsMallCacheKey.LOCK_KEY_PREFIX_PRODUCT, keys = "#productId")
    public boolean onOffShelfByMessage(String productId, boolean onShelf) {
        PointsMallProduct entity = getById(productId);
        Assert.notNull(entity, () -> new CheckedException("处理积分商品上/下架消息失败, 商品不存在"));

        if (onShelf) {
            entity.setOnShelf(true);
            entity.setStatus(PointsMallProductEnum.ON_SHELF);
        } else {
            entity.setOnShelf(false);
            entity.setStatus(PointsMallProductEnum.OFF_SHELF);
        }

        return updateById(entity);
    }


    /**
     * 检查商品分类状态
     *
     * @param categoryId 商品分类ID
     */
    private void validateCategory(Serializable categoryId) {
        PointsMallCategory category = pointsMallCategoryService.getById(categoryId);
        Assert.notNull(category, () -> new CheckedException("操作失败, 商品分类不存在"));
        Assert.isTrue(category.getEnable(), () -> new CheckedException("操作失败, 商品分类已被禁用"));
        Assert.isTrue(category.getDepth() > 1, () -> new CheckedException("操作失败, 不能在当前层级分类下创建商品"));
    }


    /**
     * 检查优惠券模板状态
     *
     * @param templateId 优惠券模板ID
     */
    private void validateCouponTemplate(Serializable templateId) {
        CouponTemplate template = couponTemplateService.getById(templateId);
        Assert.notNull(template, () -> new CheckedException("操作失败, 关联的优惠券不存在"));
        Assert.isTrue(template.getEnable(), () -> new CheckedException("操作失败, 关联的优惠券已被禁用"));
        Assert.isTrue(ObjUtil.equal(template.getCouponStatus(), CouponStatusEnum.TEMPLATE_ACTIVE.getValue()),
                () -> new CheckedException("操作失败, 优惠券模板不在可用状态"));
    }


    /**
     * 初始化商品图片
     *
     * @param entity 商品实体
     * @param images 商品图片列表
     */
    private void initProductImages(PointsMallProduct entity, List<String> images) {
        if (CollUtil.isNotEmpty(images)) {
            entity.setImage(JSONUtil.toJsonStr(images));
        }
    }


}