package com.cloudflow.common.excel.annotation;

import java.lang.annotation.*;

/**
 * Excel 单元格合并注解
 * 标注在实体类字段上，导出时相邻行相同值的单元格会自动合并
 *
 * @author CloudFlow
 */
@Target({ElementType.FIELD})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
public @interface CellMerge {

    /**
     * 合并列的索引，默认 -1 表示使用当前字段所在列
     */
    int index() default -1;
}
