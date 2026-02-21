package com.cloudflow.workflow.domain.vo;

import lombok.Data;

/**
 * 用户简要信息VO
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
public class UserBriefVO {

    /**
     * 用户ID
     */
    private Long userId;

    /**
     * 用户名
     */
    private String username;

    /**
     * 姓名
     */
    private String nickName;

    /**
     * 部门ID
     */
    private Long deptId;

    /**
     * 部门名称
     */
    private String deptName;

    /**
     * 邮箱
     */
    private String email;

    /**
     * 手机号
     */
    private String phonenumber;
}
