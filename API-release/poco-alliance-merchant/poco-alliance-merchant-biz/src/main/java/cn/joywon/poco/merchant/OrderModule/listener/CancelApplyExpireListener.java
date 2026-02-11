/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.merchant.OrderModule.listener;

import cn.joywon.poco.merchant.OrderModule.service.OrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.listener.KeyExpirationEventMessageListener;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;

/**
 * 取消申请过期监听器
 * 用于处理24小时未审核自动通过
 *
 * @author poco
 * @date 2025-11-23
 */
@Slf4j
@Component
public class CancelApplyExpireListener extends KeyExpirationEventMessageListener {

    @Autowired
    private OrderService orderService;

    public CancelApplyExpireListener(RedisMessageListenerContainer listenerContainer) {
        super(listenerContainer);
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String expiredKey = message.toString();
        // 监听 key: poco:merchant:order:cancel:auto:{applyId}
        if (expiredKey != null && expiredKey.startsWith("poco:merchant:order:cancel:auto:")) {
            try {
                String applyIdStr = expiredKey.substring("poco:merchant:order:cancel:auto:".length());
                Long applyId = Long.parseLong(applyIdStr);
                
                log.info("收到取消申请自动通过消息，applyId: {}", applyId);
                orderService.autoApproveCancelApply(applyId);
                
            } catch (Exception e) {
                log.error("处理取消申请自动通过失败, key: {}", expiredKey, e);
            }
        }
    }
}
