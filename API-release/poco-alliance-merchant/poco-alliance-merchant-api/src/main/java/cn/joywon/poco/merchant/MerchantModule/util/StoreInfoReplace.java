package cn.joywon.poco.merchant.MerchantModule.util;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

public class StoreInfoReplace {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    /**
     * 检查当前时间是否在商家营业时间内
     *
     * @param businessHours 商家营业时间(格式: "HH:mm-HH:mm")
     * @return 商家状态枚举(OPEN / RESTING)
     */
    public static BusinessStatusEnum withinBusinessHours(BusinessStatusEnum businessStatus, String businessHours) {
        if (businessStatus == BusinessStatusEnum.STORE_RESTING) {
            return BusinessStatusEnum.STORE_RESTING;
        }

        String[] businessHour = businessHours.split("-");
        LocalTime startTime = LocalTime.parse(businessHour[0], TIME_FORMATTER);
        LocalTime endTime = LocalTime.parse(businessHour[1], TIME_FORMATTER);
        boolean within = isWithin(endTime, startTime);

        return within ? BusinessStatusEnum.STORE_OPEN : BusinessStatusEnum.STORE_RESTING;
    }


    /**
     * 移除地区字符串中的分隔符"-"
     *
     * @param address 地址字符串
     * @return 移除分隔符后的地址字符串
     */
    public static String removeLocationSeparator(String address) {
        return address.replaceAll("-", "");
    }


    /**
     * 拼接街道级区域信息 + 详细地址
     *
     * @param address 地址字符串
     * @return 区域信息字符串
     */
    public static String replaceLocationSeparator(String address) {
        int index = address.lastIndexOf("-");
        if (index != -1 && index < address.length() - 1) {
            return address.substring(index + 1);
        }
        return "";
    }


    /**
     * 检查当前时间是否在指定时间范围内
     *
     * @param endTime   结束时间
     * @param startTime 开始时间
     * @return 是否在范围内
     */
    private static boolean isWithin(LocalTime endTime, LocalTime startTime) {
        LocalTime now = LocalTime.now();
        boolean within;
        if (endTime.isBefore(startTime) || endTime.equals(startTime)) {
            // 跨午夜: 时间要么 >= startTime 要么 <= endTime
            within = !now.isBefore(startTime) || !now.isAfter(endTime);
            // 等价于: now >= startTime || now <= endTime
        } else {
            // 不跨午夜: 时间必须 >= startTime 且 <= endTime
            within = !now.isBefore(startTime) && !now.isAfter(endTime);
            // 等价于: now >= startTime && now <= endTime
        }
        return within;
    }


}