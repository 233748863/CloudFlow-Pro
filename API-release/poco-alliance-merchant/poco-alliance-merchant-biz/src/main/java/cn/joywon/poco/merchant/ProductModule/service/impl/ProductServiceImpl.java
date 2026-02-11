

package cn.joywon.poco.merchant.ProductModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.map.MapUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.constant.CommonConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.ProductModule.definition.ProductStatusEnum;
import cn.joywon.poco.merchant.ProductModule.definition.ProductTypeEnum;
import cn.joywon.poco.merchant.ProductModule.dto.*;
import cn.joywon.poco.merchant.ProductModule.entity.Product;
import cn.joywon.poco.merchant.ProductModule.entity.ProductSku;
import cn.joywon.poco.merchant.ProductModule.mapper.ProductMapper;
import cn.joywon.poco.merchant.ProductModule.mapper.ProductCategoryMapper;
import cn.joywon.poco.merchant.ProductModule.service.ProductService;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import cn.joywon.poco.merchant.ProductModule.vo.ProductListVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuVO;
import cn.joywon.poco.merchant.ProductModule.vo.ProductVO;
import cn.joywon.poco.merchant.OrderModule.mapper.OrderItemMapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.DataScopeFuncEnum;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.redis.core.RedisTemplate;
import java.util.concurrent.TimeUnit;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import java.util.Comparator;

/**
 * 商品服务实现类
 *
 * @author poco
 * @date 2025-11-01
 */
@Service
@AllArgsConstructor
@Slf4j
public class ProductServiceImpl extends ServiceImpl<ProductMapper, Product> implements ProductService {

