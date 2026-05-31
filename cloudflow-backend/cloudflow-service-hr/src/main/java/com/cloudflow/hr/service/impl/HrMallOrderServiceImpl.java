package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallOrderPlaceDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallOrderQueryDTO;
import com.cloudflow.hr.domain.entity.HrMallItem;
import com.cloudflow.hr.domain.entity.HrMallOrder;
import com.cloudflow.hr.domain.entity.HrMallOrderItem;
import com.cloudflow.hr.domain.entity.HrPointAccount;
import com.cloudflow.hr.domain.vo.benefit.HrMallOrderItemVO;
import com.cloudflow.hr.domain.vo.benefit.HrMallOrderVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrMallItemMapper;
import com.cloudflow.hr.mapper.HrMallOrderItemMapper;
import com.cloudflow.hr.mapper.HrMallOrderMapper;
import com.cloudflow.hr.service.IHrMallItemService;
import com.cloudflow.hr.service.IHrMallOrderService;
import com.cloudflow.hr.service.IHrPointAccountService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrMallOrderServiceImpl implements IHrMallOrderService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrMallOrderMapper orderMapper;
    private final HrMallOrderItemMapper orderItemMapper;
    private final HrMallItemMapper itemMapper;
    private final IHrPointAccountService pointAccountService;
    private final IHrMallItemService mallItemService;
    private final HrTypedCrudService crudService;
    private final WorkflowServiceClient workflowServiceClient;
    private final ObjectMapper objectMapper;

    @Value("${cloudflow.hr.mall.order-process-key:wf_hr_mall_order}")
    private String mallOrderProcessKey;

    @Value("${cloudflow.hr.mall.approval-threshold:5000}")
    private int approvalThreshold;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long placeOrder(HrMallOrderPlaceDTO dto) {
        if (dto == null) {
            throw new HrBusinessException("INVALID_PAYLOAD", "下单参数不能为空");
        }
        Long employeeId = UserContext.getUserId();
        if (employeeId == null) {
            throw new HrBusinessException("UNAUTHORIZED", "未登录用户无法下单");
        }
        Integer quantity = dto.getQuantity();
        if (quantity == null || quantity <= 0) {
            throw new HrBusinessException("INVALID_QUANTITY", "商品数量必须为正数");
        }

        HrMallItem item = itemMapper.selectById(dto.getItemId());
        if (item == null || Integer.valueOf(1).equals(item.getDeleted())) {
            throw new HrBusinessException("MALL_ITEM_NOT_FOUND", "商品不存在：" + dto.getItemId());
        }
        if (!"ON_SHELF".equals(item.getStatus())) {
            throw new HrBusinessException("MALL_ITEM_OFF_SHELF", "商品已下架：" + item.getItemName());
        }
        int totalPoints = item.getPointPrice() * quantity;

        HrPointAccount account = pointAccountService.findOrCreateAccount(employeeId);
        HrMallOrder order = new HrMallOrder();
        order.setTenantId(currentTenantId());
        order.setOrderNo("MO-" + System.currentTimeMillis() + "-" + employeeId);
        order.setEmployeeId(employeeId);
        order.setTotalPoints(totalPoints);
        order.setReceiverName(dto.getReceiverName());
        order.setReceiverPhone(dto.getReceiverPhone());
        order.setReceiverAddress(dto.getReceiverAddress());
        order.setStatus("PENDING");
        order.setRemark(dto.getRemark());
        order.setDeleted(0);
        order.setCreateBy(currentUserName());
        order.setUpdateBy(currentUserName());
        orderMapper.insert(order);

        HrMallOrderItem oi = new HrMallOrderItem();
        oi.setTenantId(currentTenantId());
        oi.setOrderId(order.getId());
        oi.setItemId(item.getId());
        oi.setItemName(item.getItemName());
        oi.setPointPrice(item.getPointPrice());
        oi.setQuantity(quantity);
        oi.setSubtotal(totalPoints);
        oi.setDeleted(0);
        oi.setCreateBy(currentUserName());
        oi.setUpdateBy(currentUserName());
        orderItemMapper.insert(oi);
        mallItemService.deductStock(item.getId(), quantity);

        pointAccountService.debit(account.getId(), totalPoints, "MALL_ORDER", order.getId(),
                "积分商城兑换-" + order.getOrderNo());

        if (totalPoints >= approvalThreshold) {
            ProcessStartDTO processStartDTO = new ProcessStartDTO();
            processStartDTO.setTenantId(currentTenantId());
            processStartDTO.setProcessDefinitionKey(mallOrderProcessKey);
            processStartDTO.setBusinessType("HR_MALL_ORDER");
            processStartDTO.setBusinessId(order.getId());
            processStartDTO.setBusinessNo(order.getOrderNo());
            processStartDTO.setProcessTitle("积分商城兑换-" + order.getOrderNo());
            processStartDTO.setStartUserId(UserContext.getUserId());
            Map<String, Object> vars = new LinkedHashMap<>();
            vars.put("orderId", order.getId());
            vars.put("totalPoints", totalPoints);
            vars.put("employeeId", employeeId);
            processStartDTO.setVariables(vars);
            R<String> response = workflowServiceClient.startProcess(processStartDTO);
            if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
                String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
                throw new HrBusinessException("WORKFLOW_START_FAILED", "积分商城订单审批启动失败：" + msg);
            }
            UpdateWrapper<HrMallOrder> uw = new UpdateWrapper<>();
            uw.eq("id", order.getId()).eq("tenant_id", currentTenantId())
                    .set("process_instance_id", response.getData())
                    .set("status", "APPROVING")
                    .set("update_time", LocalDateTime.now());
            orderMapper.update(null, uw);
        } else {
            UpdateWrapper<HrMallOrder> uw = new UpdateWrapper<>();
            uw.eq("id", order.getId()).eq("tenant_id", currentTenantId())
                    .set("status", "APPROVED")
                    .set("update_time", LocalDateTime.now());
            orderMapper.update(null, uw);
        }

        return order.getId();
    }

    @Override
    public PageResult<HrMallOrderVO> page(HrMallOrderQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrMallOrder.class,
                MapConverters.toServiceQuery(query, objectMapper));
        return MapConverters.toPageResult(raw, HrMallOrderVO.class, objectMapper);
    }

    @Override
    public PageResult<HrMallOrderVO> listMine(HrMallOrderQueryDTO query) {
        Map<String, Object> q = new LinkedHashMap<>(MapConverters.toServiceQuery(query, objectMapper));
        Long userId = UserContext.getUserId();
        if (userId != null) {
            q.put("employeeId", userId);
        }
        Map<String, Object> raw = crudService.page(HrMallOrder.class, q);
        return MapConverters.toPageResult(raw, HrMallOrderVO.class, objectMapper);
    }

    @Override
    public HrMallOrderVO get(Long orderId) {
        HrMallOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new HrBusinessException("MALL_ORDER_NOT_FOUND", "订单不存在：" + orderId);
        }
        HrMallOrderVO vo = objectMapper.convertValue(order, HrMallOrderVO.class);
        QueryWrapper<HrMallOrderItem> qw = new QueryWrapper<>();
        qw.eq("order_id", orderId).eq("deleted", 0);
        List<HrMallOrderItem> items = orderItemMapper.selectList(qw);
        List<HrMallOrderItemVO> itemVOs = new ArrayList<>(items == null ? 0 : items.size());
        if (items != null) {
            for (HrMallOrderItem oi : items) {
                itemVOs.add(objectMapper.convertValue(oi, HrMallOrderItemVO.class));
            }
        }
        vo.setItems(itemVOs);
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void ship(Long orderId, String expressNo) {
        HrMallOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new HrBusinessException("MALL_ORDER_NOT_FOUND", "订单不存在：" + orderId);
        }
        if (!"APPROVED".equals(order.getStatus())) {
            throw new HrBusinessException("MALL_ORDER_STATUS_INVALID",
                    "订单状态 " + order.getStatus() + " 不允许发货");
        }
        UpdateWrapper<HrMallOrder> uw = new UpdateWrapper<>();
        uw.eq("id", orderId).eq("tenant_id", currentTenantId())
                .set("status", "SHIPPED")
                .set("express_no", expressNo)
                .set("shipped_at", LocalDateTime.now())
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        orderMapper.update(null, uw);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(Long orderId, String reason) {
        HrMallOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new HrBusinessException("MALL_ORDER_NOT_FOUND", "订单不存在：" + orderId);
        }
        if ("SHIPPED".equals(order.getStatus()) || "COMPLETED".equals(order.getStatus())
                || "CANCELLED".equals(order.getStatus())) {
            throw new HrBusinessException("MALL_ORDER_STATUS_INVALID",
                    "订单状态 " + order.getStatus() + " 不允许取消");
        }
        refundAndRestore(order, reason);
        UpdateWrapper<HrMallOrder> uw = new UpdateWrapper<>();
        uw.eq("id", orderId).eq("tenant_id", currentTenantId())
                .set("status", "CANCELLED")
                .set("remark", reason)
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        orderMapper.update(null, uw);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void complete(Long orderId) {
        HrMallOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new HrBusinessException("MALL_ORDER_NOT_FOUND", "订单不存在：" + orderId);
        }
        if (!"SHIPPED".equals(order.getStatus())) {
            throw new HrBusinessException("MALL_ORDER_STATUS_INVALID",
                    "订单状态 " + order.getStatus() + " 不允许确认收货");
        }
        UpdateWrapper<HrMallOrder> uw = new UpdateWrapper<>();
        uw.eq("id", orderId).eq("tenant_id", currentTenantId())
                .set("status", "COMPLETED")
                .set("completed_at", LocalDateTime.now())
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        orderMapper.update(null, uw);
    }

    private void refundAndRestore(HrMallOrder order, String reason) {
        HrPointAccount account = pointAccountService.findOrCreateAccount(order.getEmployeeId());
        pointAccountService.credit(account.getId(), order.getTotalPoints(),
                "MALL_ORDER", order.getId(), "订单退回-" + order.getOrderNo()
                        + (StringUtils.hasText(reason) ? "-" + reason : ""));
        QueryWrapper<HrMallOrderItem> qw = new QueryWrapper<>();
        qw.eq("order_id", order.getId()).eq("deleted", 0);
        List<HrMallOrderItem> items = orderItemMapper.selectList(qw);
        for (HrMallOrderItem oi : items) {
            mallItemService.restoreStock(oi.getItemId(), oi.getQuantity());
        }
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}
