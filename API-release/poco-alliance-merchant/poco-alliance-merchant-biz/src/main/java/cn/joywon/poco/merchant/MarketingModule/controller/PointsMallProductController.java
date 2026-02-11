package cn.joywon.poco.merchant.MarketingModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductCreateDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductOnOffShelfDTO;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductUpdateDTO;
import cn.joywon.poco.merchant.MarketingModule.service.IPointsMallProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Validated
@RestController
@RequiredArgsConstructor
@Tag(name = "积分商城商品分类管理")
@RequestMapping("/marketing/product")
public class PointsMallProductController {

    private final IPointsMallProductService pointsMallProductService;


    /**
     * 创建积分商城商品
     *
     * @param dto 积分商城商品创建参数
     * @return 响应结果
     */
    @PostMapping("/create")
    @SysLog(value = "创建积分商城商品")
    @Operation(summary = "创建积分商城商品")
    public R<?> createProduct(@RequestBody @Valid PointsMallProductCreateDTO dto) {
        return pointsMallProductService.createProduct(dto);
    }


    /**
     * 删除积分商城商品
     *
     * @param id 商品ID
     * @return 响应结果
     */
    @DeleteMapping("/delete")
    @SysLog(value = "删除积分商城商品")
    @Operation(summary = "删除积分商城商品")
    public R<?> deleteProduct(@RequestParam("id") String id) {
        return pointsMallProductService.deleteProduct(id);
    }


    /**
     * 更新积分商城商品
     *
     * @param dto 积分商城商品更新参数
     * @return 响应结果
     */
    @PutMapping("/update")
    @SysLog(value = "更新积分商城商品")
    @Operation(summary = "更新积分商城商品")
    public R<?> updateProduct(@RequestBody @Valid PointsMallProductUpdateDTO dto) {
        return pointsMallProductService.updateProduct(dto);
    }


    /**
     * 上/下架积分商城商品
     *
     * @param dto 商品上/下架参数
     * @return 响应结果
     */
    @PutMapping("/on-off/shelf")
    @SysLog(value = "上下架积分商城商品")
    @Operation(summary = "上架积分商城商品")
    public R<?> onOffShelfProduct(@RequestBody @Valid PointsMallProductOnOffShelfDTO dto) {
        return pointsMallProductService.onOffShelfProduct(dto);
    }


    @PutMapping("/stock/refill")
    public R<?> refillStock() {
        return null;
    }


}