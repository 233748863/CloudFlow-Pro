package com.cloudflow.common.encrypt.interceptor;

import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.cloudflow.common.encrypt.core.EncryptUtils;
import com.cloudflow.common.encrypt.enums.AlgorithmType;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Field;
import java.util.Map;

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

        // 处理参数对象（可能是实体对象或 Map 参数）
        if (parameter instanceof Map) {
            // MyBatis-Plus 的参数通常是 Map，遍历 value 处理实体
            @SuppressWarnings("unchecked")
            Map<String, Object> paramMap = (Map<String, Object>) parameter;
            for (Object value : paramMap.values()) {
                if (value != null && !(value instanceof String) && !(value instanceof Number)) {
                    encryptFields(value);
                }
            }
        } else {
            encryptFields(parameter);
        }

        return invocation.proceed();
    }

    /**
     * 对对象中标注了 @EncryptField 的字段进行加密
     */
    private void encryptFields(Object obj) {
        if (obj == null) {
            return;
        }
        Class<?> clazz = obj.getClass();
        // 遍历当前类及父类的所有字段
        while (clazz != null && clazz != Object.class) {
            for (Field field : clazz.getDeclaredFields()) {
                EncryptField annotation = field.getAnnotation(EncryptField.class);
                if (annotation != null && field.getType() == String.class) {
                    try {
                        field.setAccessible(true);
                        String value = (String) field.get(obj);
                        if (value != null && !value.isEmpty()) {
                            AlgorithmType algorithm = annotation.algorithm();
                            String key = getKey(algorithm);
                            String encrypted = EncryptUtils.encrypt(value, algorithm, key);
                            field.set(obj, encrypted);
                        }
                    } catch (Exception e) {
                        log.error("[Encrypt] 字段加密失败, field={}: {}", field.getName(), e.getMessage());
                    }
                }
            }
            clazz = clazz.getSuperclass();
        }
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
