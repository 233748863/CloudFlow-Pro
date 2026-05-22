package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.service.HrBenefitMineService;
import com.cloudflow.hr.service.HrBenefitRequestService;
import com.cloudflow.hr.service.HrMallItemService;
import com.cloudflow.hr.service.HrMallOrderService;
import com.cloudflow.hr.service.HrPointAccountService;
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

import java.util.Map;

/**
 * HR 福利与积分商城多 Controller 聚合文件。
 *
 * <p>按业务子域拆为 5 个独立 @RestController，共享 {@code /benefit} base path：
 * 我的福利总览、福利申领、积分账户、积分商城商品、积分商城订单。
 */
@RestController
@RequestMapping("/benefit")
@RequiredArgsConstructor
class HrBenefitMineController {

    private final HrBenefitMineService benefitMineService;

    @GetMapping("/mine")
    @SaCheckPermission("hr:benefit:mine")
    public R<?> mine() {
        return R.ok(benefitMineService.loadMineSummary());
    }
}

@RestController
@RequestMapping("/benefit/requests")
@RequiredArgsConstructor
class HrBenefitRequestController {

    private final HrBenefitRequestService requestService;

    @GetMapping
    @SaCheckPermission("hr:benefit:request:list")
    public R<?> page(@RequestParam Map<String, Object> query) {
        return R.ok(requestService.page(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:benefit:request:list")
    public R<?> get(@PathVariable Long id) {
        return R.ok(requestService.get(id));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:benefit:mine")
    public R<?> mine(@RequestParam Map<String, Object> query) {
        return R.ok(requestService.listMine(query));
    }

    @SysLog("新增福利申领")
    @PostMapping
    @SaCheckPermission("hr:benefit:request:add")
    public R<Long> create(@RequestBody Map<String, Object> payload) {
        return R.ok(requestService.createRequest(payload));
    }

    @SysLog("修改福利申领")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:benefit:request:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        requestService.updateRequest(id, payload);
        return R.ok();
    }

    @SysLog("提交福利申领审批")
    @PostMapping("/{id}/submit")
    @SaCheckPermission("hr:benefit:request:submit")
    public R<String> submit(@PathVariable Long id) {
        return R.ok(requestService.submitWorkflow(id));
    }

    @SysLog("撤销福利申领")
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:benefit:request:cancel")
    public R<Void> cancel(@PathVariable Long id,
                          @RequestParam(required = false) String reason) {
        requestService.cancelRequest(id, reason);
        return R.ok();
    }
}

@RestController
@RequestMapping("/benefit/points")
@RequiredArgsConstructor
class HrPointAccountController {

    private final HrPointAccountService pointAccountService;

    @GetMapping("/mine")
    @SaCheckPermission("hr:benefit:point:view")
    public R<?> mine() {
        return R.ok(pointAccountService.getMyAccount());
    }

    @GetMapping("/employees/{employeeId}")
    @SaCheckPermission("hr:benefit:point:view")
    public R<?> getByEmployee(@PathVariable Long employeeId) {
        return R.ok(pointAccountService.getEmployeeAccount(employeeId));
    }

    @GetMapping("/{accountId}/transactions")
    @SaCheckPermission("hr:benefit:point:view")
    public R<?> transactions(@PathVariable Long accountId,
                             @RequestParam Map<String, Object> query) {
        return R.ok(pointAccountService.listTransactions(accountId, query));
    }

    @SysLog("积分手动调整")
    @PostMapping("/manual-adjust")
    @SaCheckPermission("hr:benefit:point:adjust")
    public R<Long> manualAdjust(@RequestParam Long employeeId,
                                @RequestParam Integer points,
                                @RequestParam String direction,
                                @RequestParam(required = false) String remark) {
        return R.ok(pointAccountService.manualAdjust(employeeId, points, direction, remark));
    }
}

@RestController
@RequestMapping("/benefit/mall/items")
@RequiredArgsConstructor
class HrMallItemController {

    private final HrMallItemService mallItemService;

    @GetMapping
    @SaCheckPermission("hr:benefit:mall:browse")
    public R<?> page(@RequestParam Map<String, Object> query) {
        return R.ok(mallItemService.page(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:benefit:mall:browse")
    public R<?> get(@PathVariable Long id) {
        return R.ok(mallItemService.get(id));
    }

    @SysLog("新增积分商品")
    @PostMapping
    @SaCheckPermission("hr:benefit:mall:item:manage")
    public R<Long> create(@RequestBody Map<String, Object> payload) {
        return R.ok(mallItemService.createItem(payload));
    }

    @SysLog("修改积分商品")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:benefit:mall:item:manage")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        mallItemService.updateItem(id, payload);
        return R.ok();
    }

    @SysLog("商品上架")
    @PostMapping("/{id}/on-shelf")
    @SaCheckPermission("hr:benefit:mall:item:manage")
    public R<Void> onShelf(@PathVariable Long id) {
        mallItemService.onShelf(id);
        return R.ok();
    }

    @SysLog("商品下架")
    @PostMapping("/{id}/off-shelf")
    @SaCheckPermission("hr:benefit:mall:item:manage")
    public R<Void> offShelf(@PathVariable Long id) {
        mallItemService.offShelf(id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/benefit/mall/orders")
@RequiredArgsConstructor
class HrMallOrderController {

    private final HrMallOrderService mallOrderService;

    @GetMapping
    @SaCheckPermission("hr:benefit:order:list")
    public R<?> page(@RequestParam Map<String, Object> query) {
        return R.ok(mallOrderService.page(query));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:benefit:order:my")
    public R<?> mine(@RequestParam Map<String, Object> query) {
        return R.ok(mallOrderService.listMine(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:benefit:order:list")
    public R<?> get(@PathVariable Long id) {
        return R.ok(mallOrderService.get(id));
    }

    @SysLog("积分商城下单")
    @PostMapping
    @SaCheckPermission("hr:benefit:order:place")
    public R<Long> placeOrder(@RequestBody Map<String, Object> payload) {
        return R.ok(mallOrderService.placeOrder(payload));
    }

    @SysLog("订单发货")
    @PostMapping("/{id}/ship")
    @SaCheckPermission("hr:benefit:order:ship")
    public R<Void> ship(@PathVariable Long id, @RequestParam String expressNo) {
        mallOrderService.ship(id, expressNo);
        return R.ok();
    }

    @SysLog("订单取消")
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:benefit:order:cancel")
    public R<Void> cancel(@PathVariable Long id,
                          @RequestParam(required = false) String reason) {
        mallOrderService.cancel(id, reason);
        return R.ok();
    }

    @SysLog("确认收货")
    @PostMapping("/{id}/complete")
    @SaCheckPermission("hr:benefit:order:my")
    public R<Void> complete(@PathVariable Long id) {
        mallOrderService.complete(id);
        return R.ok();
    }
}
