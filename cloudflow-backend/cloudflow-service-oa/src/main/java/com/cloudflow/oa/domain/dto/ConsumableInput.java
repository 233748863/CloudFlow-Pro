package com.cloudflow.oa.domain.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;
import java.math.BigDecimal;

public abstract class ConsumableInput {
    @JsonAnySetter
    public final void unexpected(String field, Object value) {
        throw new IllegalArgumentException("不允许提交字段：" + field);
    }

    public static class IntegerValue extends JsonDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
                throw new IllegalArgumentException("数量及版本必须为整数");
            }
            try {
                return parser.getBigIntegerValue().intValueExact();
            } catch (ArithmeticException exception) {
                throw new IllegalArgumentException("整数超出允许范围", exception);
            }
        }
    }

    public static class MoneyValue extends JsonDeserializer<BigDecimal> {
        @Override
        public BigDecimal deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_STRING)
                    || !parser.getText().matches("[0-9]{1,8}(\\.[0-9]{1,2})?")) {
                throw new IllegalArgumentException("金额须为0至99999999.99的十进制字符串，最多两位小数");
            }
            return new BigDecimal(parser.getText()).setScale(2);
        }
    }
}
