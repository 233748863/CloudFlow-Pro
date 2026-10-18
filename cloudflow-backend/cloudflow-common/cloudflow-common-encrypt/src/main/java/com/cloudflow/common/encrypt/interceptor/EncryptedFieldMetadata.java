package com.cloudflow.common.encrypt.interceptor;

import com.cloudflow.common.encrypt.annotation.EncryptField;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

/** Class definitions only: no target objects, field values, keys or tenant state. */
final class EncryptedFieldMetadata {
    private static final ClassValue<List<EncryptedField>> FIELDS = new ClassValue<>() {
        @Override
        protected List<EncryptedField> computeValue(Class<?> type) {
            List<EncryptedField> fields = new ArrayList<>();
            for (Class<?> current = type; current != null && current != Object.class; current = current.getSuperclass()) {
                for (Field field : current.getDeclaredFields()) {
                    EncryptField annotation = field.getAnnotation(EncryptField.class);
                    if (annotation != null && field.getType() == String.class) {
                        fields.add(new EncryptedField(field, annotation));
                    }
                }
            }
            return List.copyOf(fields);
        }
    };

    private EncryptedFieldMetadata() {
    }

    static List<EncryptedField> fields(Class<?> type) {
        return FIELDS.get(type);
    }

    record EncryptedField(Field field, EncryptField annotation) {
    }
}
