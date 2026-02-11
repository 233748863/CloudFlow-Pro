package cn.joywon.poco.merchant.PointsModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsFlowQueryDTO;
import cn.joywon.poco.merchant.PointsModule.service.IMerchantPointsService;
import cn.joywon.poco.merchant.PointsModule.vo.PointsBalanceVO;
import cn.joywon.poco.merchant.PointsModule.vo.PointsExpiredListVO;
import cn.joywon.poco.merchant.PointsModule.vo.PointsFlowListVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "商家积分变动管理")
@RequestMapping("/points/merchant")
public class MerchantPointsController {

    private final IMerchantPointsService merchantPointsService;


    /**
     * 商家积分增加
     *
     * @param dto 积分增加变动参数
     * @return 响应结果
     */
    @PostMapping("/change/add")
    @SysLog(value = "商家积分变动-增加")
    @Operation(summary = "商家积分变动-增加")
    public R<?> changeAdd(@RequestBody @Valid PointsAddChangeDTO dto) {
        return merchantPointsService.changeAdd(dto);
    }


    /**
     * 商家积分扣减
     *
     * @param dto 积分扣减变动参数
     * @return 响应结果
     */
    @PostMapping("/change/ded")
    @SysLog(value = "商家积分变动-扣减")
    @Operation(summary = "商家积分变动-扣减")
    public R<?> changeDed(@RequestBody @Valid PointsDedChangeDTO dto) {
        return merchantPointsService.changeDed(dto);
    }


    /**
     * 查找并处理过期积分
     *
     * @return 响应结果
     */
    @PostMapping("/expired/cleanup")
    @Operation(summary = "商家积分过期处理")
    public R<?> expiredCleanup() {
        return merchantPointsService.expiredCleanup();
    }


    /**
     * 获取商家积分余额
     *
     * @return 响应结果
     */
    @GetMapping("/balance")
    @Operation(summary = "获取商家积分余额")
    public R<Integer> getBalance() {
        return merchantPointsService.getBalance();
    }


    /**
     * 获取商家积分余额详情
     *
     * @return 响应结果
     */
    @GetMapping("/balance/detail")
    @Operation(summary = "获取商家积分余额详情")
    private R<PointsBalanceVO> getBalanceDetail() {
        return merchantPointsService.getBalanceDetail();
    }


    /**
     * 查询商家积分变动记录
     *
     * @param dto 查询参数
     * @return 响应结果
     */
    @PostMapping("/flow")
    @Operation(summary = "查询商家积分变动记录")
    public R<PageQueryVO<PointsFlowListVO>> queryPointsFlow(@RequestBody @Valid PointsFlowQueryDTO dto) {
        return merchantPointsService.queryPointsFlow(dto);
    }


    /**
     * 获取商家积分过期日志
     *
     * @return 响应结果
     */
    @GetMapping("/expired/log")
    @Operation(summary = "获取商家积分过期日志")
    public R<List<PointsExpiredListVO>> getPointsExpiredLog() {
        return merchantPointsService.getPointsExpiredLog();
    }


}