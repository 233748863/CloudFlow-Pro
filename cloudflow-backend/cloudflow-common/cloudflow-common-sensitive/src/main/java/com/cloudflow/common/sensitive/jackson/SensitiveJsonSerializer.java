package com.cloudflow.common.sensitive.jackson;

import com.cloudflow.common.sensitive.annotation.Sensitive;
import com.cloudflow.common.sensitive.enums.SensitiveType;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.BeanProperty;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.ContextualSerializer;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;

/**
 * 敏感字段序列化器。
 */
public class SensitiveJsonSerializer extends StdSerializer<Object> implements ContextualSerializer {

    private final SensitiveType sensitiveType;
    private final String fieldName;
    private final Collection<String> extraSensitiveFields;

    public SensitiveJsonSerializer() {
        this(SensitiveType.AUTO, null, Collections.emptyList());
    }

    public SensitiveJsonSerializer(SensitiveType sensitiveType, String fieldName, Collection<String> extraSensitiveFields) {
        super(Object.class);
        this.sensitiveType = sensitiveType;
        this.fieldName = fieldName;
        this.extraSensitiveFields = extraSensitiveFields == null ? Collections.emptyList() : extraSensitiveFields;
    }

    @Override
    public void serialize(Object value, JsonGenerator gen, SerializerProvider provider) throws IOException {
        if (value == null) {
            provider.defaultSerializeNull(gen);
            return;
        }
        gen.writeString(maskValue(value));
    }

    @Override
    public JsonSerializer<?> createContextual(SerializerProvider provider, BeanProperty property) throws JsonMappingException {
        if (property == null) {
            return this;
        }
        Sensitive sensitive = property.getAnnotation(Sensitive.class);
        if (sensitive == null) {
            sensitive = property.getContextAnnotation(Sensitive.class);
        }
        if (sensitive == null) {
            return provider.findValueSerializer(property.getType(), property);
        }
        return new SensitiveJsonSerializer(sensitive.type(), property.getName(), Arrays.asList(sensitive.extraSensitiveFields()));
    }

    private String maskValue(Object value) {
        String text = String.valueOf(value);
        return switch (sensitiveType) {
            case SECRET -> SensitiveUtils.maskSecret(text);
            case PHONE -> SensitiveUtils.maskPhone(text);
            case EMAIL -> SensitiveUtils.maskEmail(text);
            case ID_CARD -> SensitiveUtils.maskIdCard(text);
            case BANK_CARD -> SensitiveUtils.maskBankCard(text);
            case ADDRESS -> SensitiveUtils.maskAddress(text);
            case DEFAULT -> SensitiveUtils.maskDefault(text);
            case AUTO -> SensitiveUtils.maskByFieldName(fieldName, text, extraSensitiveFields);
        };
    }
}
