package cn.joywon.poco.merchant.Common.convert;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;
import java.lang.reflect.Method;

public class EnumFullPropertySerializer extends JsonSerializer<Enum<?>> {

    @Override
    public void serialize(Enum<?> enu, JsonGenerator gen, SerializerProvider ser) throws IOException {
        // 开始构建JSON对象
        gen.writeStartObject();

        try {
            // 1. 反射获取getValue()方法并调用（获取value值）
            Method getValueMethod = enu.getClass().getMethod("getValue");
            Object value = getValueMethod.invoke(enu);
            gen.writeObjectField("value", value);

            // 2. 反射获取getDesc()方法并调用（获取desc值）
            Method getDescMethod = enu.getClass().getMethod("getDesc");
            Object desc = getDescMethod.invoke(enu);
            gen.writeObjectField("desc", desc);

        } catch (Exception e) {
            // 若枚举无value/desc的getter，降级返回枚举name（避免序列化失败）
            gen.writeStringField("name", enu.name());
        }

        // 结束JSON对象
        gen.writeEndObject();


    }


}