    private final ProductSkuService productSkuService;
    private final IMerchantService merchantService;
    private final RedisTemplate<String, Object> redisTemplate;
    private final OrderItemMapper orderItemMapper;
    private final ProductCategoryMapper productCategoryMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Long> createProduct(ProductCreateDTO productCreateDTO) {
        String idempotencyKey = null;
        
        try {
            // 1. 数据验证
            validateProductCreate(productCreateDTO);
            
            // 2. 幂等性控制
            idempotencyKey = generateIdempotencyKey("create", productCreateDTO.getIdempotencyKey());
            if (!checkAndSetIdempotencyKey(idempotencyKey)) {
                return R.failed("请勿重复提交");
            }
            
            // 3. 设置商家ID
            productCreateDTO.setMerchantId(merchantService.getInfo().getData().getId());
            
            // 4. 创建商品SPU
            Product product = new Product();
            product.setMerchantId(productCreateDTO.getMerchantId());
            product.setCategoryId(productCreateDTO.getCategoryId());
            product.setName(productCreateDTO.getName());
            product.setDescription(productCreateDTO.getDescription());
            product.setType(productCreateDTO.getType());
            product.setMainImage(productCreateDTO.getMainImage());
            product.setDetailImages(productCreateDTO.getDetailImages());
            
            // 处理 detailDescription 字段：如果为空则设置为空对象,避免存储 NULL
            if (productCreateDTO.getDetailDescription() == null) {
                product.setDetailDescription(MapUtil.newHashMap());
            } else {
                product.setDetailDescription(productCreateDTO.getDetailDescription());
            }
            
            product.setTags(productCreateDTO.getTags());
            product.setSortWeight(productCreateDTO.getSortWeight());
            
            // 处理 attributes 字段：如果为空则设置为空数组,避免存储 NULL
            if (productCreateDTO.getAttributes() == null) {
                product.setAttributes(CollUtil.newArrayList());
            } else {
                product.setAttributes(productCreateDTO.getAttributes());
            }
            
            // 设置默认状态为草稿
            product.setStatus(ProductStatusEnum.DRAFT.getCode());
            product.setIsDeleted(CommonConstants.STATUS_NORMAL);
            product.setCreatedTime(LocalDateTime.now());
            product.setUpdatedTime(LocalDateTime.now());

            // 保存商品
            boolean saveResult = this.save(product);
            if (!saveResult) {
                throw new RuntimeException("商品保存失败");
            }

            // 5. 批量创建SKU
            batchCreateSkus(product.getId(), productCreateDTO.getSkus());

            // 6. 记录操作日志
            try {
                var user = SecurityUtils.getUser();
                Long userId = user != null ? user.getId() : null;
                log.info("商品创建成功 - 用户ID: {}, 商品ID: {}, 商品名称: {}", 
                        userId, product.getId(), product.getName());
            } catch (Exception e) {
                log.info("商品创建成功 - 商品ID: {}, 商品名称: {}", product.getId(), product.getName());
            }

            return R.ok(product.getId(), "商品创建成功");

        } catch (IllegalArgumentException e) {
            // 验证错误，清除幂等性键并返回错误信息
            if (idempotencyKey != null) {
                clearIdempotencyKey(idempotencyKey);
            }
            log.warn("商品创建验证失败: {}", e.getMessage());
            return R.failed(e.getMessage());
        } catch (Exception e) {
            // 其他异常，清除幂等性键并抛出
            if (idempotencyKey != null) {
                clearIdempotencyKey(idempotencyKey);
            }
            log.error("商品创建失败", e);
            throw new RuntimeException("商品创建失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> updateProduct(ProductUpdateDTO productUpdateDTO) {
        String idempotencyKey = null;
        
        try {
            // 1. 数据验证
            validateProductUpdate(productUpdateDTO);
            
            // 2. 检查商品是否存在
            Product existProduct = this.getById(productUpdateDTO.getId());
            if (existProduct == null) {
                return R.failed("商品不存在");
            }
            
            // 3. 权限验证
            validateProductAccess(productUpdateDTO.getId());
            
            // 4. 幂等性控制（可选）
            if (StrUtil.isNotBlank(productUpdateDTO.getIdempotencyKey())) {
                idempotencyKey = generateIdempotencyKey("update", productUpdateDTO.getIdempotencyKey());
                if (!checkAndSetIdempotencyKey(idempotencyKey)) {
                    return R.failed("请勿重复提交");
                }
            }
            
            // 5. 更新商品SPU（部分更新）
            Product product = new Product();
            product.setId(productUpdateDTO.getId());
            
            // 只更新提供的字段
            if (productUpdateDTO.getCategoryId() != null) {
                product.setCategoryId(productUpdateDTO.getCategoryId());
            }
            if (productUpdateDTO.getName() != null) {
                product.setName(productUpdateDTO.getName());
            }
            if (productUpdateDTO.getDescription() != null) {
                product.setDescription(productUpdateDTO.getDescription());
            }
            if (productUpdateDTO.getType() != null) {
                product.setType(productUpdateDTO.getType());
            }
            if (productUpdateDTO.getStatus() != null) {
                product.setStatus(productUpdateDTO.getStatus());
            }
            if (productUpdateDTO.getMainImage() != null) {
                product.setMainImage(productUpdateDTO.getMainImage());
            }
            if (productUpdateDTO.getDetailImages() != null) {
                product.setDetailImages(productUpdateDTO.getDetailImages());
            }
            if (productUpdateDTO.getDetailDescription() != null) {
                product.setDetailDescription(productUpdateDTO.getDetailDescription());
            }
            if (productUpdateDTO.getTags() != null) {
                product.setTags(productUpdateDTO.getTags());
            }
            if (productUpdateDTO.getSortWeight() != null) {
                product.setSortWeight(productUpdateDTO.getSortWeight());
            }
            
            // 处理 attributes 字段：直接设置,不做空值判断
            if (productUpdateDTO.getAttributes() != null) {
                product.setAttributes(productUpdateDTO.getAttributes());
            }
            
            product.setUpdatedTime(LocalDateTime.now());
            
            // 设置版本号用于乐观锁
            if (productUpdateDTO.getVersion() != null) {
                product.setVersion(productUpdateDTO.getVersion());
            } else {
                product.setVersion(existProduct.getVersion());
            }

            // 执行更新
            boolean updateResult = this.updateById(product);
            if (!updateResult) {
                // 乐观锁冲突或其他更新失败
                return R.failed("商品更新失败，可能存在并发冲突，请刷新后重试");
            }

            // 6. 智能更新SKU
            if (CollUtil.isNotEmpty(productUpdateDTO.getSkus())) {
                smartUpdateSkus(product.getId(), productUpdateDTO.getSkus());
            }

            // 7. 记录操作日志
            try {
                var user = SecurityUtils.getUser();
                Long userId = user != null ? user.getId() : null;
                log.info("商品更新成功 - 用户ID: {}, 商品ID: {}, 商品名称: {}", 
                        userId, product.getId(), existProduct.getName());
            } catch (Exception e) {
                log.info("商品更新成功 - 商品ID: {}, 商品名称: {}", product.getId(), existProduct.getName());
            }

            return R.ok(true, "商品更新成功");

        } catch (IllegalArgumentException e) {
            // 验证错误或权限错误，清除幂等性键并返回错误信息
            if (idempotencyKey != null) {
                clearIdempotencyKey(idempotencyKey);
            }
            log.warn("商品更新验证失败: {}", e.getMessage());
            return R.failed(e.getMessage());
        } catch (Exception e) {
            // 其他异常，清除幂等性键并抛出
            if (idempotencyKey != null) {
                clearIdempotencyKey(idempotencyKey);
            }
            log.error("商品更新失败", e);
            throw new RuntimeException("商品更新失败: " + e.getMessage());
        }
    }

    @Override
    public R<ProductVO> getProductDetail(Long productId) {
        if (productId == null) {
            return R.failed("商品ID不能为空");
        }

        // 创建数据权限范围对象，让系统自动根据用户角色计算权限
        DataScope scope = listScope("merchant_id", "created_by");
        
        ProductVO productVO = baseMapper.getProductVoById(productId, scope);
        if (productVO == null) {
            return R.failed("商品不存在");
        }

        // 组装描述性字段
        assembleDescriptiveFields(productVO);

        // 获取SKU列表
        List<ProductSkuVO> skuList = productSkuService.getSkusByProductId(productId);
        productVO.setSkus(skuList);

        return R.ok(productVO);
    }


    @Override
    public IPage<ProductListVO> getProductPage(Page<ProductListVO> page, ProductQueryDTO queryDTO) {
        // 创建数据权限范围对象
        // 设置部门字段为 merchant_id，用户字段为 created_by
        // 系统会根据当前用户的角色自动计算数据权限范围：
        // - 如果角色是"全部数据"权限，可以看到所有商家的商品
        // - 如果角色是"本级及子级"权限，可以看到当前商家及下级商家的商品
        // - 如果角色是"本级"权限，只能看到当前商家的商品
        // - 如果角色是"本人"权限，只能看到自己创建的商品
        DataScope scope = listScope("merchant_id", "created_by");
        
        IPage<ProductListVO> productListPage = baseMapper.getProductListPage(page, queryDTO, scope);

        // 若分页无记录，直接返回
        if (productListPage == null || CollUtil.isEmpty(productListPage.getRecords())) {
            return productListPage;
        }

        // 先组装描述性字段（类型、状态文案等）
        productListPage.getRecords().forEach(this::assembleDescriptiveFields);

        // 批量拉取SKU并分组，避免N+1查询
        // 收集商品ID（去除null）
        List<Long> productIds = productListPage.getRecords().stream()
                .map(ProductListVO::getId)
                .filter(id -> id != null)
                .collect(Collectors.toList());

        if (CollUtil.isEmpty(productIds)) {
            // 无有效商品ID，回填空列表，保证响应结构一致性
            for (ProductListVO vo : productListPage.getRecords()) {
                vo.setSkus(Collections.emptyList());
            }
            return productListPage;
        }

        // 批量获取SKU列表
        List<ProductSkuVO> skuList = productSkuService.batchGetSkusByProductIds(productIds);

        // 按商品ID分组
        Map<Long, List<ProductSkuVO>> skuMap =
                (skuList == null ?Collections.<ProductSkuVO>emptyList() : skuList)
                        .stream()
                        .collect(Collectors.groupingBy(ProductSkuVO::getProductId));

        // 回填到每条记录，缺省为空列表，避免null
        for (ProductListVO vo : productListPage.getRecords()) {
            List<ProductSkuVO> skus = skuMap.getOrDefault(vo.getId(), Collections.emptyList());
            vo.setSkus(skus);
        }

        return productListPage;
    }

    @Override
    public IPage<ProductListVO> getConsumerProductPage(Page<ProductListVO> page, ProductQueryDTO queryDTO) {
        if (queryDTO == null) {
            queryDTO = new ProductQueryDTO();
        }
        if (StrUtil.isBlank(queryDTO.getStatus())) {
            queryDTO.setStatus(ProductStatusEnum.PUBLISHED.getCode());
        }
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        scope.setSkip(true);
        IPage<ProductListVO> productListPage = baseMapper.getProductListPage(page, queryDTO, scope);
        if (productListPage == null || CollUtil.isEmpty(productListPage.getRecords())) {
            return productListPage;
        }
        productListPage.getRecords().forEach(this::assembleDescriptiveFields);
        List<Long> productIds = productListPage.getRecords().stream()
                .map(ProductListVO::getId)
                .filter(id -> id != null)
                .collect(Collectors.toList());
        if (CollUtil.isEmpty(productIds)) {
            for (ProductListVO vo : productListPage.getRecords()) {
                vo.setSkus(Collections.emptyList());
            }
            return productListPage;
        }
        List<ProductSkuVO> skuList = productSkuService.batchGetSkusByProductIds(productIds);
        Map<Long, List<ProductSkuVO>> skuGroup = skuList.stream().collect(Collectors.groupingBy(ProductSkuVO::getProductId));

        for (ProductListVO vo : productListPage.getRecords()) {
            List<ProductSkuVO> skus = skuGroup.getOrDefault(vo.getId(), Collections.emptyList());
            vo.setSkus(skus);

            // 设置最低价格SKU
            if (CollUtil.isNotEmpty(skus)) {
                ProductSkuVO minSku = skus.stream()
                        .min(Comparator.comparing(ProductSkuVO::getPrice))
                        .orElse(null);
                if (minSku != null) {
                    vo.setMinPriceSku(minSku);
                    vo.setMinPriceSkuOriginalPrice(minSku.getOriginalPrice());
                }
            }
        }
        return productListPage;
    }

    @Override
    public List<ProductListVO> getProductsByMerchantId(Long merchantId) {
        if (merchantId == null) {
            return CollUtil.newArrayList();
        }
        
        // 创建数据权限范围对象，让系统自动根据用户角色计算权限
        DataScope scope = listScope("merchant_id", "created_by");
        
        List<ProductListVO> result = baseMapper.getProductsByMerchantId(merchantId, ProductStatusEnum.PUBLISHED.getCode(), scope);

        // 为每个商品组装描述性字段
        if (CollUtil.isNotEmpty(result)) {
            result.forEach(this::assembleDescriptiveFields);
        }

        return result;
    }

    @Override
    public List<ProductListVO> getProductsByCategoryId(Long categoryId) {
        if (categoryId == null) {
            return CollUtil.newArrayList();
        }
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        scope.setSkip(true);
        List<ProductListVO> result = baseMapper.getProductsByCategoryId(categoryId, ProductStatusEnum.PUBLISHED.getCode(), scope);

        // 为每个商品组装描述性字段
        if (CollUtil.isNotEmpty(result)) {
            result.forEach(this::assembleDescriptiveFields);
        }

        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> deleteProduct(Long productId) {
        if (productId == null) {
            return R.failed("商品ID不能为空");
        }

        // 检查商品是否存在
        Product product = this.getById(productId);
        if (product == null) {
            return R.failed("商品不存在");
        }

        // 权限校验：通过数据权限机制验证用户是否有权限删除该商品
        DataScope scope = listScope("merchant_id", "created_by");
        ProductVO productVO = baseMapper.getProductVoById(productId, scope);
        if (productVO == null) {
            return R.failed("无权删除该商品");
        }

        // 软删除商品
        product.setIsDeleted(CommonConstants.STATUS_DEL);
        product.setUpdatedTime(LocalDateTime.now());
        boolean result = this.updateById(product);

        if (result) {
            // 删除关联的SKU
            productSkuService.batchDeleteSkusByProductId(productId);
            log.info("商品删除成功，商品ID: {}", productId);
            return R.ok(true, "商品删除成功");
        }

        return R.failed("商品删除失败");
    }

    /**
     * 创建列表查询的数据权限范围对象
     * 
     * @param deptColumn 部门字段名（如 merchant_id）
     * @param userColumn 用户字段名（如 created_by）
     * @return DataScope 数据权限范围对象
     */
    private DataScope listScope(String deptColumn, String userColumn) {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> batchDeleteProducts(List<Long> productIds) {
        if (CollUtil.isEmpty(productIds)) {
            return R.failed("商品ID列表不能为空");
        }

        try {
            for (Long productId : productIds) {
                R<Boolean> result = deleteProduct(productId);
                if (!result.isOk()) {
                    throw new RuntimeException("批量删除商品失败，商品ID: " + productId);
                }
            }
            return R.ok(true, "批量删除商品成功");
        } catch (Exception e) {
            log.error("批量删除商品失败", e);
            throw new RuntimeException("批量删除商品失败: " + e.getMessage());
        }
    }

    @Override
    public R<Boolean> updateProductStatus(Long productId, String status) {
        if (productId == null || StrUtil.isBlank(status)) {
            return R.failed("商品ID和状态不能为空");
        }

        // 权限校验：通过数据权限机制验证用户是否有权限更新该商品
        DataScope scope = listScope("merchant_id", "created_by");
        ProductVO productVO = baseMapper.getProductVoById(productId, scope);
        if (productVO == null) {
            return R.failed("商品不存在或无权更新");
        }

        Product product = new Product();
        product.setId(productId);
        product.setStatus(status);
        product.setUpdatedTime(LocalDateTime.now());

        boolean result = this.updateById(product);
        return result ? R.ok(true, "状态更新成功") : R.failed("状态更新失败");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> batchUpdateProductStatus(List<Long> productIds, String status) {
        if (CollUtil.isEmpty(productIds) || StrUtil.isBlank(status)) {
            return R.failed("商品ID列表和状态不能为空");
        }

        // 权限校验：验证用户对这些商品是否有权限
        // 通过数据权限查询，只会返回用户有权限的商品
        DataScope scope = listScope("merchant_id", "created_by");
        ProductQueryDTO queryDTO = new ProductQueryDTO();
        queryDTO.setPageNum(1);
        queryDTO.setPageSize(productIds.size());
        Page<ProductListVO> page = new Page<>(1, productIds.size());
        IPage<ProductListVO> accessibleProducts = baseMapper.getProductListPage(page, queryDTO, scope);
        
        // 获取用户有权限访问的商品ID列表
        List<Long> accessibleProductIds = accessibleProducts.getRecords().stream()
                .map(ProductListVO::getId)
                .filter(productIds::contains)  // 只保留请求中的商品ID
                .collect(Collectors.toList());

        if (CollUtil.isEmpty(accessibleProductIds)) {
            return R.failed("没有权限更新这些商品");
        }

        // 只更新有权限的商品
        int updateCount = baseMapper.batchUpdateStatus(accessibleProductIds, status, 1L);
        
        if (updateCount > 0) {
            if (updateCount < productIds.size()) {
                return R.ok(true, String.format("成功更新 %d 个商品，%d 个商品无权限", 
                    updateCount, productIds.size() - updateCount));
            }
            return R.ok(true, "批量状态更新成功");
        }
        
        return R.failed("批量状态更新失败");
    }

    @Override
    public R<Boolean> publishProduct(Long productId) {
        return updateProductStatus(productId, ProductStatusEnum.PUBLISHED.getCode());
    }

    @Override
    public R<Boolean> unpublishProduct(Long productId) {
        return updateProductStatus(productId, ProductStatusEnum.DRAFT.getCode());
    }

    @Override
    public R<Boolean> archiveProduct(Long productId) {
        return updateProductStatus(productId, ProductStatusEnum.ARCHIVED.getCode());
    }

    @Override
    public R<Boolean> toggleProductStatus(ProductToggleStatusDTO input) {
        if (input == null || CollUtil.isEmpty(input.getIds()) || input.getStatus() == null) {
            return R.failed("参数不能为空");
        }

        // 权限校验：验证用户对这些商品是否有权限
        // 通过数据权限查询，只会返回用户有权限的商品
        DataScope scope = listScope("merchant_id", "created_by");
        ProductQueryDTO queryDTO = new ProductQueryDTO();
        queryDTO.setPageNum(1);
        queryDTO.setPageSize(input.getIds().size());
        Page<ProductListVO> page = new Page<>(1, input.getIds().size());
        IPage<ProductListVO> accessibleProducts = baseMapper.getProductListPage(page, queryDTO, scope);
        
        // 获取用户有权限访问的商品ID列表
        List<Long> accessibleProductIds = accessibleProducts.getRecords().stream()
                .map(ProductListVO::getId)
                .filter(input.getIds()::contains)  // 只保留请求中的商品ID
                .collect(Collectors.toList());

        if (CollUtil.isEmpty(accessibleProductIds)) {
            return R.failed("没有权限更新这些商品");
        }

        // 只更新有权限的商品
        LambdaUpdateWrapper<Product> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.set(Product::getStatus, input.getStatus().getCode());
        updateWrapper.in(Product::getId, accessibleProductIds);
        int result = baseMapper.update(null, updateWrapper);

        if (result > 0) {
            if (result < input.getIds().size()) {
                return R.ok(true, String.format("成功更新 %d 个商品，%d 个商品无权限", 
                    result, input.getIds().size() - result));
            }
            return R.ok(true, "状态更新成功");
        }
        
        return R.failed("状态更新失败");
    }

    /**
     * 组装ProductVO的描述性字段
     * @param productVO 商品VO
     */
    private void assembleDescriptiveFields(ProductVO productVO) {
        if (productVO == null) {
            return;
        }

        // 分类名称已通过连表查询直接获取，无需额外处理

        // 组装商品类型描述
        productVO.setTypeDesc(getTypeDescription(productVO.getType()));

        // 组装商品状态描述
        productVO.setStatusDesc(getStatusDescription(productVO.getStatus()));
    }

    /**
     * 组装ProductListVO的描述性字段
     * @param productListVO 商品列表VO
     */
    private void assembleDescriptiveFields(ProductListVO productListVO) {
        if (productListVO == null) {
            return;
        }

        // 分类名称已通过连表查询直接获取，无需额外处理

        // 组装商品类型描述
        productListVO.setTypeDesc(getTypeDescription(productListVO.getType()));

        // 组装商品状态描述
        productListVO.setStatusDesc(getStatusDescription(productListVO.getStatus()));
    }

    /**
     * 获取商品类型描述
     * @param type 商品类型
     * @return 类型描述
     */
    private String getTypeDescription(String type) {
        if (StrUtil.isBlank(type)) {
            return "未知类型";
        }

        // 使用枚举获取描述
        ProductTypeEnum typeEnum = ProductTypeEnum.getByCode(type);
        return typeEnum != null ? typeEnum.getDescription() : "未知类型";
    }

    /**
     * 获取商品状态描述
     * @param status 商品状态
     * @return 状态描述
     */
    private String getStatusDescription(String status) {
        if (StrUtil.isBlank(status)) {
            return "未知状态";
        }

        // 使用枚举获取描述
        ProductStatusEnum statusEnum = ProductStatusEnum.getByCode(status);
        return statusEnum != null ? statusEnum.getDescription() : "未知状态";
    }

    // ========== 幂等性控制相关方法 ==========

    /**
     * 生成幂等性键
     * 格式：poco:merchant:product:{operation}:idempotency:{tenantId}:{userId}:{userKey}
     * 
     * @param operation 操作类型（create/update）
     * @param userKey 用户提供的幂等性键
     * @return 完整的幂等性键
     */
    private String generateIdempotencyKey(String operation, String userKey) {
        try {
            var user = SecurityUtils.getUser();
            Long tenantId = null;
            try {
                tenantId = TenantContextHolder.getTenantId();
            } catch (Exception ignored) {
                // 租户ID获取失败，使用null
            }
            String userIdStr = user != null ? String.valueOf(user.getId()) : "unknown";
            return "poco:merchant:product:" + operation + ":idempotency:" + 
                   String.valueOf(tenantId) + ":" + userIdStr + ":" + userKey;
        } catch (Exception e) {
            log.warn("生成幂等性键失败，使用简化格式", e);
            return "poco:merchant:product:" + operation + ":idempotency:unknown:" + userKey;
        }
    }

    /**
     * 检查并设置幂等性键
     * 
     * @param key 幂等性键
     * @return true-设置成功（键不存在），false-键已存在（重复提交）
     */
    private boolean checkAndSetIdempotencyKey(String key) {
        try {
            Boolean setRes = redisTemplate.opsForValue().setIfAbsent(key, "1", 10, TimeUnit.MINUTES);
            return setRes != null && setRes;
        } catch (Exception e) {
            // Redis不可用时，记录警告但允许操作继续
            log.warn("Redis不可用，幂等性控制失效，键: {}", key, e);
            return true; // 允许操作继续
        }
    }

    /**
     * 清除幂等性键（用于事务回滚）
     * 
     * @param key 幂等性键
     */
    private void clearIdempotencyKey(String key) {
        if (StrUtil.isBlank(key)) {
            return;
        }
        try {
            redisTemplate.delete(key);
            log.debug("清除幂等性键: {}", key);
        } catch (Exception e) {
            log.warn("清除幂等性键失败，键: {}", key, e);
        }
    }

    // ========== 数据验证相关方法 ==========

    /**
     * 验证商品创建数据
     * 
     * @param dto 商品创建DTO
     * @throws IllegalArgumentException 验证失败时抛出异常
     */
    private void validateProductCreate(ProductCreateDTO dto) {
        if (dto == null) {
            throw new IllegalArgumentException("商品信息不能为空");
        }
        
        // 验证商品名称
        if (StrUtil.isBlank(dto.getName())) {
            throw new IllegalArgumentException("商品名称不能为空");
        }
        if (StrUtil.isBlank(dto.getName().trim())) {
            throw new IllegalArgumentException("商品名称不能仅包含空白字符");
        }
        
        // 验证商品类型
        if (StrUtil.isBlank(dto.getType())) {
            throw new IllegalArgumentException("商品类型不能为空");
        }
        if (!"PHYSICAL".equals(dto.getType()) && !"SERVICE".equals(dto.getType())) {
            throw new IllegalArgumentException("商品类型必须是 PHYSICAL 或 SERVICE");
        }
        
        // 验证分类ID
        if (dto.getCategoryId() == null) {
            throw new IllegalArgumentException("商品分类ID不能为空");
        }
        if (!validateCategory(dto.getCategoryId())) {
            throw new IllegalArgumentException("商品分类不存在，分类ID: " + dto.getCategoryId());
        }
        
        // 验证SKU列表
        if (CollUtil.isEmpty(dto.getSkus())) {
            throw new IllegalArgumentException("商品SKU列表不能为空");
        }
        validateSkus(dto.getSkus());
        
        // 验证图片URL
        if (StrUtil.isNotBlank(dto.getMainImage())) {
            validateUrl(dto.getMainImage(), "商品主图");
        }
        if (CollUtil.isNotEmpty(dto.getDetailImages())) {
            for (int i = 0; i < dto.getDetailImages().size(); i++) {
                validateUrl(dto.getDetailImages().get(i), "商品详情图片[" + i + "]");
            }
        }
        
        // 验证幂等性键
        if (StrUtil.isBlank(dto.getIdempotencyKey())) {
            throw new IllegalArgumentException("幂等性键不能为空");
        }
    }

    /**
     * 验证商品更新数据
     * 
     * @param dto 商品更新DTO
     * @throws IllegalArgumentException 验证失败时抛出异常
     */
    private void validateProductUpdate(ProductUpdateDTO dto) {
        if (dto == null || dto.getId() == null) {
            throw new IllegalArgumentException("商品ID不能为空");
        }
        
        // 验证商品名称（如果提供）
        if (dto.getName() != null) {
            if (StrUtil.isBlank(dto.getName())) {
                throw new IllegalArgumentException("商品名称不能为空");
            }
            if (StrUtil.isBlank(dto.getName().trim())) {
                throw new IllegalArgumentException("商品名称不能仅包含空白字符");
            }
        }
        
        // 验证商品类型（如果提供）
        if (dto.getType() != null) {
            if (!"PHYSICAL".equals(dto.getType()) && !"SERVICE".equals(dto.getType())) {
                throw new IllegalArgumentException("商品类型必须是 PHYSICAL 或 SERVICE");
            }
        }
        
        // 验证分类ID（如果提供）
        if (dto.getCategoryId() != null) {
            if (!validateCategory(dto.getCategoryId())) {
                throw new IllegalArgumentException("商品分类不存在，分类ID: " + dto.getCategoryId());
            }
        }
        
        // 验证SKU列表（如果提供）
        if (CollUtil.isNotEmpty(dto.getSkus())) {
            validateSkus(dto.getSkus());
        }
        
        // 验证图片URL（如果提供）
        if (StrUtil.isNotBlank(dto.getMainImage())) {
            validateUrl(dto.getMainImage(), "商品主图");
        }
        if (CollUtil.isNotEmpty(dto.getDetailImages())) {
            for (int i = 0; i < dto.getDetailImages().size(); i++) {
                validateUrl(dto.getDetailImages().get(i), "商品详情图片[" + i + "]");
            }
        }
    }

    /**
     * 验证SKU列表
     * 
     * @param skus SKU列表
     * @throws IllegalArgumentException 验证失败时抛出异常
     */
    private void validateSkus(List<? extends Object> skus) {
        if (CollUtil.isEmpty(skus)) {
            return;
        }
        
        for (int i = 0; i < skus.size(); i++) {
            Object skuObj = skus.get(i);
            BigDecimal price = null;
            BigDecimal originalPrice = null;
            Integer stock = null;
            String skuImage = null;
            
            // 根据类型提取字段
            if (skuObj instanceof ProductSkuCreateDTO) {
                ProductSkuCreateDTO sku = (ProductSkuCreateDTO) skuObj;
                price = sku.getPrice();
                originalPrice = sku.getOriginalPrice();
                stock = sku.getStock();
                skuImage = sku.getSkuImage();
                
                if (StrUtil.isBlank(sku.getSkuName())) {
                    throw new IllegalArgumentException("SKU[" + i + "]名称不能为空");
                }
            } else if (skuObj instanceof ProductSkuUpdateDTO) {
                ProductSkuUpdateDTO sku = (ProductSkuUpdateDTO) skuObj;
                price = sku.getPrice();
                originalPrice = sku.getOriginalPrice();
                stock = sku.getStock();
                skuImage = sku.getSkuImage();
                
                if (StrUtil.isBlank(sku.getSkuName())) {
                    throw new IllegalArgumentException("SKU[" + i + "]名称不能为空");
                }
            }
            
            // 验证价格
            if (price != null) {
                validatePrice(price, originalPrice, i);
            } else {
                throw new IllegalArgumentException("SKU[" + i + "]价格不能为空");
            }
            
            // 验证库存
            if (stock != null) {
                validateStock(stock, i);
            }
            
            // 验证SKU图片URL
            if (StrUtil.isNotBlank(skuImage)) {
                validateUrl(skuImage, "SKU[" + i + "]图片");
            }
        }
    }

    /**
     * 验证价格
     * 
     * @param price 价格
     * @param originalPrice 原价（可选）
     * @param index SKU索引（用于错误信息）
     * @throws IllegalArgumentException 验证失败时抛出异常
     */
    private void validatePrice(BigDecimal price, BigDecimal originalPrice, int index) {
        if (price == null) {
            throw new IllegalArgumentException("SKU[" + index + "]价格不能为空");
        }
        if (price.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("SKU[" + index + "]价格必须大于零，当前值: " + price);
        }
        
        // 验证原价与售价的关系（警告但不阻止）
        if (originalPrice != null && originalPrice.compareTo(price) < 0) {
            log.warn("SKU[{}]原价({})小于售价({})，请确认", index, originalPrice, price);
        }
    }

    /**
     * 验证库存
     * 
     * @param stock 库存
     * @param index SKU索引（用于错误信息）
     * @throws IllegalArgumentException 验证失败时抛出异常
     */
    private void validateStock(Integer stock, int index) {
        if (stock == null) {
            return; // 库存可以为空，默认值由数据库处理
        }
        if (stock < -1) {
            throw new IllegalArgumentException("SKU[" + index + "]库存必须为非负整数或-1（无限库存），当前值: " + stock);
        }
    }

    /**
     * 验证商品分类是否存在
     * 
     * @param categoryId 分类ID
     * @return true-存在，false-不存在
     */
    private boolean validateCategory(Long categoryId) {
        if (categoryId == null) {
            return false;
        }
        try {
            return productCategoryMapper.selectById(categoryId) != null;
        } catch (Exception e) {
            log.error("验证商品分类失败，分类ID: {}", categoryId, e);
            return false;
        }
    }

    /**
     * 验证URL格式
     * 支持以下格式：
     * 1. 完整URL：http://example.com/image.jpg 或 https://example.com/image.jpg
     * 2. 相对路径：/uploads/image.jpg 或 /admin/sys-file/oss/file?fileName=xxx
     * 3. 对象存储路径：oss://bucket/path/image.jpg
     * 
     * @param url URL字符串
     * @param fieldName 字段名称（用于错误信息）
     * @throws IllegalArgumentException URL格式不正确时抛出异常
     */
    private void validateUrl(String url, String fieldName) {
        if (StrUtil.isBlank(url)) {
            return;
        }
        
        // 支持的URL格式：
        // 1. 完整URL：http:// 或 https://
        // 2. 相对路径：以 / 开头
        // 3. 对象存储路径：oss:// 等协议
        boolean isValidUrl = url.startsWith("http://") 
                          || url.startsWith("https://") 
                          || url.startsWith("/")
                          || url.startsWith("oss://")
                          || url.startsWith("s3://");
        
        if (!isValidUrl) {
            throw new IllegalArgumentException(
                fieldName + "URL格式不正确，必须是完整URL（http://或https://）、相对路径（/开头）或对象存储路径: " + url
            );
        }
        
        // 检查URL长度（防止过长的URL）
        if (url.length() > 2048) {
            throw new IllegalArgumentException(fieldName + "URL长度超过限制（最大2048字符）");
        }
    }

    // ========== 权限验证相关方法 ==========

    /**
     * 验证用户是否有权访问指定商品
     * 
     * @param productId 商品ID
     * @throws IllegalArgumentException 无权限时抛出异常
     */
    private void validateProductAccess(Long productId) {
        if (productId == null) {
            throw new IllegalArgumentException("商品ID不能为空");
        }
        
        // 使用数据权限机制验证
        DataScope scope = listScope("merchant_id", "created_by");
        ProductVO productVO = baseMapper.getProductVoById(productId, scope);
        
        if (productVO == null) {
            // 记录安全日志
            try {
                var user = SecurityUtils.getUser();
                Long userId = user != null ? user.getId() : null;
                log.warn("权限验证失败 - 用户ID: {}, 尝试访问商品ID: {}", userId, productId);
            } catch (Exception e) {
                log.warn("权限验证失败 - 尝试访问商品ID: {}", productId);
            }
            throw new IllegalArgumentException("无权访问该商品或商品不存在");
        }
    }

    // ========== SKU 智能更新相关方法 ==========

    /**
     * 批量创建SKU
     * 使用 MyBatis-Plus 的 saveBatch 方法进行批量插入，提高性能
     * 
     * @param productId 商品ID
     * @param skuDTOs SKU创建DTO列表
     */
    private void batchCreateSkus(Long productId, List<ProductSkuCreateDTO> skuDTOs) {
        if (CollUtil.isEmpty(skuDTOs)) {
            return;
        }
        
        log.info("批量创建SKU，商品ID: {}, SKU数量: {}", productId, skuDTOs.size());
        
        // 转换 DTO 为实体类
        List<ProductSku> skuList = new ArrayList<>(skuDTOs.size());
        for (int i = 0; i < skuDTOs.size(); i++) {
            ProductSkuCreateDTO skuDTO = skuDTOs.get(i);
            
            // 数据验证（简化版，关键字段验证）
            if (StrUtil.isBlank(skuDTO.getSkuCode())) {
                throw new RuntimeException("SKU[" + i + "]编码不能为空");
            }
            if (skuDTO.getPrice() == null || skuDTO.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                throw new RuntimeException("SKU[" + i + "]价格必须大于0");
            }
            if (skuDTO.getStock() == null || skuDTO.getStock() < 0) {
                throw new RuntimeException("SKU[" + i + "]库存不能小于0");
            }
            
            // 创建实体对象
            ProductSku productSku = new ProductSku();
            productSku.setProductId(productId);
            productSku.setSkuName(skuDTO.getSkuName());
            productSku.setSkuCode(skuDTO.getSkuCode());
            productSku.setPrice(skuDTO.getPrice().setScale(2, RoundingMode.HALF_UP));
            
            if (skuDTO.getOriginalPrice() != null) {
                productSku.setOriginalPrice(skuDTO.getOriginalPrice().setScale(2, RoundingMode.HALF_UP));
            }
            
            productSku.setStock(skuDTO.getStock());
            productSku.setWarningStock(skuDTO.getWarningStock() != null ? skuDTO.getWarningStock() : 0);
            
            // 处理 specAttributes：将 Map 转换为 JSON 字符串
            if (skuDTO.getSpecAttributes() != null) {
                productSku.setSpecAttributes(JSONUtil.toJsonStr(skuDTO.getSpecAttributes()));
            }
            
            productSku.setSkuImage(skuDTO.getSkuImage());
            productSku.setWeight(skuDTO.getWeight() != null ? skuDTO.getWeight() : 0);
            productSku.setVolume(skuDTO.getVolume() != null ? skuDTO.getVolume() : 0);
            productSku.setMarketingConfig(skuDTO.getMarketingConfig());
            productSku.setEnabled(skuDTO.getEnabled() != null ? skuDTO.getEnabled() : "1");
            productSku.setSortWeight(skuDTO.getSortWeight() != null ? skuDTO.getSortWeight() : 0);
            productSku.setIsDeleted(CommonConstants.STATUS_NORMAL);
            productSku.setVersion(0);
            productSku.setCreatedTime(LocalDateTime.now());
            productSku.setUpdatedTime(LocalDateTime.now());
            
            skuList.add(productSku);
        }
        
        // 批量插入（MyBatis-Plus 会自动分批，默认每批1000条）
        boolean batchResult = productSkuService.saveBatch(skuList);
        if (!batchResult) {
            throw new RuntimeException("SKU批量创建失败");
        }
        
        log.info("SKU批量创建成功，共创建 {} 条记录", skuList.size());
    }

    /**
     * 智能更新SKU
     * 策略：
     * 1. 如果SKU包含ID且存在，则更新
     * 2. 如果SKU不包含ID，则创建新SKU
     * 3. 如果现有SKU不在更新列表中，则软删除
     * 
     * @param productId 商品ID
     * @param skuDTOs SKU更新DTO列表
     */
    private void smartUpdateSkus(Long productId, List<ProductSkuUpdateDTO> skuDTOs) {
        if (CollUtil.isEmpty(skuDTOs)) {
            log.info("SKU列表为空，跳过SKU更新");
            return;
        }
        
        log.info("智能更新SKU，商品ID: {}, 提供的SKU数量: {}", productId, skuDTOs.size());
        
        // 1. 获取现有SKU列表
        List<ProductSkuVO> existingSkus = productSkuService.getSkusByProductId(productId);
        Map<Long, ProductSkuVO> existingSkuMap = existingSkus.stream()
                .collect(Collectors.toMap(ProductSkuVO::getId, sku -> sku));
        
        log.debug("现有SKU数量: {}", existingSkus.size());
        
        // 2. 收集更新请求中的SKU ID
        Set<Long> updatedSkuIds = new HashSet<>();
        
        // 3. 处理每个SKU
        for (int i = 0; i < skuDTOs.size(); i++) {
            ProductSkuUpdateDTO skuDTO = skuDTOs.get(i);
            
            if (skuDTO.getId() != null && existingSkuMap.containsKey(skuDTO.getId())) {
                // 情况1：SKU包含ID且存在，执行更新
                log.debug("更新现有SKU，ID: {}, 名称: {}", skuDTO.getId(), skuDTO.getSkuName());
                
                R<Boolean> updateResult = productSkuService.updateSku(skuDTO);
                if (!updateResult.isOk()) {
                    throw new RuntimeException("SKU[" + i + "]更新失败: " + updateResult.getMsg());
                }
                
                updatedSkuIds.add(skuDTO.getId());
            } else {
                // 情况2：SKU不包含ID或ID不存在，创建新SKU
                log.debug("创建新SKU，名称: {}", skuDTO.getSkuName());
                
                ProductSkuCreateDTO createDTO = new ProductSkuCreateDTO();
                BeanUtils.copyProperties(skuDTO, createDTO);
                createDTO.setProductId(productId);
                
                R<Long> createResult = productSkuService.createSku(createDTO);
                if (!createResult.isOk()) {
                    throw new RuntimeException("SKU[" + i + "]创建失败: " + createResult.getMsg());
                }
                
                log.debug("新SKU创建成功，ID: {}", createResult.getData());
            }
        }
        
        // 4. 软删除不在更新列表中的SKU
        for (ProductSkuVO existingSku : existingSkus) {
            if (!updatedSkuIds.contains(existingSku.getId())) {
                // 检查是否关联了未完成的订单
                if (hasActiveOrders(existingSku.getId())) {
                    throw new RuntimeException("SKU[" + existingSku.getSkuName() + "]关联了未完成的订单，无法删除");
                }
                
                log.debug("软删除SKU，ID: {}, 名称: {}", existingSku.getId(), existingSku.getSkuName());
                softDeleteSku(existingSku.getId());
            }
        }
        
        log.info("SKU智能更新完成，更新: {}, 新增: {}, 删除: {}", 
                updatedSkuIds.size(), 
                skuDTOs.size() - updatedSkuIds.size(),
                existingSkus.size() - updatedSkuIds.size());
    }

    /**
     * 检查SKU是否关联了未完成的订单
     * 
     * @param skuId SKU ID
     * @return true-有关联订单，false-无关联订单
     */
    private boolean hasActiveOrders(Long skuId) {
        if (skuId == null) {
            return false;
        }
        
        try {
            // 查询是否有未完成的订单项关联该SKU
            // 未完成的订单状态包括：待支付、已支付、配送中等
            Long count = orderItemMapper.selectCount(
                new LambdaUpdateWrapper<cn.joywon.poco.merchant.OrderModule.entity.OrderItem>()
                    .eq(cn.joywon.poco.merchant.OrderModule.entity.OrderItem::getProductSkuId, skuId)
            );
            
            return count != null && count > 0;
        } catch (Exception e) {
            log.error("检查SKU关联订单失败，SKU ID: {}", skuId, e);
            // 出错时保守处理，认为有关联订单
            return true;
        }
    }

    /**
     * 软删除SKU
     * 
     * @param skuId SKU ID
     */
    private void softDeleteSku(Long skuId) {
        if (skuId == null) {
            return;
        }
        
        try {
            productSkuService.deleteSku(skuId);
            log.debug("SKU软删除成功，ID: {}", skuId);
        } catch (Exception e) {
            log.error("SKU软删除失败，ID: {}", skuId, e);
            throw new RuntimeException("SKU删除失败: " + e.getMessage());
        }
    }
}
