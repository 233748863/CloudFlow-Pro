package cn.joywon.poco.merchant.Common.convert;

import cn.hutool.core.util.ObjUtil;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdScalarSerializer;

import java.io.IOException;
import java.io.Serial;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 优惠券统计序列化器
 */
public class CouponSerializer {

    /**
     * 优惠券发放总量序列化器
     */
    public static class CouponTotalQuantitySerializer extends StdScalarSerializer<Integer> {

        @Serial
        private static final long serialVersionUID = -7225826004645930447L;

        public CouponTotalQuantitySerializer() {
            super(Integer.class);
        }

        @Override
        public void serialize(Integer num, JsonGenerator gen, SerializerProvider ser) throws IOException {
            if (num != null && num == -1) {
                // 当值为-1时，序列化为"不限量"
                gen.writeString("不限量");
            } else {
                // 其他情况：若为null则序列化null，否则转为字符串
                if (num == null) {
                    gen.writeNull();
                } else {
                    gen.writeString(num.toString());
                }
            }
        }

    }


    /**
     * 优惠券领取转化率序列化器
     */
    public static class CouponConversionRateSerializer extends StdScalarSerializer<BigDecimal> {

        @Serial
        private static final long serialVersionUID = 1651203894660599349L;

        public CouponConversionRateSerializer() {
            super(BigDecimal.class);
        }

        @Override
        public void serialize(BigDecimal num, JsonGenerator gen, SerializerProvider ser) throws IOException {
            if (num == null || num.compareTo(BigDecimal.ZERO) == 0) {
                gen.writeString("无");
                return;
            }

            // 1. 转为百分比数值
            BigDecimal rate = num.multiply(new BigDecimal("100"));
            // 2. 保留两位小数(四舍五入)
            BigDecimal scaledRate = rate.setScale(2, RoundingMode.HALF_UP);
            // 3. 序列化为字符串
            gen.writeString(scaledRate + "%");
        }

    }


    /**
     * 优惠券返利率序列化器
     */
    public static class CouponRebateRateSerializer extends StdScalarSerializer<BigDecimal> {

        @Serial
        private static final long serialVersionUID = 8748813248762152553L;

        public CouponRebateRateSerializer() {
            super(BigDecimal.class);
        }

        @Override
        public void serialize(BigDecimal num, JsonGenerator gen, SerializerProvider ser) throws IOException {
            if (num == null || num.compareTo(BigDecimal.ZERO) == 0) {
                gen.writeString("无");
                return;
            }

            // 1. 转为百分比数值
            BigDecimal rate = num.multiply(new BigDecimal("100"));
            // 2. 保留8位小数(四舍五入)
            BigDecimal scaledRate = rate.setScale(8, RoundingMode.DOWN);
            // 3. 序列化为字符串
            gen.writeString(scaledRate + "%");
        }

    }


    /**
     * 折扣率序列化器, 将折扣率转换为字符串格式
     */
    public static class DiscountSerializer extends StdScalarSerializer<BigDecimal> {

        @Serial
        private static final long serialVersionUID = 9200228230117791195L;

        protected DiscountSerializer() {
            super(BigDecimal.class);
        }

        @Override
        public void serialize(BigDecimal value, JsonGenerator gen, SerializerProvider ser) throws IOException {
            if (!ObjUtil.isNotNull(value)) {
                gen.writeString("无");
                return;
            }

            if (value.compareTo(BigDecimal.ZERO) == 0) {
                gen.writeString("无");
                return;
            }

            BigDecimal scaled = value.setScale(2, RoundingMode.DOWN);
            int discountNum = scaled.multiply(new BigDecimal("100")).intValue();

            if (discountNum % 10 == 0) {
                gen.writeString((discountNum / 10) + "折");
            } else {
                gen.writeString((discountNum / 10) + "." + (discountNum % 10) + "折");
            }

        }

    }


    /**
     * 计算优惠券转化率
     *
     * @param receivedCount 已发放数量
     * @param usedCount     已核销数量
     * @return 转化率
     */
    public static BigDecimal calculateConversionRate(Integer receivedCount, Integer usedCount) {
        // 1. 处理null值: null视为0(无领取/无核销)
        int received = (receivedCount == null) ? 0 : receivedCount;
        int used = (usedCount == null) ? 0 : usedCount;
        // 2. 特殊情况: 领取数量为0时, 转化率为0(避免除0出现错误)
        if (received == 0) {
            return BigDecimal.ZERO;
        }
        // 3. 修正异常数据: 核销数量不能超过发放数量(避免转化率>100%)
        if (used > received) {
            used = received;
        }
        // 4. 核心计算: (核销数 ÷ 发放数), 保留4位小数(中间精度冗余, 避免后续格式化误差)
        return new BigDecimal(used)
                .divide(new BigDecimal(received), 4, RoundingMode.HALF_UP);
    }


}