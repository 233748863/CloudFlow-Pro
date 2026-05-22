package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrBankCardPayload;
import com.cloudflow.hr.domain.dto.HrFamilyMemberPayload;
import com.cloudflow.hr.domain.entity.HrBankCard;
import com.cloudflow.hr.domain.entity.HrBenefitPayment;
import com.cloudflow.hr.domain.entity.HrFamilyMember;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.service.HrEssService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ESS（员工自助）资源控制器集合。
 *
 * <p>本文件聚合数据维护类 4 个子控制器：工资条 / 银行卡 / 家庭成员 / 福利明细。
 * 工作流类（证明开具 / 合同签署）与门户聚合接口分别落在
 * {@link HrEssWorkflowControllers} 与 {@link HrEssPortalController}（后续阶段补齐）。
 *
 * <p>所有写入端点都通过 {@link HrEssSupport#assertOwner(Long)} 强制 employee 一致性。
 * 查看端点对 HR 管理员视角放开 employeeId 过滤，对员工视角自动注入 employeeId={当前员工}。
 */
@RestController
@RequestMapping("/ess/salary-slips")
@RequiredArgsConstructor
class HrSalarySlipController {

    private final HrTypedCrudService crudService;
    private final HrEssService essService;
    private final HrEssSupport essSupport;

    @GetMapping
    @SaCheckPermission("hr:ess:slip:view")
    public R<?> list(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        if (!normalized.containsKey("employeeId")) {
            normalized.put("employeeId", essSupport.currentEmployeeId());
        }
        return R.ok(crudService.page(HrSalarySlip.class, normalized));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:ess:slip:view")
    public R<Map<String, Object>> get(@PathVariable Long id) {
        Map<String, Object> row = crudService.get(HrSalarySlip.class, id);
        Object employeeId = row == null ? null : row.get("employeeId");
        if (employeeId instanceof Number num) {
            essSupport.assertOwner(num.longValue());
        }
        return R.ok(row);
    }

    @SysLog("生成HR月度工资条")
    @PostMapping("/generate")
    @SaCheckPermission("hr:ess:slip:generate")
    public R<Map<String, Object>> generate(@RequestParam String periodMonth,
                                            @RequestParam(required = false) Long employeeId) {
        int created = essService.generateSalarySlips(periodMonth, employeeId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("periodMonth", periodMonth);
        data.put("created", created);
        return R.ok(data);
    }

    @SysLog("员工确认HR工资条")
    @PostMapping("/{id}/confirm")
    @SaCheckPermission("hr:ess:slip:confirm")
    public R<Void> confirm(@PathVariable Long id) {
        essService.confirmSalarySlip(id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/ess/bank-cards")
@RequiredArgsConstructor
class HrBankCardController {

    private final HrTypedCrudService crudService;
    private final HrEssService essService;
    private final HrEssSupport essSupport;

    @GetMapping
    @SaCheckPermission("hr:ess:bankcard:view")
    public R<?> list(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(crudService.list(HrBankCard.class, normalized));
    }

    @SysLog("新增HR员工银行卡")
    @PostMapping
    @SaCheckPermission("hr:ess:bankcard:add")
    public R<Long> create(@RequestBody HrBankCardPayload payload) {
        Map<String, Object> map = crudService.toMap(payload);
        map.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(essService.createBankCard(map));
    }

    @SysLog("修改HR员工银行卡")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:ess:bankcard:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody HrBankCardPayload payload) {
        Map<String, Object> map = crudService.toMap(payload);
        map.remove("employeeId");
        essService.updateBankCard(id, map);
        return R.ok();
    }

    @SysLog("删除HR员工银行卡")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:ess:bankcard:remove")
    public R<Void> delete(@PathVariable Long id) {
        Map<String, Object> existing = crudService.get(HrBankCard.class, id);
        Object employeeId = existing == null ? null : existing.get("employeeId");
        if (employeeId == null) {
            throw new HrBusinessException("BANK_CARD_NOT_FOUND", "银行卡不存在：" + id);
        }
        essSupport.assertOwner(Long.parseLong(String.valueOf(employeeId)));
        crudService.delete(HrBankCard.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/ess/family-members")
@RequiredArgsConstructor
class HrFamilyMemberController {

    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;

    @GetMapping
    @SaCheckPermission("hr:ess:family:view")
    public R<?> list(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(crudService.list(HrFamilyMember.class, normalized));
    }

    @SysLog("新增HR员工家属")
    @PostMapping
    @SaCheckPermission("hr:ess:family:add")
    public R<Long> create(@RequestBody HrFamilyMemberPayload payload) {
        payload.setEmployeeId(essSupport.currentEmployeeId());
        return R.ok(crudService.create(HrFamilyMember.class, payload));
    }

    @SysLog("修改HR员工家属")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:ess:family:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody HrFamilyMemberPayload payload) {
        Map<String, Object> existing = crudService.get(HrFamilyMember.class, id);
        Object employeeId = existing == null ? null : existing.get("employeeId");
        if (employeeId == null) {
            throw new HrBusinessException("FAMILY_NOT_FOUND", "家庭成员记录不存在：" + id);
        }
        essSupport.assertOwner(Long.parseLong(String.valueOf(employeeId)));
        payload.setEmployeeId(Long.parseLong(String.valueOf(employeeId)));
        crudService.update(HrFamilyMember.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工家属")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:ess:family:remove")
    public R<Void> delete(@PathVariable Long id) {
        Map<String, Object> existing = crudService.get(HrFamilyMember.class, id);
        Object employeeId = existing == null ? null : existing.get("employeeId");
        if (employeeId == null) {
            throw new HrBusinessException("FAMILY_NOT_FOUND", "家庭成员记录不存在：" + id);
        }
        essSupport.assertOwner(Long.parseLong(String.valueOf(employeeId)));
        crudService.delete(HrFamilyMember.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/ess/benefit-payments")
@RequiredArgsConstructor
class HrBenefitPaymentController {

    private final HrTypedCrudService crudService;
    private final HrEssService essService;
    private final HrEssSupport essSupport;

    @GetMapping
    @SaCheckPermission("hr:ess:benefit:view")
    public R<?> list(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        if (!normalized.containsKey("employeeId")) {
            normalized.put("employeeId", essSupport.currentEmployeeId());
        }
        return R.ok(crudService.list(HrBenefitPayment.class, normalized));
    }

    @SysLog("生成HR月度福利明细")
    @PostMapping("/generate")
    @SaCheckPermission("hr:ess:benefit:generate")
    public R<Map<String, Object>> generate(@RequestParam String periodMonth,
                                            @RequestParam(required = false) Long employeeId) {
        int created = essService.generateBenefitPayments(periodMonth, employeeId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("periodMonth", periodMonth);
        data.put("created", created);
        return R.ok(data);
    }
}
