package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
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

    private final IOaContractService oaContractService;

    @GetMapping("/list")
    @SaCheckPermission("oa:contract:list")
    public R<PageResult<OaContract>> list(OaContract query, PageQuery pageQuery) {
        return R.ok(oaContractService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:contract:list")
    public R<OaContract> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(oaContractService.getContractInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增合同")
    @PostMapping
    @SaCheckPermission("oa:contract:add")
    public R<Long> add(@RequestBody OaContract contract) {
        try {
            return R.ok(oaContractService.createContract(contract));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改合同")
    @PutMapping
    @SaCheckPermission("oa:contract:edit")
    public R<Void> edit(@RequestBody OaContract contract) {
        try {
            return R.result(oaContractService.updateContract(contract));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除合同")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:contract:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(oaContractService.removeContracts(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交合同审批")
    @PostMapping("/submit/{id}")
    @SaCheckPermission("oa:contract:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(oaContractService.submitContract(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消合同")
    @PutMapping("/cancel/{id}")
    @SaCheckPermission("oa:contract:cancel")
    public R<Void> cancel(@PathVariable("id") Long id) {
        try {
            return R.result(oaContractService.cancelContract(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("绑定合同用印")
    @PutMapping("/{id}/link-seal/{sealApplicationId}")
    @SaCheckPermission("oa:contract:link-seal")
    public R<Void> linkSeal(@PathVariable("id") Long id,
                            @PathVariable("sealApplicationId") Long sealApplicationId) {
        try {
            return R.result(oaContractService.linkSeal(id, sealApplicationId));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/timeline")
    @SaCheckPermission("oa:contract:list")
    public R<List<OaTraceEvent>> timeline(@PathVariable("id") Long id) {
        try {
            return R.ok(oaContractService.listTimeline(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/risks")
    @SaCheckPermission("oa:contract:list")
    public R<List<OaRiskAlert>> risks(@PathVariable("id") Long id) {
        try {
            return R.ok(oaContractService.listRisks(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}

