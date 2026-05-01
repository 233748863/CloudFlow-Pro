package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.service.IOaContractService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 合同台账 Controller。
 */
@RestController
@RequestMapping("/contract")
@RequiredArgsConstructor
public class ContractController {

    private final IOaContractService contractService;

    @GetMapping("/list")
    public R<PageResult<OaContract>> list(OaContract query, PageQuery pageQuery) {
        return R.ok(contractService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<OaContract> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(contractService.getContractInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增合同")
    @PostMapping
    public R<Void> add(@RequestBody OaContract contract) {
        try {
            return R.result(contractService.createContract(contract));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改合同")
    @PutMapping
    public R<Void> edit(@RequestBody OaContract contract) {
        try {
            return R.result(contractService.updateContract(contract));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除合同")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(contractService.removeContracts(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交合同审批")
    @PostMapping("/submit/{id}")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(contractService.submitContract(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消合同")
    @PutMapping("/cancel/{id}")
    public R<Void> cancel(@PathVariable("id") Long id) {
        try {
            return R.result(contractService.cancelContract(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("绑定合同用印")
    @PutMapping("/{id}/link-seal/{sealApplicationId}")
    public R<Void> linkSeal(@PathVariable("id") Long id,
                            @PathVariable("sealApplicationId") Long sealApplicationId) {
        try {
            return R.result(contractService.linkSeal(id, sealApplicationId));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/timeline")
    public R<List<OaTraceEvent>> timeline(@PathVariable("id") Long id) {
        try {
            return R.ok(contractService.listTimeline(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/risks")
    public R<List<OaRiskAlert>> risks(@PathVariable("id") Long id) {
        try {
            return R.ok(contractService.listRisks(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}
