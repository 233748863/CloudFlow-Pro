package com.cloudflow.common.message.api;

import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 消息接收方。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MessageReceiver {
    private String receiverType;
    private Long receiverId;
    @JsonAlias({"receiverAddr", "receiver_address"})
    private String receiverAddress;
    private String receiverName;

    public static MessageReceiver ofUser(Long userId) {
        return builder().receiverType("USER").receiverId(userId).build();
    }

    public static MessageReceiver ofRole(Long roleId) {
        return builder().receiverType("ROLE").receiverId(roleId).build();
    }

    public static MessageReceiver ofDepartment(Long deptId) {
        return builder().receiverType("DEPT").receiverId(deptId).build();
    }

    public static MessageReceiver ofAddress(String type, String address) {
        return builder().receiverType(type).receiverAddress(address).build();
    }
}
