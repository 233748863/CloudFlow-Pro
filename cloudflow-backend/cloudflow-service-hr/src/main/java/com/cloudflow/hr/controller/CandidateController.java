package com.cloudflow.hr.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.CandidateCreateDTO;
import com.cloudflow.hr.domain.dto.CandidateQueryDTO;
import com.cloudflow.hr.domain.dto.CandidateUpdateDTO;
import com.cloudflow.hr.domain.vo.CandidateDetailVO;
import com.cloudflow.hr.domain.vo.CandidateVO;
import com.cloudflow.hr.service.CandidateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 候选人管理Controller
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/candidate")
@RequiredArgsConstructor
@Tag(name = "候选人管理", description = "候选人管理相关接口")
public class CandidateController {

    private final CandidateService candidateService;

    /**
     * 创建候选人
     */
    @PostMapping
    @Operation(summary = "创建候选人", description = "创建新的候选人记录")
    public R<Long> createCandidate(@Validated @RequestBody CandidateCreateDTO dto) {
        log.info("创建候选人，请求参数：{}", dto);
        Long id = candidateService.createCandidate(dto);
        return R.ok(id);
    }

    /**
     * 更新候选人信息
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新候选人信息", description = "更新候选人的基本信息")
    public R<Void> updateCandidate(
            @Parameter(description = "候选人ID") @PathVariable Long id,
            @Validated @RequestBody CandidateUpdateDTO dto) {
        log.info("更新候选人信息，候选人ID：{}，请求参数：{}", id, dto);
        candidateService.updateCandidate(id, dto);
        return R.ok();
    }

    /**
     * 更新候选人状态
     */
    @PutMapping("/{id}/status")
    @Operation(summary = "更新候选人状态", description = "更新候选人的状态（筛选、面试、拒绝等）")
    public R<Void> updateCandidateStatus(
            @Parameter(description = "候选人ID") @PathVariable Long id,
            @Parameter(description = "新状态") @RequestParam String status,
            @Parameter(description = "拒绝原因（状态为REJECTED时必填）") @RequestParam(required = false) String rejectReason) {
        log.info("更新候选人状态，候选人ID：{}，新状态：{}，拒绝原因：{}", id, status, rejectReason);
        candidateService.updateCandidateStatus(id, status, rejectReason);
        return R.ok();
    }

    /**
     * 查询候选人详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "查询候选人详情", description = "根据ID查询候选人详细信息")
    public R<CandidateDetailVO> getCandidate(
            @Parameter(description = "候选人ID") @PathVariable Long id) {
        log.info("查询候选人详情，候选人ID：{}", id);
        CandidateDetailVO vo = candidateService.getCandidate(id);
        return R.ok(vo);
    }

    /**
     * 分页查询候选人列表
     */
    @GetMapping("/list")
    @Operation(summary = "分页查询候选人列表", description = "根据条件分页查询候选人列表")
    public R<Page<CandidateVO>> listCandidates(CandidateQueryDTO query) {
        log.info("分页查询候选人列表，查询条件：{}", query);
        Page<CandidateVO> page = candidateService.listCandidates(query);
        return R.ok(page);
    }
}
