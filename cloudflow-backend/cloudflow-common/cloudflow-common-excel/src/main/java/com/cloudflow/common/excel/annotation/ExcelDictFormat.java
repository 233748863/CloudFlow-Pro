package com.cloudflow.common.excel.annotation;

import java.lang.annotation.*;

/**
 * Excel 字典格式化注解
 * 用于标注 Excel 导入导出时需要进行字典值转换的字段
 * 例如：性别字段 0=男,1=女,2=未知
 *
 * @author CloudFlow
 */
@Target({ElementType.FIELD})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
public @interface ExcelDictFormat {

    /**
     * 字典类型（如果使用字典管理，填写字典类型编码）
     * 例如：sys_user_sex
     */
    String dictType() default "";

    /**
     * 读取内容转表达式（如: 0=男,1=女,2=未知）
     * 当 dictType 为空时使用此表达式进行转换
     */
    String readConverterExp() default "";

    /**
     * 分隔符，用于多值场景，默认逗号
     */
    String separator() default ",";
}
