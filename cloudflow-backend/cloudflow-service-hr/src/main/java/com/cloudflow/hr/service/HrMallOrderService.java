package com.cloudflow.hr.service;

import java.util.Map;

public interface HrMallOrderService {

    Long placeOrder(Map<String, Object> payload);

    Map<String, Object> page(Map<String, Object> query);

    Map<String, Object> listMine(Map<String, Object> query);

    Map<String, Object> get(Long orderId);

    void ship(Long orderId, String expressNo);

    void cancel(Long orderId, String reason);

    void complete(Long orderId);
}
