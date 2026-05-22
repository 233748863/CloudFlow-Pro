package com.cloudflow.hr.service;

import java.util.Map;

public interface HrMallItemService {

    Long createItem(Map<String, Object> payload);

    void updateItem(Long itemId, Map<String, Object> payload);

    Map<String, Object> page(Map<String, Object> query);

    Map<String, Object> get(Long itemId);

    void onShelf(Long itemId);

    void offShelf(Long itemId);

    int deductStock(Long itemId, Integer quantity);

    int restoreStock(Long itemId, Integer quantity);
}
