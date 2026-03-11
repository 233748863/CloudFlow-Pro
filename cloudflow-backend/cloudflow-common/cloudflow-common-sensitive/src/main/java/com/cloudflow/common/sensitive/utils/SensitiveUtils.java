package com.cloudflow.common.sensitive.utils;

import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * ??????????
 * <p>
 * ?????
 * 1. ??????????????????Token ??????????
 * 2. ????????????????????????????
 * 3. ?? Map / List / ?? / Java Bean ??????????????????
 * </p>
 */
public final class SensitiveUtils {

    private static final int MAX_RECURSION_DEPTH = 8;

    private static final Set<String> SECRET_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "password", "pwd", "secret", "token", "accessToken", "refreshToken", "authorization"
    ));

    private static final Set<String> PHONE_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "phone", "mobile", "telephone", "phonenumber", "???", "??"
    ));

    private static final Set<String> EMAIL_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "email", "??"
    ));

    private static final Set<String> ID_CARD_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "idCard", "idcard", "idNumber", "identityCard", "identity", "???"
    ));

    private static final Set<String> BANK_CARD_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "bankCard", "bankAccount", "creditCard", "???", "bank"
    ));

    private static final Set<String> ADDRESS_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "address", "??"
    ));

    private SensitiveUtils() {
    }

    /**
     * ??????????????
     */
    public static boolean isSensitiveField(String fieldName) {
        if (!hasText(fieldName)) {
            return false;
        }
        return matchesAnyKeyword(fieldName, SECRET_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, PHONE_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, EMAIL_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, ID_CARD_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, BANK_CARD_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, ADDRESS_FIELD_KEYWORDS);
    }

    /**
     * ???????????
     */
    public static String maskByFieldName(String fieldName, String value) {
        if (!hasText(value)) {
            return value;
        }
        if (!hasText(fieldName)) {
            return maskDefault(value);
        }
        if (matchesAnyKeyword(fieldName, SECRET_FIELD_KEYWORDS)) {
            return maskSecret(value);
        }
        if (matchesAnyKeyword(fieldName, PHONE_FIELD_KEYWORDS)) {
            return maskPhone(value);
        }
        if (matchesAnyKeyword(fieldName, EMAIL_FIELD_KEYWORDS)) {
            return maskEmail(value);
        }
        if (matchesAnyKeyword(fieldName, ID_CARD_FIELD_KEYWORDS)) {
            return maskIdCard(value);
        }
        if (matchesAnyKeyword(fieldName, BANK_CARD_FIELD_KEYWORDS)) {
            return maskBankCard(value);
        }
        if (matchesAnyKeyword(fieldName, ADDRESS_FIELD_KEYWORDS)) {
            return maskAddress(value);
        }
        return maskDefault(value);
    }

    /**
     * ??????13812345678 -> 138****5678
     */
    public static String maskPhone(String phone) {
        if (!hasText(phone) || phone.length() < 7) {
            return phone;
        }
        return phone.replaceAll("(\d{3})\d{4}(\d+)", "$1****$2");
    }

    /**
     * ?????user@example.com -> u***@example.com
     */
    public static String maskEmail(String email) {
        if (!hasText(email) || !email.contains("@")) {
            return email;
        }
        int atIndex = email.indexOf('@');
        if (atIndex <= 1) {
            return "***" + email.substring(atIndex);
        }
        return email.charAt(0) + "***" + email.substring(atIndex);
    }

    /**
     * ??????110101199001011234 -> 110101****1234
     */
    public static String maskIdCard(String idCard) {
        if (!hasText(idCard) || idCard.length() < 8) {
            return idCard;
        }
        return idCard.replaceAll("(.{6}).+(.{4})", "$1****$2");
    }

    /**
     * ??????6222021234567890 -> 6222 **** **** 7890
     */
    public static String maskBankCard(String bankCard) {
        if (!hasText(bankCard) || bankCard.length() < 8) {
            return bankCard;
        }
        String compact = bankCard.replaceAll("\s+", "");
        if (compact.length() < 8) {
            return bankCard;
        }
        return compact.substring(0, 4) + " **** **** " + compact.substring(compact.length() - 4);
    }

    /**
     * ???????? 6 ?????????
     */
    public static String maskAddress(String address) {
        if (!hasText(address) || address.length() <= 6) {
            return maskDefault(address);
        }
        return address.substring(0, 6) + "****";
    }

    /**
     * ?? / Token ????????????
     */
    public static String maskSecret(String secret) {
        if (!hasText(secret)) {
            return secret;
        }
        return "******";
    }

    /**
     * ???????????? 1/4?
     */
    public static String maskDefault(String value) {
        if (!hasText(value)) {
            return value;
        }
        if (value.length() <= 4) {
            return "****";
        }
        int quarter = Math.max(1, value.length() / 4);
        return value.substring(0, quarter) + "****" + value.substring(value.length() - quarter);
    }

    /**
     * ?????????????
     * <p>
     * extraSensitiveFields ?????????????????
     * </p>
     */
    public static Map<String, String[]> maskRequestParams(Map<String, String[]> paramsMap, Collection<String> extraSensitiveFields) {
        if (paramsMap == null || paramsMap.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, String[]> result = new LinkedHashMap<>();
        for (Map.Entry<String, String[]> entry : paramsMap.entrySet()) {
            String fieldName = entry.getKey();
            String[] values = entry.getValue();
            if (values == null) {
                result.put(fieldName, null);
                continue;
            }
            boolean shouldMask = isSensitiveField(fieldName) || matchesAnyKeyword(fieldName, extraSensitiveFields);
            if (!shouldMask) {
                result.put(fieldName, values);
                continue;
            }
            String[] maskedValues = new String[values.length];
            for (int index = 0; index < values.length; index++) {
                maskedValues[index] = maskByFieldName(fieldName, values[index]);
            }
            result.put(fieldName, maskedValues);
        }
        return result;
    }

    /**
     * ? Map ?????????
     */
    public static Map<String, Object> maskMap(Map<String, ?> data) {
        Object masked = maskObject(data);
        if (masked instanceof Map<?, ?> maskedMap) {
            Map<String, Object> result = new LinkedHashMap<>();
            maskedMap.forEach((key, value) -> result.put(String.valueOf(key), value));
            return result;
        }
        return Collections.emptyMap();
    }

    /**
     * ?????????????????????????
     */
    public static Object maskObject(Object source) {
        return maskObjectInternal(source, null, new IdentityHashMap<>(), 0);
    }

    private static Object maskObjectInternal(Object source,
                                             String fieldName,
                                             IdentityHashMap<Object, Boolean> visited,
                                             int depth) {
        if (source == null) {
            return null;
        }
        if (fieldName != null && isSensitiveField(fieldName)) {
            return maskByFieldName(fieldName, String.valueOf(source));
        }
        Class<?> sourceClass = source.getClass();
        if (isSimpleValueType(sourceClass)) {
            return source;
        }
        if (depth >= MAX_RECURSION_DEPTH) {
            return String.valueOf(source);
        }
        if (visited.containsKey(source)) {
            return "[Circular]";
        }

        visited.put(source, Boolean.TRUE);
        try {
            if (source instanceof Map<?, ?> sourceMap) {
                Map<String, Object> result = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : sourceMap.entrySet()) {
                    String childFieldName = entry.getKey() == null ? null : String.valueOf(entry.getKey());
                    result.put(childFieldName, maskObjectInternal(entry.getValue(), childFieldName, visited, depth + 1));
                }
                return result;
            }
            if (source instanceof Collection<?> sourceCollection) {
                List<Object> result = new ArrayList<>(sourceCollection.size());
                for (Object item : sourceCollection) {
                    result.add(maskObjectInternal(item, null, visited, depth + 1));
                }
                return result;
            }
            if (sourceClass.isArray()) {
                int length = Array.getLength(source);
                List<Object> result = new ArrayList<>(length);
                for (int index = 0; index < length; index++) {
                    result.add(maskObjectInternal(Array.get(source, index), null, visited, depth + 1));
                }
                return result;
            }
            if (isJavaPlatformType(sourceClass)) {
                return String.valueOf(source);
            }

            Map<String, Object> beanMap = new LinkedHashMap<>();
            for (Field field : getAllFields(sourceClass)) {
                if (field.isSynthetic()) {
                    continue;
                }
                int modifiers = field.getModifiers();
                if (Modifier.isStatic(modifiers) || Modifier.isTransient(modifiers)) {
                    continue;
                }
                field.setAccessible(true);
                Object fieldValue = field.get(source);
                beanMap.put(field.getName(), maskObjectInternal(fieldValue, field.getName(), visited, depth + 1));
            }
            return beanMap;
        } catch (IllegalAccessException exception) {
            return String.valueOf(source);
        } finally {
            visited.remove(source);
        }
    }

    private static boolean isSimpleValueType(Class<?> clazz) {
        return clazz.isPrimitive()
            || CharSequence.class.isAssignableFrom(clazz)
            || Number.class.isAssignableFrom(clazz)
            || Boolean.class.isAssignableFrom(clazz)
            || Character.class.isAssignableFrom(clazz)
            || Enum.class.isAssignableFrom(clazz)
            || TemporalAccessor.class.isAssignableFrom(clazz)
            || Date.class.isAssignableFrom(clazz)
            || UUID.class.isAssignableFrom(clazz)
            || Locale.class.isAssignableFrom(clazz)
            || Class.class.isAssignableFrom(clazz)
            || BigDecimal.class.isAssignableFrom(clazz)
            || BigInteger.class.isAssignableFrom(clazz);
    }

    private static boolean isJavaPlatformType(Class<?> clazz) {
        Package sourcePackage = clazz.getPackage();
        if (sourcePackage == null) {
            return false;
        }
        String packageName = sourcePackage.getName();
        return packageName.startsWith("java.") || packageName.startsWith("javax.") || packageName.startsWith("jakarta.");
    }

    private static List<Field> getAllFields(Class<?> clazz) {
        List<Field> fields = new ArrayList<>();
        Class<?> current = clazz;
        while (current != null && current != Object.class) {
            fields.addAll(Arrays.asList(current.getDeclaredFields()));
            current = current.getSuperclass();
        }
        return fields;
    }

    private static boolean matchesAnyKeyword(String fieldName, Collection<String> keywords) {
        if (!hasText(fieldName) || keywords == null || keywords.isEmpty()) {
            return false;
        }
        String lowerFieldName = fieldName.toLowerCase(Locale.ROOT);
        for (String keyword : keywords) {
            if (!hasText(keyword)) {
                continue;
            }
            if (lowerFieldName.contains(keyword.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
