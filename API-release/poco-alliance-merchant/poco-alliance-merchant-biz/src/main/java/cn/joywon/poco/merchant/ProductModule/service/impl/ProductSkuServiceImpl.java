package cn.joywon.poco.merchant.ProductModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.constant.CommonConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.DataScopeFuncEnum;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantInfoVO;
import cn.joywon.poco.merchant.ProductModule.bo.MerchantProductGroupBO;
import cn.joywon.poco.merchant.ProductModule.bo.MiniProductIndexShowBO;
import cn.joywon.poco.merchant.ProductModule.definition.SkuEnabledEnum;
import cn.joywon.poco.merchant.ProductModule.dto.ProductDetailPageQueryDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductSkuCreateDTO;
import cn.joywon.poco.merchant.ProductModule.dto.ProductSkuUpdateDTO;
import cn.joywon.poco.merchant.ProductModule.entity.ProductSku;
import cn.joywon.poco.merchant.ProductModule.mapper.ProductMapper;
import cn.joywon.poco.merchant.ProductModule.mapper.ProductSkuMapper;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import cn.joywon.poco.merchant.ProductModule.vo.*;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 商品SKU服务实现类
 *
 * @author poco
 * @date 2024-12-19
 */
@Service
@AllArgsConstructor
@Slf4j
public class ProductSkuServiceImpl extends ServiceImpl<ProductSkuMapper, ProductSku> implements ProductSkuService {

    private final ProductSkuMapper productSkuMapper;
    private final ProductMapper productMapper;
    private final IMerchantService merchantService;

    @Override
    @Transactional(readOnly = true)
    public IPage<ProductDetailVO> getProductDetailPage(ProductDetailPageQueryDTO productDetailPageQueryDTO) {
        Long merchantId = currentMerchantId();
        try {
            DataScope scope = listScope("merchant_id", "created_by");
            if (merchantId != null) {
                scope.deptIds(Collections.singletonList(merchantId));
            }
            if (productDetailPageQueryDTO.getMerchantId() == null && merchantId != null) {
                productDetailPageQueryDTO.setMerchantId(merchantId);
            }
            Page<ProductDetailVO> page = new Page<>(productDetailPageQueryDTO.getPageNum(), productDetailPageQueryDTO.getPageSize());
            return productSkuMapper.getProductDetailPageByDTO(page, productDetailPageQueryDTO, scope);
        } catch (Exception e) {
            log.error("分页查询商品与SKU详情失败", e);
            Page<ProductDetailVO> page = new Page<>(productDetailPageQueryDTO.getPageNum(), productDetailPageQueryDTO.getPageSize());
            page.setRecords(Collections.emptyList());
            page.setTotal(0);
            return page;
        }
    }

