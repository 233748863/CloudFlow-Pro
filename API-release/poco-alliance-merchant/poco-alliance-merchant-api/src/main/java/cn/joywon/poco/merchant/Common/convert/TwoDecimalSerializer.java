package cn.joywon.poco.merchant.Common.convert;

import cn.hutool.core.util.ObjUtil;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 两位小数序列化器
 */
public class TwoDecimalSerializer extends JsonSerializer<BigDecimal> {

    @Override
    public void serialize(BigDecimal value, JsonGenerator gen, SerializerProvider ser) throws IOException {
        // 处理null值
        if (ObjUtil.isNull(value)) {
            gen.writeString("无");
            return;
        }
        if (value.compareTo(BigDecimal.ZERO) == 0) {
            gen.writeString("无");
            return;
        }
        // 保留两位小数
        BigDecimal scaledValue = value.setScale(2, RoundingMode.DOWN);
        gen.writeString(scaledValue.toString());
    }

}