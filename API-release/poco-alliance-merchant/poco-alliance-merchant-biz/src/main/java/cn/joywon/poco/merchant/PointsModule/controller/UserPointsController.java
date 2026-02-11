package cn.joywon.poco.merchant.PointsModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import cn.joywon.poco.merchant.PointsModule.service.IUserPointsService;
import cn.joywon.poco.merchant.PointsModule.vo.PointsBalanceVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "用户积分变动管理")
@RequestMapping("/points/user")
public class UserPointsController {

    private final IUserPointsService userPointsService;


    /**
     * 用户积分变动增加
     *
     * @param dto 积分变动参数
     * @return 响应结果
     */
    @PostMapping("/change/add")
    @SysLog(value = "用户积分变动-增加")
    @Operation(summary = "用户积分变动-增加")
    public R<?> userChangeAdd(@RequestBody @Valid PointsAddChangeDTO dto) {
        return userPointsService.changeAdd(dto);
    }


    /**
     * 用户积分变动扣减
     *
     * @param dto 积分变动参数
     * @return 响应结果
     */
    @PostMapping("/change/ded")
    @SysLog(value = "用户积分变动-扣减")
    @Operation(summary = "用户积分变动-扣减")
    public R<?> userChangeDed(@RequestBody @Valid PointsDedChangeDTO dto) {
        return userPointsService.changeDed(dto);
    }


    /**
     * 查找并处理过期积分
     *
     * @return 响应结果
     */
    @PutMapping("/expired/cleanup")
    @Operation(summary = "用户积分过期处理")
    public R<?> expiredCleanup() {
        return userPointsService.expiredCleanup();
    }


    /**
     * 获取用户积分余额详情
     *
     * @return 响应结果
     */
    @GetMapping("/balance/detail")
    @Operation(summary = "获取用户积分余额详情")
    public R<PointsBalanceVO> getBalanceDetail() {
        return userPointsService.getBalanceDetail();
    }


}