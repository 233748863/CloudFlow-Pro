package cn.joywon.poco.merchant.CartModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.CartModule.dto.CartAddDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartBatchDeleteDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartSkuUpdateDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartUpdateDTO;
import cn.joywon.poco.merchant.CartModule.entity.CartItem;
import cn.joywon.poco.merchant.CartModule.mapper.CartMapper;
import cn.joywon.poco.merchant.CartModule.service.CartService;
import cn.joywon.poco.merchant.CartModule.vo.CartGroupVO;
import cn.joywon.poco.merchant.CartModule.vo.CartItemVO;
import cn.joywon.poco.merchant.CartModule.vo.CartOperationResultVO;
import cn.joywon.poco.merchant.ProductModule.entity.ProductSku;
import cn.joywon.poco.merchant.ProductModule.mapper.ProductSkuMapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 购物车服务实现类
 *
 * @author poco
 * @date 2024-12-25
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CartServiceImpl extends ServiceImpl<CartMapper, CartItem> implements CartService {

    private final ProductSkuMapper productSkuMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "cart", key = "#result.data.totalItems != null ? #root.target.getCurrentUserId() : ''", condition = "#result.code == 0")
    public R<CartOperationResultVO> addCart(CartAddDTO cartAddDTO) {
        try {
            Long userId = getCurrentUserId();
            if (userId == null) {
                return R.failed("用户未登录");
            }

            log.info("用户{}添加购物车，SKU ID: {}, 数量: {}", userId, cartAddDTO.getSkuId(), cartAddDTO.getQuantity());

            // 1. 检查SKU是否存在且启用
            ProductSku sku = productSkuMapper.selectById(cartAddDTO.getSkuId());
            if (sku == null || "1".equals(sku.getIsDeleted())) {
                return R.failed("商品SKU不存在");
            }
            if ("0".equals(sku.getEnabled())) {
                return R.failed("商品SKU已禁用");
            }

            // 2. 检查库存
            if (sku.getStock() != -1 && sku.getStock() < cartAddDTO.getQuantity()) {
                return R.failed("库存不足");
            }

            // 3. 检查是否已存在相同SKU
            CartItem existingItem = baseMapper.getByUserIdAndSkuId(userId, cartAddDTO.getSkuId());
            if (existingItem != null) {
                // 原子更新数量: UPDATE cart_items SET quantity = quantity + ? WHERE id = ?
                boolean update = this.update(new UpdateWrapper<CartItem>()
                        .setSql("quantity = quantity + " + cartAddDTO.getQuantity())
                        .eq("id", existingItem.getId()));
                if (!update) {
                    return R.failed("添加失败，请重试");
                }
            } else {
                // 新增购物车项
                Long merchantId = productSkuMapper.getMerchantIdBySkuId(cartAddDTO.getSkuId());
                if (merchantId == null) {
                    return R.failed("商品信息不完整");
                }
                
                CartItem cartItem = new CartItem();
                cartItem.setUserId(userId);
                cartItem.setMerchantId(merchantId);
                cartItem.setProductId(sku.getProductId());
                cartItem.setSkuId(cartAddDTO.getSkuId());
                cartItem.setQuantity(cartAddDTO.getQuantity());
                this.save(cartItem);
            }

            return R.ok(getCartStats(userId));
        } catch (Exception e) {
            log.error("添加购物车失败", e);
            return R.failed("添加购物车失败: " + e.getMessage());
        }
    }

    @Override
    @Cacheable(value = "cart", key = "#root.target.getCurrentUserId()", unless = "#result.code != 0")
    public R<List<CartGroupVO>> getCartList() {
        try {
            Long userId = getCurrentUserId();
            if (userId == null) {
                return R.failed("用户未登录");
            }

            // 1. 查询购物车列表
            List<CartItemVO> cartItems = baseMapper.getCartListByUserId(userId);
            if (CollUtil.isEmpty(cartItems)) {
                return R.ok(new ArrayList<>());
            }

            // 2. 按商家分组
            Map<Long, List<CartItemVO>> groupedByMerchant = cartItems.stream()
                    .collect(Collectors.groupingBy(CartItemVO::getMerchantId));

            // 3. 组装返回数据
            List<CartGroupVO> result = new ArrayList<>();
            for (Map.Entry<Long, List<CartItemVO>> entry : groupedByMerchant.entrySet()) {
                CartGroupVO groupVO = new CartGroupVO();
                groupVO.setMerchantId(entry.getKey());
                groupVO.setMerchantName(entry.getValue().get(0).getMerchantName());
                groupVO.setItems(entry.getValue());

                // 计算总金额
                BigDecimal totalAmount = entry.getValue().stream()
                        .map(item -> item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                groupVO.setTotalAmount(totalAmount);

                result.add(groupVO);
            }

            return R.ok(result);
        } catch (Exception e) {
            log.error("获取购物车列表失败", e);
            return R.failed("获取购物车列表失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "cart", key = "#result.data.totalItems != null ? #root.target.getCurrentUserId() : ''", condition = "#result.code == 0")
    public R<CartOperationResultVO> updateCart(CartUpdateDTO cartUpdateDTO) {
        try {
            Long userId = getCurrentUserId();
            if (userId == null) {
                return R.failed("用户未登录");
            }

            log.info("用户{}更新购物车，ID: {}, 数量: {}", userId, cartUpdateDTO.getId(), cartUpdateDTO.getQuantity());

            // 1. 查询购物车项
            CartItem cartItem = this.getById(cartUpdateDTO.getId());
            if (cartItem == null || !cartItem.getUserId().equals(userId)) {
                return R.failed("购物车项不存在");
            }

            // 2. 检查库存
            ProductSku sku = productSkuMapper.selectById(cartItem.getSkuId());
            if (sku == null) {
                return R.failed("商品SKU不存在");
            }
            if (sku.getStock() != -1 && sku.getStock() < cartUpdateDTO.getQuantity()) {
                return R.failed("库存不足");
            }

            // 3. 更新数量
            cartItem.setQuantity(cartUpdateDTO.getQuantity());
            this.updateById(cartItem);

            return R.ok(getCartStats(userId));
        } catch (Exception e) {
            log.error("更新购物车失败", e);
            return R.failed("更新购物车失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "cart", key = "#result.data.totalItems != null ? #root.target.getCurrentUserId() : ''", condition = "#result.code == 0")
    public R<CartOperationResultVO> updateCartSku(CartSkuUpdateDTO cartSkuUpdateDTO) {
        try {
            Long userId = getCurrentUserId();
            if (userId == null) {
                return R.failed("用户未登录");
            }

            log.info("用户{}更新购物车SKU，ID: {}, 新SKU ID: {}", userId, cartSkuUpdateDTO.getId(), cartSkuUpdateDTO.getNewSkuId());

            // 1. 查询原购物车项
            CartItem cartItem = this.getById(cartSkuUpdateDTO.getId());
            if (cartItem == null || !cartItem.getUserId().equals(userId)) {
                return R.failed("购物车项不存在");
            }

            // 2. 检查新SKU
            ProductSku newSku = productSkuMapper.selectById(cartSkuUpdateDTO.getNewSkuId());
            if (newSku == null || "1".equals(newSku.getIsDeleted())) {
                return R.failed("商品SKU不存在");
            }
            if ("0".equals(newSku.getEnabled())) {
                return R.failed("商品SKU已禁用");
            }

            // 3. 确定数量
            int quantity = cartSkuUpdateDTO.getQuantity() != null ? cartSkuUpdateDTO.getQuantity() : cartItem.getQuantity();

            // 4. 检查库存
            if (newSku.getStock() != -1 && newSku.getStock() < quantity) {
                return R.failed("库存不足");
            }

            // 5. 检查是否已存在该SKU的购物车项（合并逻辑）
            CartItem existingItem = baseMapper.getByUserIdAndSkuId(userId, cartSkuUpdateDTO.getNewSkuId());
            if (existingItem != null && !existingItem.getId().equals(cartItem.getId())) {
                // 合并到 existingItem
                int newQuantity = existingItem.getQuantity() + quantity;

                // 再次检查库存（针对合并后的数量）
                if (newSku.getStock() != -1 && newSku.getStock() < newQuantity) {
                    return R.failed("库存不足（合并后数量超出库存）");
                }

                existingItem.setQuantity(newQuantity);
                this.updateById(existingItem);

                // 删除旧项
                baseMapper.physicalDeleteById(cartItem.getId());
            } else {
                // 直接修改当前项
                cartItem.setSkuId(cartSkuUpdateDTO.getNewSkuId());
                cartItem.setProductId(newSku.getProductId());
                cartItem.setQuantity(quantity);

                this.updateById(cartItem);
            }

            return R.ok(getCartStats(userId));
        } catch (Exception e) {
            log.error("更新购物车SKU失败", e);
            return R.failed("更新购物车SKU失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "cart", key = "#result.data.totalItems != null ? #root.target.getCurrentUserId() : ''", condition = "#result.code == 0")
    public R<CartOperationResultVO> deleteCart(Long id) {
        try {
            Long userId = getCurrentUserId();
            if (userId == null) {
                return R.failed("用户未登录");
            }

            log.info("用户{}删除购物车项，ID: {}", userId, id);

            CartItem cartItem = this.getById(id);
            if (cartItem == null || !cartItem.getUserId().equals(userId)) {
                return R.failed("购物车项不存在");
            }

            baseMapper.physicalDeleteById(id);
            return R.ok(getCartStats(userId));
        } catch (Exception e) {
            log.error("删除购物车失败", e);
            return R.failed("删除购物车失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "cart", key = "#result.data.totalItems != null ? #root.target.getCurrentUserId() : ''", condition = "#result.code == 0")
    public R<CartOperationResultVO> batchDeleteCart(CartBatchDeleteDTO cartBatchDeleteDTO) {
        try {
            Long userId = getCurrentUserId();
            if (userId == null) {
                return R.failed("用户未登录");
            }

            log.info("用户{}批量删除购物车项，IDs: {}", userId, cartBatchDeleteDTO.getIds());

            baseMapper.physicalDeleteBatchIds(userId, cartBatchDeleteDTO.getIds());

            return R.ok(getCartStats(userId));
        } catch (Exception e) {
            log.error("批量删除购物车失败", e);
            return R.failed("批量删除购物车失败: " + e.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = "cart", key = "#result.data.totalItems != null ? #root.target.getCurrentUserId() : ''", condition = "#result.code == 0")
    public R<CartOperationResultVO> clearCart() {
        try {
            Long userId = getCurrentUserId();
            if (userId == null) {
                return R.failed("用户未登录");
            }

            log.info("用户{}清空购物车", userId);

            baseMapper.physicalDeleteByUserId(userId);

            return R.ok(getCartStats(userId));
        } catch (Exception e) {
            log.error("清空购物车失败", e);
            return R.failed("清空购物车失败: " + e.getMessage());
        }
    }

    /**
     * 获取购物车统计信息
     */
    private CartOperationResultVO getCartStats(Long userId) {
        CartOperationResultVO result = new CartOperationResultVO();
        result.setSuccess(true);
        
        List<CartItem> items = this.list(Wrappers.<CartItem>lambdaQuery()
                .eq(CartItem::getUserId, userId));
        
        if (CollUtil.isEmpty(items)) {
            result.setTotalItems(0);
            result.setTotalQuantity(0);
        } else {
            result.setTotalItems(items.size());
            result.setTotalQuantity(items.stream()
                    .mapToInt(CartItem::getQuantity)
                    .sum());
        }
        return result;
    }

    /**
     * 获取当前用户ID
     * 注意：此方法必须是 public 才能被 SpEL 表达式调用
     */
    public Long getCurrentUserId() {
        try {
            var user = SecurityUtils.getUser();
            return user != null ? user.getId() : null;
        } catch (Exception e) {
            return null;
        }
    }
}
