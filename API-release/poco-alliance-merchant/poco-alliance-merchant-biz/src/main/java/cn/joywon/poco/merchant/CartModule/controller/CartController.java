package cn.joywon.poco.merchant.CartModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.CartModule.dto.CartAddDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartBatchDeleteDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartSkuUpdateDTO;
import cn.joywon.poco.merchant.CartModule.dto.CartUpdateDTO;
import cn.joywon.poco.merchant.CartModule.service.CartService;
import cn.joywon.poco.merchant.CartModule.vo.CartGroupVO;
import cn.joywon.poco.merchant.CartModule.vo.CartOperationResultVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 购物车控制器
 *
 * @author poco
 * @date 2024-12-25
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/cart")
@Tag(description = "cart", name = "购物车管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class CartController {

    private final CartService cartService;

    /**
     * 添加购物车
     * 【消费者端】
     *
     * @param cartAddDTO 添加购物车DTO
     * @return 操作结果
     */
    @Operation(summary = "添加购物车", description = "添加商品到购物车")
    @SysLog("添加购物车")
    @PostMapping
    @Inner(value = false)
    public R<CartOperationResultVO> addCart(@Valid @RequestBody CartAddDTO cartAddDTO) {
        return cartService.addCart(cartAddDTO);
    }

    /**
     * 获取购物车列表（按商家分组）
     * 【消费者端】
     *
     * @return 购物车列表
     */
    @Operation(summary = "获取购物车列表", description = "获取当前用户购物车（按商家分组）")
    @GetMapping
    @Inner(value = false)
    public R<List<CartGroupVO>> getCartList() {
        return cartService.getCartList();
    }

    /**
     * 更新购物车数量
     * 【消费者端】
     *
     * @param cartUpdateDTO 更新购物车DTO
     * @return 操作结果
     */
    @Operation(summary = "更新购物车数量", description = "修改购物车商品数量")
    @SysLog("更新购物车")
    @PutMapping
    @Inner(value = false)
    public R<CartOperationResultVO> updateCart(@Valid @RequestBody CartUpdateDTO cartUpdateDTO) {
        return cartService.updateCart(cartUpdateDTO);
    }

    /**
     * 更新购物车商品SKU
     * 【消费者端】
     *
     * @param cartSkuUpdateDTO 购物车SKU更新DTO
     * @return 操作结果
     */
    @Operation(summary = "更新购物车商品SKU", description = "修改购物车商品规格（SKU）")
    @SysLog("更新购物车SKU")
    @PutMapping("/sku")
    @Inner(value = false)
    public R<CartOperationResultVO> updateCartSku(@Valid @RequestBody CartSkuUpdateDTO cartSkuUpdateDTO) {
        return cartService.updateCartSku(cartSkuUpdateDTO);
    }

    /**
     * 删除购物车项
     * 【消费者端】
     *
     * @param id 购物车项ID
     * @return 操作结果
     */
    @Operation(summary = "删除购物车项", description = "删除单个购物车项")
    @SysLog("删除购物车")
    @DeleteMapping("/{id}")
    @Inner(value = false)
    public R<CartOperationResultVO> deleteCart(@PathVariable("id") Long id) {
        return cartService.deleteCart(id);
    }

    /**
     * 批量删除购物车项
     * 【消费者端】
     *
     * @param cartBatchDeleteDTO 批量删除DTO
     * @return 操作结果
     */
    @Operation(summary = "批量删除购物车项", description = "批量删除购物车项")
    @SysLog("批量删除购物车")
    @DeleteMapping("/batch")
    @Inner(value = false)
    public R<CartOperationResultVO> batchDeleteCart(@Valid @RequestBody CartBatchDeleteDTO cartBatchDeleteDTO) {
        return cartService.batchDeleteCart(cartBatchDeleteDTO);
    }

    /**
     * 清空购物车
     * 【消费者端】
     *
     * @return 操作结果
     */
    @Operation(summary = "清空购物车", description = "清空当前用户购物车")
    @SysLog("清空购物车")
    @DeleteMapping("/clear")
    @Inner(value = false)
    public R<CartOperationResultVO> clearCart() {
        return cartService.clearCart();
    }
}