    @Override
    @Transactional(readOnly = true)
    public ConsumerProductDetailVO getConsumerProductDetailByProductId(Long productId) {
        if (productId == null) {
            return null;
        }

        // 1. 查询商品主信息
        ProductVO productVO = productMapper.getProductVoById(productId, null);
        if (productVO == null) {
            return null;
        }

        // 检查商品是否已发布（消费者端只能查看已发布的商品）
        if (!"PUBLISHED".equals(productVO.getStatus())) {
            log.warn("商品未发布，无法查看详情: productId={}, status={}", productId, productVO.getStatus());
            return null;
        }

        // 2. 查询SKU列表（只查询启用的 SKU）
        List<ProductSkuVO> allSkus = baseMapper.getSkusByProductId(productId, null);
        
        // 过滤出启用状态的 SKU（消费者端只能看到启用的 SKU）
        List<ProductSkuVO> skus = allSkus.stream()
                .filter(sku -> "1".equals(sku.getEnabled()))
                .collect(Collectors.toList());
        
        // 如果没有启用的 SKU，返回 null
        if (CollUtil.isEmpty(skus)) {
            log.warn("商品没有启用的SKU，无法查看详情: productId={}", productId);
            return null;
        }

        // 3. 组装 ConsumerProductDetailVO
        ConsumerProductDetailVO result = new ConsumerProductDetailVO();
        BeanUtils.copyProperties(productVO, result);
        result.setSkus(skus);

        // 计算最低价格及其对应的原价
        if (CollUtil.isNotEmpty(skus)) {
            ProductSkuVO minPriceSku = skus.stream()
                    .min(Comparator.comparing(ProductSkuVO::getPrice))
                    .orElse(null);
            if (minPriceSku != null) {
                result.setPrice(minPriceSku.getPrice());
                result.setOriginalPrice(minPriceSku.getOriginalPrice());
            }
        }

        // 4. 聚合规格列表
        if (CollUtil.isNotEmpty(skus)) {
            // 使用 LinkedHashMap 保持规格名称的顺序
            Map<String, Set<String>> specMap = new LinkedHashMap<>();

            for (ProductSkuVO sku : skus) {
                Object specAttributesObj = sku.getSpecAttributes();
                if (specAttributesObj != null) {
                    try {
                        // 解析 JSON
                        Map<String, Object> skuSpecs;
                        if (specAttributesObj instanceof Map) {
                            skuSpecs = (Map<String, Object>) specAttributesObj;
                        } else {
                            String specStr = specAttributesObj instanceof String ? (String) specAttributesObj : JSONUtil.toJsonStr(specAttributesObj);
                            if (StrUtil.isBlank(specStr)) {
                                continue;
                            }
                            skuSpecs = JSONUtil.parseObj(specStr);
                        }

                        for (Map.Entry<String, Object> entry : skuSpecs.entrySet()) {
                            String key = entry.getKey();
                            String value = String.valueOf(entry.getValue());

                            // 使用 LinkedHashSet 保持规格值的顺序（如果需要）
                            specMap.computeIfAbsent(key, k -> new LinkedHashSet<>()).add(value);
                        }
                    } catch (Exception e) {
                        log.warn("解析SKU规格属性失败: skuId={}, specAttributes={}", sku.getId(), specAttributesObj);
                    }
                }
            }

            // 转换为 List<Map<String, Object>>
            List<Map<String, Object>> specList = new ArrayList<>();
            for (Map.Entry<String, Set<String>> entry : specMap.entrySet()) {
                Map<String, Object> specItem = new LinkedHashMap<>();
                specItem.put("name", entry.getKey());

                List<Map<String, String>> valueList = new ArrayList<>();
                for (String val : entry.getValue()) {
                    Map<String, String> valMap = new HashMap<>();
                    valMap.put("name", val);
                    valueList.add(valMap);
                }
                specItem.put("list", valueList);

                specList.add(specItem);
            }
            result.setSpecList(specList);
        }

        return result;
    }

    @Override
    public List<MerchantProductGroupBO> queryMerchantProductGroups(Collection<Long> merchantIds) {
        return productSkuMapper.queryMerchantProductGroups(merchantIds);
    }

    @Override
    public Page<MiniProductIndexShowVO> getMerchantProducts(Page<Object> page, Long merchantId) {
        Page<MiniProductIndexShowBO> boPageData = productSkuMapper.getMerchantProducts(page, merchantId);
        if (ObjUtil.isNull(boPageData) || CollUtil.isEmpty(boPageData.getRecords())) {
            return new Page<>();
        }
        List<MiniProductIndexShowVO> vos = new ArrayList<>();
        Page<MiniProductIndexShowVO> voPageData = new Page<>();
        for (MiniProductIndexShowBO bo : boPageData.getRecords()) {
            MiniProductIndexShowVO vo = BeanUtil.copyProperties(bo, MiniProductIndexShowVO.class);
            if (StrUtil.isBlank(bo.getTag())) {
                continue;
            }
            vo.setTags(JSONUtil.toList(bo.getTag(), String.class));
            vos.add(vo);
        }
        voPageData.setRecords(vos);
        voPageData.setSize(boPageData.getSize());
        voPageData.setTotal(boPageData.getTotal());
        voPageData.setCurrent(boPageData.getCurrent());

        return voPageData;
    }

    @Override
    public List<ProductSkuVO> getSkusByProductId(Long productId) {
        if (productId == null) {
            return CollUtil.newArrayList();
        }
        
        // 不使用数据权限过滤,因为:
        // 1. 商品详情查询时已经做了权限控制
        // 2. SKU 通过 product_id 关联,只要能查到商品就能查到 SKU
        // 3. 避免数据权限过滤器包装 JOIN 查询导致 SKU 被过滤
        List<ProductSkuVO> result = baseMapper.getSkusByProductId(productId, null);

        // 为每个SKU组装描述性字段
        if (CollUtil.isNotEmpty(result)) {
            result.forEach(this::assembleDescriptiveFields);
        }

        return result;
    }


