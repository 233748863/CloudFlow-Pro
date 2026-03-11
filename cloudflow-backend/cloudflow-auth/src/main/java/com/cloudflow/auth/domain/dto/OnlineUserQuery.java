package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 在线用户查询条件。
 */
@Data
public class OnlineUserQuery {

    private String username;

    private String nickName;

    private String deptName;

    private Long tenantId;
}
