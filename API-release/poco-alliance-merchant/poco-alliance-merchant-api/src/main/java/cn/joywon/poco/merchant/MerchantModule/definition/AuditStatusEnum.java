package cn.joywon.poco.merchant.MerchantModule.definition;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 商户审核状态枚举
 */
@Getter
@AllArgsConstructor
public enum AuditStatusEnum {

    // 审核类型
    CREATE("CREATE", "审核类型-创建"),
    DELETE("DELETE", "审核类型-删除"),
    REVISION("REVISION", "审核类型-信息修改"),
    BIZ_STATUS("BIZ_STATUS", "审核类型-营业状态修改"),

    // 审核状态
    PENDING("PENDING", "审核状态-待审核"),
    APPROVED("APPROVED", "审核状态-审核通过"),
    REJECTED("REJECTED", "审核状态-审核拒绝");

    @EnumValue
    @JsonValue
    private final String value;
    private final String desc;

    /**
     * 审核结果正则匹配表达式
     */
    public static final String AUDIT_RESULT_REGEX_PATTERN = "^(APPROVED|REJECTED)$";

    /**
     * 商家审核类型正则匹配表达式
     */
    public static final String AUDIT_TYPE_MERCHANT_REGEX_PATTERN = "^(CREATE|REVISION)$";

    /**
     * 门店审核类型正则匹配表达式
     */
    public static final String AUDIT_TYPE_STORE_REGEX_PATTERN = "^(CREATE|DELETE|REVISION|BIZ_STATUS)$";

    /**
     * 审核状态正则匹配表达式
     */
    public static final String AUDIT_STATUS_REGEX_PATTERN = "^(PENDING|APPROVED|REJECTED)$";

}