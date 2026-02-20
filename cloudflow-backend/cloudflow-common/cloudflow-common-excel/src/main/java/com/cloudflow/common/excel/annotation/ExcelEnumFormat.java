package com.cloudflow.common.excel.annotation;

import java.lang.annotation.*;

/**
 * Excel 枚举格式化注解
 * 用于标注 Excel 导入导出时需要进行枚举值转换的字段
 *
 * @author CloudFlow
 */
@Target({ElementType.FIELD})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
public @interface ExcelEnumFormat {

    /**
     * 枚举类的 Class 对象
     */
    Class<? extends Enum<?>> enumClass();

    /**
     * 枚举中代表实际值的字段名（如 code、value）
     */
    String codeField() default "code";

    /**
     * 枚举中代表显示文本的字段名（如 desc、label）
     */
    String textField() default "desc";
}
