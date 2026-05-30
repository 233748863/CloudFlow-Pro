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
 * 统一脱敏工具类。
 * <p>
 * 设计目标：
 * 1. 统一处理密码、Token、手机号等敏感字段；
 * 2. 兼容日志记录、接口返回、导出场景的对象脱敏；
 * 3. 支持 Map、List、数组、Java Bean 的递归脱敏。
 * </p>
 */
public final class SensitiveUtils {

    /**
     * 敏感数据递归遍历最大深度，防止循环引用导致栈溢出。
     * <p>默认 8 为内置兜底；运行时实际值由 {@code sys.sensitive.maxRecursionDepth} 参数控制，
     * 通过 cloudflow-auth 模块的 SensitiveConfigBootstrap 在启动时调 {@link #setMaxRecursionDepth(int)} 注入。
     * 修改后需重启服务才会生效。
     */
    private static volatile int maxRecursionDepth = 8;

    /** 由配置加载器在启动时调用，运行时切换递归深度 */
    public static void setMaxRecursionDepth(int n) {
        if (n > 0) {
            maxRecursionDepth = n;
        }
    }

    private static final String SECRET_MASK = "******";
    private static final String CIRCULAR_REFERENCE_PLACEHOLDER = "[Circular]";

    private static final Set<String> SECRET_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "password", "pwd", "secret", "token", "accessToken", "refreshToken",
        "authorization", "authToken", "clientSecret", "privateKey"
    ));

    private static final Set<String> PHONE_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "phone", "mobile", "telephone", "phonenumber", "cellphone", "tel", "手机号", "手机"
    ));

    private static final Set<String> EMAIL_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "email", "mail", "邮箱"
    ));

    private static final Set<String> ID_CARD_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "idCard", "idcard", "idNumber", "identityCard", "identity", "身份证"
    ));

    private static final Set<String> BANK_CARD_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "bankCard", "bankAccount", "creditCard", "银行卡", "bankNo"
    ));

    private static final Set<String> ADDRESS_FIELD_KEYWORDS = new LinkedHashSet<>(Arrays.asList(
        "address", "detailAddress", "homeAddress", "companyAddress", "地址"
    ));

    private SensitiveUtils() {
    }

    /**
     * 判断字段名是否属于敏感字段。
     */
    public static boolean isSensitiveField(String fieldName) {
        return isSensitiveField(fieldName, Collections.emptySet());
    }

    /**
     * 判断字段名是否属于敏感字段，并支持额外扩展关键字。
     */
    public static boolean isSensitiveField(String fieldName, Collection<String> extraSensitiveFields) {
        if (!hasText(fieldName)) {
            return false;
        }
        return matchesAnyKeyword(fieldName, SECRET_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, PHONE_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, EMAIL_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, ID_CARD_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, BANK_CARD_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, ADDRESS_FIELD_KEYWORDS)
            || matchesAnyKeyword(fieldName, extraSensitiveFields);
    }

    /**
     * 根据字段名自动选择脱敏策略。
     */
    public static String maskByFieldName(String fieldName, String value) {
        return maskByFieldName(fieldName, value, Collections.emptySet());
    }

    /**
     * 根据字段名和扩展关键字自动选择脱敏策略。
     */
    public static String maskByFieldName(String fieldName, String value, Collection<String> extraSensitiveFields) {
        if (!hasText(value)) {
            return value;
        }
        if (!hasText(fieldName)) {
            return maskDefault(value);
        }
        if (matchesAnyKeyword(fieldName, SECRET_FIELD_KEYWORDS) || matchesAnyKeyword(fieldName, extraSensitiveFields)) {
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
     * 手机号脱敏：13812345678 -> 138****5678
     */
    public static String maskPhone(String phone) {
        if (!hasText(phone)) {
            return phone;
        }
        String compact = phone.trim();
        if (compact.length() < 7) {
            return maskDefault(compact);
        }
        return keepHeadTail(compact, 3, 4);
    }

    /**
     * 邮箱脱敏：user@example.com -> u***@example.com
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
     * 身份证脱敏：110101199001011234 -> 110101****1234
     */
    public static String maskIdCard(String idCard) {
        if (!hasText(idCard)) {
            return idCard;
        }
        String compact = idCard.trim();
        if (compact.length() < 8) {
            return maskDefault(compact);
        }
        return keepHeadTail(compact, 6, 4);
    }

    /**
     * 银行卡脱敏：6222021234567890 -> 6222 **** 7890
     */
    public static String maskBankCard(String bankCard) {
        if (!hasText(bankCard)) {
            return bankCard;
        }
        String compact = bankCard.replaceAll("\\s+", "");
        if (compact.length() < 8) {
            return maskDefault(compact);
        }
        return keepHeadTail(compact, 4, 4, " **** ");
    }

    /**
     * 地址脱敏：默认保留前 6 位，其余隐藏。
     */
    public static String maskAddress(String address) {
        if (!hasText(address)) {
            return address;
        }
        if (address.length() <= 6) {
            return maskDefault(address);
        }
        return address.substring(0, 6) + "****";
    }

    /**
     * 密码、Token 等机密字段统一全部隐藏。
     */
    public static String maskSecret(String secret) {
        if (!hasText(secret)) {
            return secret;
        }
        return SECRET_MASK;
    }

    /**
     * 通用脱敏：首尾各保留约 1/4。
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
     * 对请求参数进行脱敏。
     * <p>
     * extraSensitiveFields 用于扩展系统默认敏感字段。
     * </p>
     */
    public static Map<String, String[]> maskRequestParams(Map<String, String[]> paramsMap,
                                                          Collection<String> extraSensitiveFields) {
        if (paramsMap == null || paramsMap.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, String[]> result = new LinkedHashMap<>(paramsMap.size());
        for (Map.Entry<String, String[]> entry : paramsMap.entrySet()) {
            String fieldName = entry.getKey();
            String[] values = entry.getValue();
            if (values == null) {
                result.put(fieldName, null);
                continue;
            }
            if (!isSensitiveField(fieldName, extraSensitiveFields)) {
                result.put(fieldName, Arrays.copyOf(values, values.length));
                continue;
            }
            String[] maskedValues = new String[values.length];
            for (int index = 0; index < values.length; index++) {
                maskedValues[index] = maskByFieldName(fieldName, values[index], extraSensitiveFields);
            }
            result.put(fieldName, maskedValues);
        }
        return result;
    }

    /**
     * 对 Map 对象做递归脱敏。
     */
    public static Map<String, Object> maskMap(Map<String, ?> data) {
        return maskMap(data, Collections.emptySet());
    }

    /**
     * 对 Map 对象做递归脱敏，并支持额外敏感字段关键字。
     */
    public static Map<String, Object> maskMap(Map<String, ?> data, Collection<String> extraSensitiveFields) {
        Object masked = maskObject(data, extraSensitiveFields);
        if (masked instanceof Map<?, ?> maskedMap) {
            Map<String, Object> result = new LinkedHashMap<>();
            maskedMap.forEach((key, value) -> result.put(String.valueOf(key), value));
            return result;
        }
        return Collections.emptyMap();
    }

    /**
     * 对任意对象做递归脱敏，并保持原对象不被修改。
     */
    public static Object maskObject(Object source) {
        return maskObject(source, Collections.emptySet());
    }

    /**
     * 对任意对象做递归脱敏，并支持额外敏感字段关键字。
     */
    public static Object maskObject(Object source, Collection<String> extraSensitiveFields) {
        return maskObjectInternal(source, null, extraSensitiveFields, new IdentityHashMap<>(), 0);
    }

    /**
     * 递归遍历对象结构，遇到敏感字段时统一返回脱敏后的副本。
     */
    private static Object maskObjectInternal(Object source,
                                             String fieldName,
                                             Collection<String> extraSensitiveFields,
                                             IdentityHashMap<Object, Boolean> visited,
                                             int depth) {
        if (source == null) {
            return null;
        }
        if (fieldName != null && isSensitiveField(fieldName, extraSensitiveFields)) {
            return maskByFieldName(fieldName, String.valueOf(source), extraSensitiveFields);
        }
        Class<?> sourceClass = source.getClass();
        if (isSimpleValueType(sourceClass)) {
            return source;
        }
        if (depth >= maxRecursionDepth) {
            return String.valueOf(source);
        }
        if (visited.containsKey(source)) {
            return CIRCULAR_REFERENCE_PLACEHOLDER;
        }

        visited.put(source, Boolean.TRUE);
        try {
            if (source instanceof Map<?, ?> sourceMap) {
                Map<String, Object> result = new LinkedHashMap<>(sourceMap.size());
                for (Map.Entry<?, ?> entry : sourceMap.entrySet()) {
                    String childFieldName = entry.getKey() == null ? null : String.valueOf(entry.getKey());
                    result.put(childFieldName,
                        maskObjectInternal(entry.getValue(), childFieldName, extraSensitiveFields, visited, depth + 1));
                }
                return result;
            }
            if (source instanceof Collection<?> sourceCollection) {
                List<Object> result = new ArrayList<>(sourceCollection.size());
                for (Object item : sourceCollection) {
                    result.add(maskObjectInternal(item, null, extraSensitiveFields, visited, depth + 1));
                }
                return result;
            }
            if (sourceClass.isArray()) {
                int length = Array.getLength(source);
                List<Object> result = new ArrayList<>(length);
                for (int index = 0; index < length; index++) {
                    result.add(maskObjectInternal(Array.get(source, index), null, extraSensitiveFields, visited, depth + 1));
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
                beanMap.put(field.getName(),
                    maskObjectInternal(fieldValue, field.getName(), extraSensitiveFields, visited, depth + 1));
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
        return packageName.startsWith("java.")
            || packageName.startsWith("javax.")
            || packageName.startsWith("jakarta.");
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

    private static String keepHeadTail(String value, int headLength, int tailLength) {
        return keepHeadTail(value, headLength, tailLength, "****");
    }

    private static String keepHeadTail(String value, int headLength, int tailLength, String connector) {
        if (!hasText(value)) {
            return value;
        }
        int safeHeadLength = Math.min(headLength, value.length());
        int safeTailLength = Math.min(tailLength, Math.max(0, value.length() - safeHeadLength));
        if (safeHeadLength + safeTailLength >= value.length()) {
            return maskDefault(value);
        }
        return value.substring(0, safeHeadLength) + connector + value.substring(value.length() - safeTailLength);
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
