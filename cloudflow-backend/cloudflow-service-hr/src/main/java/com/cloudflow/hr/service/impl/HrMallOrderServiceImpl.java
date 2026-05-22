package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.entity.HrMallItem;
import com.cloudflow.hr.domain.entity.HrMallOrder;
import com.cloudflow.hr.domain.entity.HrMallOrderItem;
import com.cloudflow.hr.domain.entity.HrPointAccount;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrMallItemMapper;
import com.cloudflow.hr.mapper.HrMallOrderItemMapper;
import com.cloudflow.hr.mapper.HrMallOrderMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.hr.service.HrMallItemService;
import com.cloudflow.hr.service.HrMallOrderService;
import com.cloudflow.hr.service.HrPointAccountService;
import com.cloudflow.hr.service.HrTypedCrudService;
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
public class HrMallOrderServiceImpl implements HrMallOrderService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrMallOrderMapper orderMapper;
    private final HrMallOrderItemMapper orderItemMapper;
    private final HrMallItemMapper itemMapper;
    private final HrPointAccountService pointAccountService;
    private final HrMallItemService mallItemService;
    private final HrTypedCrudService crudService;
    private final WorkflowServiceClient workflowServiceClient;
    private final ObjectMapper objectMapper;

    @Value("${cloudflow.hr.mall.order-process-key:wf_hr_mall_order}")
    private String mallOrderProcessKey;

    @Value("${cloudflow.hr.mall.approval-threshold:5000}")
    private int approvalThreshold;

    @Override
    @Transactional(rollbackFor = Exception.class)
    @SuppressWarnings("unchecked")
    public Long placeOrder(Map<String, Object> payload) {
        if (payload == null) {
            throw new HrBusinessException("INVALID_PAYLOAD", "下单参数不能为空");
        }
        Long employeeId = payload.get("employeeId") == null
                ? UserContext.getUserId()
                : Long.valueOf(payload.get("employeeId").toString());
        if (employeeId == null) {
            throw new HrBusinessException("UNAUTHORIZED", "未登录用户无法下单");
        }
        List<Map<String, Object>> items = (List<Map<String, Object>>) payload.get("items");
        if (items == null || items.isEmpty()) {
            throw new HrBusinessException("EMPTY_ORDER", "订单明细不能为空");
        }

        int totalPoints = 0;
        List<HrMallOrderItem> orderItems = new ArrayList<>();
        List<HrMallItem> snapshots = new ArrayList<>();
        for (Map<String, Object> entry : items) {
            Long itemId = Long.valueOf(entry.get("itemId").toString());
            Integer quantity = Integer.valueOf(entry.get("quantity").toString());
            if (quantity == null || quantity <= 0) {
                throw new HrBusinessException("INVALID_QUANTITY", "商品数量必须为正数");
            }
            HrMallItem item = itemMapper.selectById(itemId);
            if (item == null || Integer.valueOf(1).equals(item.getDeleted())) {
                throw new HrBusinessException("MALL_ITEM_NOT_FOUND", "商品不存在：" + itemId);
            }
            if (!"ON_SHELF".equals(item.getStatus())) {
                throw new HrBusinessException("MALL_ITEM_OFF_SHELF", "商品已下架：" + item.getItemName());
            }
            int subtotal = item.getPointPrice() * quantity;
            totalPoints += subtotal;
            snapshots.add(item);
            HrMallOrderItem oi = new HrMallOrderItem();
            oi.setTenantId(currentTenantId());
            oi.setItemId(itemId);
            oi.setItemName(item.getItemName());
            oi.setPointPrice(item.getPointPrice());
            oi.setQuantity(quantity);
            oi.setSubtotal(subtotal);
            oi.setDeleted(0);
            oi.setCreateBy(currentUserName());
            oi.setUpdateBy(currentUserName());
            orderItems.add(oi);
        }

        HrPointAccount account = pointAccountService.findOrCreateAccount(employeeId);
        HrMallOrder order = new HrMallOrder();
        order.setTenantId(currentTenantId());
        order.setOrderNo("MO-" + System.currentTimeMillis() + "-" + employeeId);
        order.setEmployeeId(employeeId);
        order.setTotalPoints(totalPoints);
        order.setReceiverName((String) payload.get("receiverName"));
        order.setReceiverPhone((String) payload.get("receiverPhone"));
        order.setReceiverAddress((String) payload.get("receiverAddress"));
        order.setStatus("PENDING");
        order.setRemark((String) payload.get("remark"));
        order.setDeleted(0);
        order.setCreateBy(currentUserName());
        order.setUpdateBy(currentUserName());
        orderMapper.insert(order);

        for (int i = 0; i < orderItems.size(); i++) {
            HrMallOrderItem oi = orderItems.get(i);
            oi.setOrderId(order.getId());
            orderItemMapper.insert(oi);
            mallItemService.deductStock(snapshots.get(i).getId(), oi.getQuantity());
        }

        pointAccountService.debit(account.getId(), totalPoints, "MALL_ORDER", order.getId(),
                "积分商城兑换-" + order.getOrderNo());

        if (totalPoints >= approvalThreshold) {
            ProcessStartDTO dto = new ProcessStartDTO();
            dto.setTenantId(currentTenantId());
            dto.setProcessDefinitionKey(mallOrderProcessKey);
            dto.setBusinessType("HR_MALL_ORDER");
            dto.setBusinessId(order.getId());
            dto.setBusinessNo(order.getOrderNo());
            dto.setProcessTitle("积分商城兑换-" + order.getOrderNo());
            dto.setStartUserId(UserContext.getUserId());
            Map<String, Object> vars = new LinkedHashMap<>();
            vars.put("orderId", order.getId());
            vars.put("totalPoints", totalPoints);
            vars.put("employeeId", employeeId);
            dto.setVariables(vars);
            R<String> response = workflowServiceClient.startProcess(dto);
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
    public Map<String, Object> page(Map<String, Object> query) {
        return crudService.page(HrMallOrder.class, query);
    }

    @Override
    public Map<String, Object> listMine(Map<String, Object> query) {
        Map<String, Object> q = new LinkedHashMap<>(query == null ? Map.of() : query);
        Long userId = UserContext.getUserId();
        if (userId != null) {
            q.put("employeeId", userId);
        }
        return crudService.page(HrMallOrder.class, q);
    }

    @Override
    public Map<String, Object> get(Long orderId) {
        HrMallOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new HrBusinessException("MALL_ORDER_NOT_FOUND", "订单不存在：" + orderId);
        }
        Map<String, Object> result = objectMapper.convertValue(order,
                new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {});
        QueryWrapper<HrMallOrderItem> qw = new QueryWrapper<>();
        qw.eq("order_id", orderId).eq("deleted", 0);
        result.put("items", orderItemMapper.selectList(qw));
        return result;
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
