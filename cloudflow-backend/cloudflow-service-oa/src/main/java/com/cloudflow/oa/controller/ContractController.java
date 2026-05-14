package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
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
@SaCheckLogin
@RequiredArgsConstructor
public class ContractController {

    private final IOaContractService contractService;

    @GetMapping("/list")
    @SaCheckPermission("office:contract:list")
    public R<PageResult<OaContract>> list(OaContract query, PageQuery pageQuery) {
        return R.ok(contractService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("office:contract:list")
    public R<OaContract> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(contractService.getContractInfo(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增合同")
    @PostMapping
    @SaCheckPermission("office:contract:add")
    public R<Long> add(@RequestBody OaContract contract) {
        try {
            return R.ok(contractService.createContract(contract));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改合同")
    @PutMapping
    @SaCheckPermission("office:contract:edit")
    public R<Void> edit(@RequestBody OaContract contract) {
        try {
            return R.result(contractService.updateContract(contract));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除合同")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("office:contract:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(contractService.removeContracts(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交合同审批")
    @PostMapping("/submit/{id}")
    @SaCheckPermission("office:contract:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(contractService.submitContract(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("取消合同")
    @PutMapping("/cancel/{id}")
    @SaCheckPermission("office:contract:cancel")
    public R<Void> cancel(@PathVariable("id") Long id) {
        try {
            return R.result(contractService.cancelContract(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("绑定合同用印")
    @PutMapping("/{id}/link-seal/{sealApplicationId}")
    @SaCheckPermission("office:contract:link-seal")
    public R<Void> linkSeal(@PathVariable("id") Long id,
                            @PathVariable("sealApplicationId") Long sealApplicationId) {
        try {
            return R.result(contractService.linkSeal(id, sealApplicationId));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/timeline")
    @SaCheckPermission("office:contract:list")
    public R<List<OaTraceEvent>> timeline(@PathVariable("id") Long id) {
        try {
            return R.ok(contractService.listTimeline(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/risks")
    @SaCheckPermission("office:contract:list")
    public R<List<OaRiskAlert>> risks(@PathVariable("id") Long id) {
        try {
            return R.ok(contractService.listRisks(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}
