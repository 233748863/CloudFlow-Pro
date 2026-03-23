package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.HeadcountQueryDTO;
import com.cloudflow.hr.domain.dto.HeadcountSetDTO;
import com.cloudflow.hr.domain.vo.HeadcountStatisticsVO;
import com.cloudflow.hr.domain.vo.HeadcountVO;
import com.cloudflow.hr.service.HeadcountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 编制管理控制器
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/headcount")
@RequiredArgsConstructor
public class HeadcountController {

    private final HeadcountService headcountService;

    /**
     * 设置编制
     * 
     * @param dto 编制设置DTO
     * @return 操作结果
     */
    @PostMapping("/set")
    public R<Void> setHeadcount(@Validated @RequestBody HeadcountSetDTO dto) {
        log.info("设置编制，请求参数：{}", dto);
        headcountService.setHeadcount(dto);
        return R.ok();
    }

    /**
     * 获取编制统计信息
     * 
     * @param targetType 目标类型：DEPT-部门 POST-岗位
     * @param targetId 目标ID
     * @return 编制统计信息
     */
    @GetMapping("/statistics")
    public R<HeadcountStatisticsVO> getHeadcountStatistics(
            @RequestParam String targetType,
            @RequestParam Long targetId) {
        log.info("获取编制统计，目标类型：{}，目标ID：{}", targetType, targetId);
        HeadcountStatisticsVO statistics = headcountService.getHeadcountStatistics(targetType, targetId);
        return R.ok(statistics);
    }

    /**
     * 查询编制列表
     * 
     * @param query 查询条件
     * @return 编制列表
     */
    @GetMapping("/list")
    public R<List<HeadcountVO>> listHeadcounts(HeadcountQueryDTO query) {
        log.info("查询编制列表，查询条件：{}", query);
        List<HeadcountVO> headcounts = headcountService.listHeadcounts(query);
        return R.ok(headcounts);
    }

    /**
     * 更新实际在职人数
     * 
     * @param targetType 目标类型
     * @param targetId 目标ID
     * @param actualCount 实际在职人数
     * @return 操作结果
     */
    @PutMapping("/actual-count")
    public R<Void> updateActualCount(
            @RequestParam String targetType,
            @RequestParam Long targetId,
            @RequestParam Integer actualCount) {
        log.info("更新实际在职人数，目标类型：{}，目标ID：{}，实际人数：{}", 
                targetType, targetId, actualCount);
        headcountService.updateActualCount(targetType, targetId, actualCount);
        return R.ok();
    }
}
