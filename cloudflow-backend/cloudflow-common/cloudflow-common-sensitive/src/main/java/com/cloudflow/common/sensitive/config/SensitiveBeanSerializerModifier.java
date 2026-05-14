package com.cloudflow.common.sensitive.config;

import com.cloudflow.common.sensitive.annotation.Sensitive;
import com.cloudflow.common.sensitive.enums.SensitiveType;
import com.cloudflow.common.sensitive.jackson.SensitiveJsonSerializer;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.fasterxml.jackson.databind.BeanDescription;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.SerializationConfig;
import com.fasterxml.jackson.databind.ser.BeanPropertyWriter;
import com.fasterxml.jackson.databind.ser.BeanSerializerModifier;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 为敏感字段挂载脱敏序列化器。
 */
public class SensitiveBeanSerializerModifier extends BeanSerializerModifier {

    @Override
    public List<BeanPropertyWriter> changeProperties(SerializationConfig config,
                                                     BeanDescription beanDesc,
                                                     List<BeanPropertyWriter> beanProperties) {
        List<BeanPropertyWriter> result = new ArrayList<>(beanProperties.size());
        for (BeanPropertyWriter writer : beanProperties) {
            BeanPropertyWriter candidate = writer;
            Sensitive sensitive = findSensitive(writer);
            if (sensitive != null) {
                candidate.assignSerializer(new SensitiveJsonSerializer(
                    sensitive.type(),
                    writer.getName(),
                    Arrays.asList(sensitive.extraSensitiveFields())
                ));
            } else if (supportsAutoMask(writer.getType()) && SensitiveUtils.isSensitiveField(writer.getName())) {
                candidate.assignSerializer(new SensitiveJsonSerializer(SensitiveType.AUTO, writer.getName(), List.of()));
            }
            result.add(candidate);
        }
        return result;
    }

    private Sensitive findSensitive(BeanPropertyWriter writer) {
        if (writer.getMember() == null) {
            return null;
        }
        return writer.getMember().getAnnotation(Sensitive.class);
    }

    private boolean supportsAutoMask(JavaType javaType) {
        return javaType != null && CharSequence.class.isAssignableFrom(javaType.getRawClass());
    }
}
