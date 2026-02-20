package com.cloudflow.common.encrypt.annotation;

import com.cloudflow.common.encrypt.enums.AlgorithmType;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 字段加密注解
 * <p>
 * 标注在实体类的 String 字段上，MyBatis 拦截器会在写入数据库时自动加密，
 * 读取时自动解密，对业务代码完全透明。
 * <pre>
 * // 示例：手机号加密存储
 * public class Employee {
 *     private Long id;
 *
 *     @EncryptField(algorithm = AlgorithmType.AES)
 *     private String phone;       // 数据库中存储密文
 *
 *     @EncryptField(algorithm = AlgorithmType.AES)
 *     private String idCard;      // 身份证号加密
 *
 *     private String name;        // 不加密
 * }
 * </pre>
 *
 * @author CloudFlow
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface EncryptField {

    /**
     * 加密算法，默认 AES
     */
    AlgorithmType algorithm() default AlgorithmType.AES;
}
