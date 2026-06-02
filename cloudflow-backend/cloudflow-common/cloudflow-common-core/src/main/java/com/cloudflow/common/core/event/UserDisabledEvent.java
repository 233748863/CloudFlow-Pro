package com.cloudflow.common.core.event;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
public class UserDisabledEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long userId;
    private String userName;
    private Long deptId;
    private LocalDateTime disabledAt;
}
