package com.cloudflow.common.encrypt.interceptor;

import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.cloudflow.common.encrypt.core.EncryptUtils;
import com.cloudflow.common.encrypt.core.EncryptUtils.EncryptException;
import com.cloudflow.common.encrypt.enums.AlgorithmType;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * MyBatis 加密拦截器
 * <p>
 * 拦截 INSERT / UPDATE 操作，在写入数据库前对标注了 @EncryptField 的字段进行加密。
 *
 * @author CloudFlow
 */
@Intercepts({
    @Signature(type = Executor.class, method = "update", args = {MappedStatement.class, Object.class})
})
public class MybatisEncryptInterceptor implements Interceptor {

    private static final Logger log = LoggerFactory.getLogger(MybatisEncryptInterceptor.class);
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private final EncryptorProperties properties;

    public MybatisEncryptInterceptor(EncryptorProperties properties) {
        this.properties = properties;
    }

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        if (!properties.isEnabled()) {
            return invocation.proceed();
        }

        Object parameter = invocation.getArgs()[1];
        if (parameter == null) {
            return invocation.proceed();
        }

        List<OriginalFieldValue> originals = new ArrayList<>();
        Set<Object> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        Throwable invocationFailure = null;
        try {
            encryptParameters(parameter, visited, originals);
            return invocation.proceed();
        } catch (Throwable failure) {
            invocationFailure = failure;
            throw failure;
        } finally {
            try {
                restoreFields(originals);
            } catch (EncryptException restorationFailure) {
                if (invocationFailure == null) {
                    throw restorationFailure;
                }
                invocationFailure.addSuppressed(restorationFailure);
            }
        }
    }

    private void encryptParameters(Object parameter, Set<Object> visited, List<OriginalFieldValue> originals) {
        if (parameter == null || !visited.add(parameter)) {
            return;
        }
        if (parameter instanceof Map<?, ?> values) {
            for (Object value : values.values()) {
                encryptParameters(value, visited, originals);
            }
        } else if (parameter instanceof Iterable<?> values) {
            for (Object value : values) {
                encryptParameters(value, visited, originals);
            }
        } else if (parameter instanceof Object[] values) {
            for (Object value : values) {
                encryptParameters(value, visited, originals);
            }
        } else {
            encryptFields(parameter, originals);
        }
    }

    /**
     * 对对象中标注了 @EncryptField 的字段进行加密
     */
    private void encryptFields(Object obj, List<OriginalFieldValue> originals) {
        if (obj == null) {
            return;
        }
        for (EncryptedFieldMetadata.EncryptedField encryptedField : EncryptedFieldMetadata.fields(obj.getClass())) {
            Field field = encryptedField.field();
            EncryptField annotation = encryptedField.annotation();
            try {
                field.setAccessible(true);
                String value = (String) field.get(obj);
                if (value != null && (!value.isEmpty() || annotation.jsonStorage())) {
                    if ("***".equals(value)) {
                        throw new IllegalArgumentException("解密失败占位值不得写入");
                    }
                    if (annotation.jsonStorage() && JSON.readTree(value) == null) {
                        throw new IllegalArgumentException("JSON字段内容为空");
                    }
                    AlgorithmType algorithm = annotation.algorithm();
                    String key = getKey(algorithm);
                    String encrypted = EncryptUtils.encrypt(value, algorithm, key);
                    if (encrypted == null || encrypted.equals(value)) {
                        throw new IllegalArgumentException("字段未生成有效密文");
                    }
                    String stored = annotation.jsonStorage() ? JSON.writeValueAsString(encrypted) : encrypted;
                    originals.add(new OriginalFieldValue(obj, field, value));
                    field.set(obj, stored);
                }
            } catch (Exception failure) {
                log.error("[Encrypt] 字段加密失败, field={}, cause={}",
                        field.getName(), failure.getClass().getSimpleName());
                throw new EncryptException("字段加密失败，写入已拒绝: " + field.getName(),
                        new IllegalStateException(failure.getClass().getSimpleName()));
            }
        }
    }

    private void restoreFields(List<OriginalFieldValue> originals) {
        EncryptException restorationFailure = null;
        for (int index = originals.size() - 1; index >= 0; index--) {
            OriginalFieldValue original = originals.get(index);
            try {
                original.field().set(original.target(), original.value());
            } catch (Exception failure) {
                if (restorationFailure == null) {
                    restorationFailure = new EncryptException("无法恢复加密字段原值", failure);
                } else {
                    restorationFailure.addSuppressed(failure);
                }
            }
        }
        if (restorationFailure != null) {
            throw restorationFailure;
        }
    }

    private record OriginalFieldValue(Object target, Field field, String value) {
    }

    /**
     * 根据算法类型获取对应密钥
     */
    private String getKey(AlgorithmType algorithm) {
        return switch (algorithm) {
            case AES -> properties.getAesKey();
            case SM4 -> properties.getSm4Key();
            case BASE64 -> "";
        };
    }
}
