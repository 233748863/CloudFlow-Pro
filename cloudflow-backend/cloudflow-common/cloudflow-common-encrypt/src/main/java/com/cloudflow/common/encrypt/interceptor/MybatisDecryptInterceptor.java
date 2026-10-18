package com.cloudflow.common.encrypt.interceptor;

import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.cloudflow.common.encrypt.core.EncryptUtils;
import com.cloudflow.common.encrypt.core.EncryptUtils.EncryptException;
import com.cloudflow.common.encrypt.enums.AlgorithmType;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.executor.resultset.ResultSetHandler;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Field;
import java.sql.Statement;
import java.util.Base64;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.Set;

/**
 * MyBatis 解密拦截器
 * <p>
 * 拦截 ResultSetHandler.handleResultSets，在查询结果返回前
 * 对标注了 @EncryptField 的字段进行自动解密。
 *
 * @author CloudFlow
 */
@Intercepts({
    @Signature(type = ResultSetHandler.class, method = "handleResultSets", args = {Statement.class})
})
public class MybatisDecryptInterceptor implements Interceptor {

    private static final Logger log = LoggerFactory.getLogger(MybatisDecryptInterceptor.class);
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final String DECRYPT_FAILURE_PLACEHOLDER = "***";

    private final EncryptorProperties properties;

    public MybatisDecryptInterceptor(EncryptorProperties properties) {
        this.properties = properties;
    }

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        Object result = invocation.proceed();

        if (!properties.isEnabled() || result == null) {
            return result;
        }

        decryptResults(result, Collections.newSetFromMap(new IdentityHashMap<>()));
        return result;
    }

    private void decryptResults(Object result, Set<Object> visited) {
        if (result == null || !visited.add(result)) {
            return;
        }
        if (result instanceof Map<?, ?> values) {
            for (Object value : values.values()) {
                decryptResults(value, visited);
            }
        } else if (result instanceof Iterable<?> values) {
            for (Object value : values) {
                decryptResults(value, visited);
            }
        } else if (result instanceof Object[] values) {
            for (Object value : values) {
                decryptResults(value, visited);
            }
        } else {
            decryptFields(result);
        }
    }

    /**
     * 对对象中标注了 @EncryptField 的字段进行解密
     */
    private void decryptFields(Object obj) {
        for (EncryptedFieldMetadata.EncryptedField encryptedField : EncryptedFieldMetadata.fields(obj.getClass())) {
            Field field = encryptedField.field();
            EncryptField annotation = encryptedField.annotation();
            try {
                field.setAccessible(true);
                String value = (String) field.get(obj);
                if (value != null && (!value.isEmpty() || annotation.jsonStorage())) {
                    AlgorithmType algorithm = annotation.algorithm();
                    String key = getKey(algorithm);
                    String cipherText = annotation.jsonStorage() ? unwrapJson(value) : value;
                    String decrypted = EncryptUtils.decrypt(cipherText, algorithm, key);
                    if (annotation.jsonStorage()) {
                        JsonNode plain = JSON.readTree(decrypted);
                        if (plain == null || plain.isMissingNode()) {
                            throw new IllegalArgumentException("JSON字段解密结果为空");
                        }
                    }
                    field.set(obj, decrypted);
                }
            } catch (Exception failure) {
                log.warn("[Encrypt] 字段解密失败, field={}, cause={}",
                        field.getName(), failure.getClass().getSimpleName());
                try {
                    field.setAccessible(true);
                    field.set(obj, DECRYPT_FAILURE_PLACEHOLDER);
                } catch (Exception maskingFailure) {
                    throw new EncryptException("字段解密失败，无法安全返回结果", maskingFailure);
                }
            }
        }
    }

    private String unwrapJson(String value) throws Exception {
        JsonNode stored = JSON.readTree(value);
        if (stored == null || !stored.isTextual() || stored.textValue().isBlank()) {
            throw new IllegalArgumentException("JSON密文必须为非空字符串");
        }
        String cipherText = stored.textValue();
        byte[] decoded = Base64.getDecoder().decode(cipherText);
        if (!Base64.getEncoder().encodeToString(decoded).equals(cipherText)) {
            throw new IllegalArgumentException("JSON密文编码无效");
        }
        return cipherText;
    }

    private String getKey(AlgorithmType algorithm) {
        return switch (algorithm) {
            case AES -> properties.getAesKey();
            case SM4 -> properties.getSm4Key();
            case BASE64 -> "";
        };
    }
}
