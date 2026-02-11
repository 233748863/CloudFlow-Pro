package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleAddDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleCacheDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.service.IPointsRuleService;
import cn.joywon.poco.merchant.PlatformModule.vo.PointsRuleDetailVO;
import cn.joywon.poco.merchant.PlatformModule.vo.PointsRuleListVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "积分规则管理")
@RequestMapping("/points/rule")
public class PointsRuleController {

    private final IPointsRuleService pointsRuleService;


    /**
     * 添加积分规则
     *
     * @param dto 积分规则新增参数
     * @return 响应结果
     */
    @PostMapping("/add")
    @Operation(summary = "新增积分规则")
    public R<?> addPointsRule(@RequestBody @Valid PointsRuleAddDTO dto) {
        if (dto.getActiveTime() != null && dto.getEnable() != null) {
            if (!dto.getExpireTime().isAfter(dto.getActiveTime())) {
                return R.failed("无效的规则生效时间范围");
            }
        }
        return pointsRuleService.addPointsRule(dto);
    }


    /**
     * 删除积分规则
     *
     * @param id 积分规则ID
     * @return 响应结果
     */
    @DeleteMapping("/delete")
    public R<?> deletePointsRule(@RequestParam("id") String id) {
        return pointsRuleService.deletePointsRule(Long.valueOf(id));
    }


    /**
     * 修改积分规则
     *
     * @param dto 积分规则修改参数
     * @return 响应结果
     */
    @PutMapping("/modify")
    @Operation(summary = "修改积分规则")
    public R<?> modifyPointsRule(@RequestBody @Valid PointsRuleUpdateDTO dto) {
        return pointsRuleService.modifyPointsRule(dto);
    }


    /**
     * 重建积分规则缓存
     *
     * @return 响应结果
     */
    @PutMapping("/cache/rebuild")
    @Operation(summary = "重建积分规则缓存")
    public R<?> rebuildPointsRuleCache() {
        return pointsRuleService.rebuildPointsRuleCache();
    }


    /**
     * 查询积分规则列表
     *
     * @param dto 查询参数
     * @return 响应结果
     */
    @PostMapping("/list")
    @Operation(summary = "查询积分规则列表")
    public R<PageQueryVO<PointsRuleListVO>> queryPointsRulesList(@RequestBody @Valid PointsRuleQueryDTO dto) {
        return pointsRuleService.queryPointsRulesList(dto);
    }


    /**
     * 获取积分规则详情
     *
     * @param id 积分规则ID
     * @return 响应结果
     */
    @GetMapping("/detail")
    @Operation(summary = "获取积分规则详情")
    private R<PointsRuleDetailVO> getPointsRuleDetail(@RequestParam("id") String id) {
        return pointsRuleService.getPointsRuleDetail(Long.valueOf(id));
    }


    /**
     * 获取默认积分规则缓存
     *
     * @param addOrDed 积分变动类型
     * @param ruleType 积分规则类型
     * @return 响应结果
     */
    @GetMapping("/cache/primary")
    @Operation(summary = "获取默认积分规则缓存")
    public R<?> getPrimaryPointsRuleCache(@RequestParam(value = "addOrDed", required = false)
                                          @Pattern(regexp = PointsRuleEnum.POINTS_RULE_CHANGE_TYPE_REGEX_PATTERN,
                                                  message = "无效的积分变动类型") String addOrDed,
                                          @RequestParam(value = "ruleType", required = false)
                                          @Pattern(regexp = PointsRuleEnum.POINTS_RULE_TYPE_REGEX_PATTERN,
                                                  message = "无效的积分规则类型") String ruleType) {
        PointsRuleCacheDTO cache = pointsRuleService.getPrimaryPointsRuleCache(addOrDed, ruleType);
        return R.ok(cache);
    }


    /**
     * 根据积分规则ID获取积分规则缓存
     *
     * @param id 积分规则ID
     * @return 响应结果
     */
    @GetMapping("/cache/id")
    @Operation(summary = "根据积分规则ID获取积分规则缓存")
    public R<PointsRuleCacheDTO> getPointsRuleCache(@RequestParam("id") String id) {
        PointsRuleCacheDTO cache = pointsRuleService.getPointsRuleCache(id);
        return R.ok(cache);
    }


    /**
     * 根据积分变动类型规则类型查询积分规则缓存列表
     *
     * @param addOrDed 积分变动类型
     * @param ruleType 积分规则类型
     * @return 响应结果
     */
    @GetMapping("/cache/list")
    @Operation(summary = "根据积分变动类型规则类型查询积分规则缓存列表")
    public R<?> queryPointRuleCacheList(@RequestParam(value = "addOrDed", required = false)
                                        @Pattern(regexp = PointsRuleEnum.POINTS_RULE_CHANGE_TYPE_REGEX_PATTERN,
                                                message = "无效的积分变动类型") String addOrDed,
                                        @RequestParam(value = "ruleType", required = false)
                                        @Pattern(regexp = PointsRuleEnum.POINTS_RULE_TYPE_REGEX_PATTERN,
                                                message = "无效的积分规则类型") String ruleType) {
        List<PointsRuleCacheDTO> caches = pointsRuleService.queryPointRuleCacheList(addOrDed, ruleType);
        return R.ok(caches);
    }


}