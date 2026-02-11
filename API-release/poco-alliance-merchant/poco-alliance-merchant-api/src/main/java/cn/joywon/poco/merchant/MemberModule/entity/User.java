package cn.joywon.poco.merchant.MemberModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户表 `users` 实体
 */
@Data
@TableName("users")
public class User {

    /**
     * 主键ID
     */
    @TableId(value = "user_id")
    private Long userId;

    /**
     * 微信 OpenID
     */
    private String wxOpenid;

    /**
     * 用户昵称
     */
    private String nickname;

    /**
     * 用户头像URL
     */
    private String avatar;

    /**
     * 用户手机号
     */
    private String phone;

    /**
     * 用户性别: 0-未知; 1-男; 2-女
     */
    private Integer gender;

    /**
     * 用户所在城市
     */
    private Integer cityCode;

    /**
     * 用户所在省份
     */
    private Integer provinceCode;

    /**
     * 所在地区(省份 + 城市)
     */
    private String location;

    /**
     * 用户积分账户ID
     */
    private Long pointsAccount;

    /**
     * 用户等级ID
     */
    private Long levelId;

    /**
     * 账号状态: NORMAL-正常; BANNED-封禁
     */
    // 使用枚举
    private String status;

    /**
     * 最后登录时间
     */
    private LocalDateTime lastLoginTime;

    /**
     * 个人邀请码
     */
    private String inviteCode;

    /**
     * 邀请注册的用户ID (`users`.id)
     */
    private Long inviterId;

    /**
     * 账号状态: true-正常; false-禁用
     */
    @TableField("is_enable")
    private Boolean enable;

    /**
     * 乐观锁版本号
     */
    @Version
    private Integer version;

    /**
     * 创建人ID
     */
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;

    /**
     * 创建时间
     */
    private LocalDateTime createdTime;

    /**
     * 修改人ID
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    /**
     * 修改时间
     */
    private LocalDateTime updatedTime;

    /**
     * 删除标识
     */
    @TableField("is_deleted")
    @TableLogic(value = "false", delval = "true")
    private Boolean deleted;

    /**
     * 删除时间
     */
    private LocalDateTime deletedTime;

}