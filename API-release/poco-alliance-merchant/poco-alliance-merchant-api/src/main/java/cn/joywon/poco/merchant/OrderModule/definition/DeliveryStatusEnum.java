package cn.joywon.poco.merchant.OrderModule.definition;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "配送状态枚举")
public enum DeliveryStatusEnum {
    CREATED("待配送创建"),
    ASSIGNED("已分配"),
    PICKED("已取件"),
    DELIVERING("配送中"),
    DELIVERED("已送达"),
    FAILED("配送失败"),
    CANCELLED("已取消");

    private final String desc;

    DeliveryStatusEnum(String desc) {
        this.desc = desc;
    }

    public String getDesc() {
        return desc;
    }

    public static String descriptionOf(String code) {
        try {
            return DeliveryStatusEnum.valueOf(code).getDesc();
        } catch (Exception e) {
            return code;
        }
    }
}