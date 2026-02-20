package com.cloudflow.common.encrypt.interceptor;

import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.cloudflow.common.encrypt.core.EncryptUtils;
import com.cloudflow.common.encrypt.enums.AlgorithmType;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import org.apache.ibatis.executor.resultset.ResultSetHandler;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Field;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

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

    private final EncryptorProperties properties;

    public MybatisDecryptInterceptor(EncryptorProperties properties) {
        this.properties = properties;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Object intercept(Invocation invocation) throws Throwable {
        Object result = invocation.proceed();

        if (!properties.isEnabled() || result == null) {
            return result;
        }

        // 查询结果通常是 List
        if (result instanceof List<?> list) {
            for (Object obj : list) {
                if (obj != null) {
                    decryptFields(obj);
                }
            }
        }

        return result;
    }

    /**
     * 对对象中标注了 @EncryptField 的字段进行解密
     */
    private void decryptFields(Object obj) {
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
                            String decrypted = EncryptUtils.decrypt(value, algorithm, key);
                            field.set(obj, decrypted);
                        }
                    } catch (Exception e) {
                        log.error("[Encrypt] 字段解密失败, field={}: {}", field.getName(), e.getMessage());
                    }
                }
            }
            clazz = clazz.getSuperclass();
        }
    }

    private String getKey(AlgorithmType algorithm) {
        return switch (algorithm) {
            case AES -> properties.getAesKey();
            case SM4 -> properties.getSm4Key();
            case BASE64 -> "";
        };
    }
}
