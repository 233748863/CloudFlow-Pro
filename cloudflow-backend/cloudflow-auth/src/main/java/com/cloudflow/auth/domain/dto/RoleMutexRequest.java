package com.cloudflow.auth.domain.dto;

import lombok.Data;

@Data
public class RoleMutexRequest {

    private Long roleId1;

    private Long roleId2;
}
