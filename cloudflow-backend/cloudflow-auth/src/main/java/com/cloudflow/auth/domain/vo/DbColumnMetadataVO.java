package com.cloudflow.auth.domain.vo;

import lombok.Data;

/**
 * 数据库字段元数据，仅用于代码生成器同步表结构。
 */
@Data
public class DbColumnMetadataVO {
    private String tableName;
    private String columnName;
    private Integer ordinalPosition;
    private String columnDefault;
    private String isNullable;
    private String dataType;
    private String columnType;
    private String columnKey;
    private String extra;
    private String columnComment;
}
