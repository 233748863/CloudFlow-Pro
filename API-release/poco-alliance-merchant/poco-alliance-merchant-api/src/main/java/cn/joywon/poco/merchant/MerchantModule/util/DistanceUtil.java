package cn.joywon.poco.merchant.MerchantModule.util;

import org.apache.commons.math3.util.FastMath;

public class DistanceUtil {

    private static final double EARTH_RADIUS_KM = 6371.0;

    public static double calculateDistance(double lat1, double lon1, double lat2, double lon2) {

        // 将角度转换为弧度
        double lat1Rad = FastMath.toRadians(lat1);
        double lon1Rad = FastMath.toRadians(lon1);
        double lat2Rad = FastMath.toRadians(lat2);
        double lon2Rad = FastMath.toRadians(lon2);

        // Haversine 公式计算
        double deltaLat = lat2Rad - lat1Rad;
        double deltaLon = lon2Rad - lon1Rad;

        double a = FastMath.pow(FastMath.sin(deltaLat / 2), 2) +
                FastMath.cos(lat1Rad) * FastMath.cos(lat2Rad) *
                        FastMath.pow(FastMath.sin(deltaLon / 2), 2);

        double c = 2 * FastMath.atan2(FastMath.sqrt(a), FastMath.sqrt(1 - a));

        // 距离 = 半径 * 中心角 (弧度)
        return EARTH_RADIUS_KM * c;
    }

}