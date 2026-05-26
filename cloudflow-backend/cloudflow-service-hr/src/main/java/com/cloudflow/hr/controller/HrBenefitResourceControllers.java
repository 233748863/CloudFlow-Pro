package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.benefit.HrBenefitRequestDTO;
import com.cloudflow.hr.domain.dto.benefit.HrBenefitRequestQueryDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallItemDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallItemQueryDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallOrderPlaceDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallOrderQueryDTO;
import com.cloudflow.hr.domain.dto.benefit.HrPointTransactionQueryDTO;
import com.cloudflow.hr.domain.vo.benefit.HrBenefitMineVO;
import com.cloudflow.hr.domain.vo.benefit.HrBenefitRequestVO;
import com.cloudflow.hr.domain.vo.benefit.HrMallItemVO;
import com.cloudflow.hr.domain.vo.benefit.HrMallOrderVO;
import com.cloudflow.hr.domain.vo.benefit.HrPointAccountVO;
import com.cloudflow.hr.domain.vo.benefit.HrPointTransactionVO;
import com.cloudflow.hr.service.HrBenefitMineService;
import com.cloudflow.hr.service.HrBenefitRequestService;
import com.cloudflow.hr.service.HrMallItemService;
import com.cloudflow.hr.service.HrMallOrderService;
import com.cloudflow.hr.service.HrPointAccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
    public R<HrBenefitMineVO> mine() {
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
    public R<PageResult<HrBenefitRequestVO>> page(@Validated @ModelAttribute HrBenefitRequestQueryDTO query) {
        return R.ok(requestService.page(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:benefit:request:list")
    public R<HrBenefitRequestVO> get(@PathVariable Long id) {
        return R.ok(requestService.get(id));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:benefit:mine")
    public R<PageResult<HrBenefitRequestVO>> mine(@Validated @ModelAttribute HrBenefitRequestQueryDTO query) {
        return R.ok(requestService.listMine(query));
    }

    @SysLog("新增福利申领")
    @PostMapping
    @SaCheckPermission("hr:benefit:request:add")
    public R<Long> create(@Validated @RequestBody HrBenefitRequestDTO dto) {
        return R.ok(requestService.createRequest(dto));
    }

    @SysLog("修改福利申领")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:benefit:request:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrBenefitRequestDTO dto) {
        requestService.updateRequest(id, dto);
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
    public R<HrPointAccountVO> mine() {
        return R.ok(pointAccountService.getMyAccount());
    }

    @GetMapping("/employees/{employeeId}")
    @SaCheckPermission("hr:benefit:point:view")
    public R<HrPointAccountVO> getByEmployee(@PathVariable Long employeeId) {
        return R.ok(pointAccountService.getEmployeeAccount(employeeId));
    }

    @GetMapping("/{accountId}/transactions")
    @SaCheckPermission("hr:benefit:point:view")
    public R<PageResult<HrPointTransactionVO>> transactions(@PathVariable Long accountId,
                                                            @Validated @ModelAttribute HrPointTransactionQueryDTO query) {
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
    public R<PageResult<HrMallItemVO>> page(@Validated @ModelAttribute HrMallItemQueryDTO query) {
        return R.ok(mallItemService.page(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:benefit:mall:browse")
    public R<HrMallItemVO> get(@PathVariable Long id) {
        return R.ok(mallItemService.get(id));
    }

    @SysLog("新增积分商品")
    @PostMapping
    @SaCheckPermission("hr:benefit:mall:item:manage")
    public R<Long> create(@Validated @RequestBody HrMallItemDTO dto) {
        return R.ok(mallItemService.createItem(dto));
    }

    @SysLog("修改积分商品")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:benefit:mall:item:manage")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrMallItemDTO dto) {
        mallItemService.updateItem(id, dto);
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
    public R<PageResult<HrMallOrderVO>> page(@Validated @ModelAttribute HrMallOrderQueryDTO query) {
        return R.ok(mallOrderService.page(query));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:benefit:order:my")
    public R<PageResult<HrMallOrderVO>> mine(@Validated @ModelAttribute HrMallOrderQueryDTO query) {
        return R.ok(mallOrderService.listMine(query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:benefit:order:list")
    public R<HrMallOrderVO> get(@PathVariable Long id) {
        return R.ok(mallOrderService.get(id));
    }

    @SysLog("积分商城下单")
    @PostMapping
    @SaCheckPermission("hr:benefit:order:place")
    public R<Long> placeOrder(@Validated @RequestBody HrMallOrderPlaceDTO dto) {
        return R.ok(mallOrderService.placeOrder(dto));
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