    @Override
    public R<ProductSkuVO> getSkuDetail(Long skuId) {
        if (skuId == null) {
            return R.failed("SKU ID不能为空");
        }

        Long merchantId = currentMerchantId();
        DataScope scope = listScope("merchant_id", "created_by");
        if (merchantId != null) {
            scope.deptIds(Collections.singletonList(merchantId));
        }
        ProductSkuVO skuVO = baseMapper.getSkuVoById(skuId, scope);
        if (skuVO == null) {
            return R.failed("SKU不存在");
        }

        // 组装描述性字段
        assembleDescriptiveFields(skuVO);

        return R.ok(skuVO);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Long> createSku(ProductSkuCreateDTO skuCreateDTO) {
        try {
            // 参数校验
            if (skuCreateDTO == null) {
                return R.failed("SKU信息不能为空");
            }
            if (skuCreateDTO.getProductId() == null) {
                return R.failed("商品ID不能为空");
            }
            if (StrUtil.isBlank(skuCreateDTO.getSkuCode())) {
                return R.failed("SKU编码不能为空");
            }
            if (skuCreateDTO.getPrice() == null || skuCreateDTO.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                return R.failed("SKU价格必须大于0");
            }
            if (skuCreateDTO.getStock() == null || skuCreateDTO.getStock() < 0) {
                return R.failed("SKU库存不能小于0");
            }

            // 检查SKU编码是否重复
            long count = this.count(Wrappers.<ProductSku>lambdaQuery()
                    .eq(ProductSku::getSkuCode, skuCreateDTO.getSkuCode())
                    .eq(ProductSku::getIsDeleted, CommonConstants.STATUS_NORMAL));
            if (count > 0) {
                return R.failed("SKU编码已存在");
            }

            // 创建SKU
            ProductSku productSku = new ProductSku();
            BeanUtils.copyProperties(skuCreateDTO, productSku);
            
            // 手动处理 specAttributes：将 Map 转换为 JSON 字符串
            if (skuCreateDTO.getSpecAttributes() != null) {
                productSku.setSpecAttributes(JSONUtil.toJsonStr(skuCreateDTO.getSpecAttributes()));
            }
            
            if (productSku.getPrice() != null) {
                productSku.setPrice(skuCreateDTO.getPrice().setScale(2, RoundingMode.HALF_UP));
            }
            if (productSku.getOriginalPrice() != null) {
                productSku.setOriginalPrice(skuCreateDTO.getOriginalPrice().setScale(2, RoundingMode.HALF_UP));
            }
            productSku.setIsDeleted(CommonConstants.STATUS_NORMAL);
            // 初始化版本号为0
            productSku.setVersion(0);

            boolean saveResult = this.save(productSku);
            if (!saveResult) {
                return R.failed("SKU创建失败");
            }

            log.info("SKU创建成功，SKU ID: {}", productSku.getId());
            return R.ok(productSku.getId(), "SKU创建成功");

        } catch (Exception e) {
            log.error("SKU创建失败", e);
            return R.failed("SKU创建失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> updateSku(ProductSkuUpdateDTO skuUpdateDTO) {
        try {
            // 参数校验
            if (skuUpdateDTO == null || skuUpdateDTO.getId() == null) {
                return R.failed("SKU ID不能为空");
            }

            // 检查SKU是否存在
            ProductSku existSku = this.getById(skuUpdateDTO.getId());
            if (existSku == null) {
                return R.failed("SKU不存在");
            }

            // 如果更新SKU编码，检查是否重复
            if (StrUtil.isNotBlank(skuUpdateDTO.getSkuCode())
                    && !skuUpdateDTO.getSkuCode().equals(existSku.getSkuCode())) {
                long count = this.count(Wrappers.<ProductSku>lambdaQuery()
                        .eq(ProductSku::getSkuCode, skuUpdateDTO.getSkuCode())
                        .eq(ProductSku::getIsDeleted, CommonConstants.STATUS_NORMAL)
                        .ne(ProductSku::getId, skuUpdateDTO.getId()));
                if (count > 0) {
                    return R.failed("SKU编码已存在");
                }
            }

            // 更新SKU
            ProductSku productSku = new ProductSku();
            BeanUtils.copyProperties(skuUpdateDTO, productSku);
            
            // 手动处理 specAttributes：将 Map 转换为 JSON 字符串
            if (skuUpdateDTO.getSpecAttributes() != null) {
                productSku.setSpecAttributes(JSONUtil.toJsonStr(skuUpdateDTO.getSpecAttributes()));
            }
            
            if (productSku.getPrice() != null) {
                productSku.setPrice(productSku.getPrice().setScale(2, RoundingMode.HALF_UP));
            }
            if (productSku.getOriginalPrice() != null) {
                productSku.setOriginalPrice(productSku.getOriginalPrice().setScale(2, RoundingMode.HALF_UP));
            }
            productSku.setUpdatedTime(LocalDateTime.now());
            // 设置版本号用于乐观锁
            productSku.setVersion(existSku.getVersion());

            boolean updateResult = this.updateById(productSku);
            if (!updateResult) {
                return R.failed("SKU更新失败");
            }

            log.info("SKU更新成功，SKU ID: {}", productSku.getId());
            return R.ok(true, "SKU更新成功");

        } catch (Exception e) {
            log.error("SKU更新失败", e);
            return R.failed("SKU更新失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> deleteSku(Long skuId) {
        if (skuId == null) {
            return R.failed("SKU ID不能为空");
        }

        // 检查SKU是否存在
        ProductSku productSku = this.getById(skuId);
        if (productSku == null) {
            return R.failed("SKU不存在");
        }

        // 软删除SKU
        productSku.setIsDeleted(CommonConstants.STATUS_DEL);
        productSku.setUpdatedTime(LocalDateTime.now());
        boolean result = this.updateById(productSku);

        if (result) {
            log.info("SKU删除成功，SKU ID: {}", skuId);
            return R.ok(true, "SKU删除成功");
        }

        return R.failed("SKU删除失败");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> batchDeleteSkusByProductId(Long productId) {
        if (productId == null) {
            return R.failed("商品ID不能为空");
        }

        int deleteCount = baseMapper.deleteByProductId(productId, 1L);
        log.info("批量删除SKU成功，商品ID: {}，删除数量: {}", productId, deleteCount);
        return R.ok(true, "批量删除SKU成功");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> deductStock(Long skuId, Integer quantity) {
        if (skuId == null || quantity == null || quantity <= 0) {
            return R.failed("参数错误");
        }

        // 检查库存是否充足
        if (!checkStock(skuId, quantity)) {
            return R.failed("库存不足");
        }

        // 获取当前SKU信息，包括version
        ProductSku currentSku = baseMapper.selectById(skuId);
        if (currentSku == null) {
            return R.failed("SKU不存在");
        }

        // 乐观锁扣减库存，使用当前的version
        int updateCount = baseMapper.deductStock(skuId, quantity, currentSku.getVersion());
        if (updateCount > 0) {
            log.info("库存扣减成功，SKU ID: {}，扣减数量: {}", skuId, quantity);
            return R.ok(true, "库存扣减成功");
        }

        return R.failed("库存扣减失败，请重试");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> addStock(Long skuId, Integer quantity) {
        if (skuId == null || quantity == null || quantity <= 0) {
            return R.failed("参数错误");
        }

        // 乐观锁增加库存
        int updateCount = baseMapper.addStock(skuId, quantity);
        if (updateCount > 0) {
            log.info("库存增加成功，SKU ID: {}，增加数量: {}", skuId, quantity);
            return R.ok(true, "库存增加成功");
        }

        return R.failed("库存增加失败，请重试");
    }

    @Override
    public List<ProductSkuVO> batchGetSkusByProductIds(List<Long> productIds) {
        if (CollUtil.isEmpty(productIds)) {
            return CollUtil.newArrayList();
        }
        
        // 不使用数据权限过滤,原因同 getSkusByProductId
        // 商品列表查询时已经做了权限控制,这里只是批量获取 SKU
        return baseMapper.getSkusByProductIds(productIds, null);
    }

    @Override
    public Boolean checkStock(Long skuId, Integer quantity) {
        if (skuId == null || quantity == null || quantity <= 0) {
            return false;
        }

        ProductSku productSku = this.getById(skuId);
        if (productSku == null || productSku.getIsDeleted().equals(CommonConstants.STATUS_DEL)) {
            return false;
        }

        return productSku.getStock() >= quantity;
    }

    @Override
    public BigDecimal getMinPriceByProductId(Long productId) {
        if (productId == null) {
            return BigDecimal.ZERO;
        }

        List<ProductSkuVO> skus = getSkusByProductId(productId);
        if (CollUtil.isEmpty(skus)) {
            return BigDecimal.ZERO;
        }

        return skus.stream()
                .map(ProductSkuVO::getPrice)
                .min(BigDecimal::compareTo)
                .orElse(BigDecimal.ZERO);
    }

    @Override
    public BigDecimal getMaxPriceByProductId(Long productId) {
        if (productId == null) {
            return BigDecimal.ZERO;
        }

        List<ProductSkuVO> skus = getSkusByProductId(productId);
        if (CollUtil.isEmpty(skus)) {
            return BigDecimal.ZERO;
        }

        return skus.stream()
                .map(ProductSkuVO::getPrice)
                .max(BigDecimal::compareTo)
                .orElse(BigDecimal.ZERO);
    }

    @Override
    public Integer getTotalStockByProductId(Long productId) {
        if (productId == null) {
            return 0;
        }

        List<ProductSkuVO> skus = getSkusByProductId(productId);
        if (CollUtil.isEmpty(skus)) {
            return 0;
        }

        return skus.stream()
                .mapToInt(ProductSkuVO::getStock)
                .sum();
    }

    @Override
    public ProductPriceStockVO getProductPriceAndStock(Long productId) {
        if (productId == null) {
            return null;
        }

        List<ProductSkuVO> skus = getSkusByProductId(productId);
        if (CollUtil.isEmpty(skus)) {
            return null;
        }

        ProductPriceStockVO result = new ProductPriceStockVO();
        result.setProductId(productId);

        // 计算最低价格
        BigDecimal minPrice = skus.stream()
                .map(ProductSkuVO::getPrice)
                .min(BigDecimal::compareTo)
                .orElse(BigDecimal.ZERO);
        result.setMinPrice(minPrice);

        // 计算最高价格
        BigDecimal maxPrice = skus.stream()
                .map(ProductSkuVO::getPrice)
                .max(BigDecimal::compareTo)
                .orElse(BigDecimal.ZERO);
        result.setMaxPrice(maxPrice);

        result.setTotalStock(getTotalStockByProductId(productId));

        return result;
    }

    @Override
    public List<ProductSkuSimpleInfoVO> getSkuSimpleInfoWithMerchant(Collection<Long> skuIds) {
        return productSkuMapper.getSkuSimpleInfoWithMerchant(skuIds);
    }

    @Override
    public List<ProductSkuSimpleInfoVO> getSkuSimpleInfoWithCategory(Collection<Long> skuIds) {
        return productSkuMapper.getSkuSimpleInfoWithCategory(skuIds);
    }

    @Override
    public List<ProductSkuVO> batchGetSkuDetails(List<Long> skuIds) {
        if (CollUtil.isEmpty(skuIds)) {
            return CollUtil.newArrayList();
        }
        Long merchantId = currentMerchantId();
        DataScope scope = listScope("merchant_id", "created_by");
        if (merchantId != null) {
            scope.deptIds(Collections.singletonList(merchantId));
        }

        List<ProductSkuVO> skuVos = productSkuMapper.getSkuVoByIds(skuIds, scope);

        // 组装描述性字段
        if (CollUtil.isNotEmpty(skuVos)) {
            for (ProductSkuVO skuVO : skuVos) {
                assembleDescriptiveFields(skuVO);
            }
        }

        return skuVos;
    }

    /**
     * 获取当前登录用户的商家ID
     * 
     * 注意：此方法之前错误地使用了 user.getDeptId()，该值是租户ID（tenant_id），而不是商家ID（merchant_id）
     * 修复后通过 merchantService.getInfo() 获取真实的商家ID
     * 
     * @return 商家ID，如果无法获取则返回 null
     */
    private Long currentMerchantId() {
        try {
            // 调用 MerchantService 获取当前登录用户的商家信息
            R<MerchantInfoVO> merchantInfoResult = merchantService.getInfo();
            
            // 检查返回结果是否成功
            if (merchantInfoResult != null && merchantInfoResult.getData() != null) {
                return merchantInfoResult.getData().getId();
            }
        } catch (Exception e) {
            // 捕获异常，避免影响业务流程
            log.warn("获取当前商家ID失败", e);
        }
        return null;
    }

    private DataScope listScope(String deptColumn, String userColumn) {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    /**
     * 组装ProductSkuVO的描述性字段
     *
     * @param skuVO SKU VO
     */
    private void assembleDescriptiveFields(ProductSkuVO skuVO) {
        if (skuVO == null) {
            return;
        }

        // 组装启用状态描述
        skuVO.setEnabledDesc(getEnabledDescription(skuVO.getEnabled()));
    }

    /**
     * 获取启用状态描述
     *
     * @param enabled 启用状态
     * @return 状态描述
     */
    private String getEnabledDescription(String enabled) {
        if (StrUtil.isBlank(enabled)) {
            return "未知状态";
        }

        // 使用枚举获取描述
        SkuEnabledEnum enabledEnum = SkuEnabledEnum.getByCode(enabled);
        return enabledEnum != null ? enabledEnum.getDescription() : "未知状态";
    }
}
