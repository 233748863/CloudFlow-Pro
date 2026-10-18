package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 代码生成字段配置。
 */
@Data
@TableName("sys_codegen_column")
public class SysCodegenColumn implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long columnId;

    private Long tableId;
    private String columnName;
    private String columnComment;
    private String columnType;
    private String javaType;
    private String javaField;
    private Integer pkFlag;
    private Integer incrementFlag;
    private Integer requiredFlag;
    private Integer insertFlag;
    private Integer editFlag;
    private Integer listFlag;
    private Integer queryFlag;
    private String queryType;
    private String htmlType;
    private String dictType;
    private Integer auditFieldFlag;
    private Integer sortNo;

    /** Velocity 模板使用的 Java 属性首字母大写形式。 */
    public String getCapJavaField() {
        if (javaField == null || javaField.isEmpty()) {
            return javaField;
        }
        return Character.toUpperCase(javaField.charAt(0)) + javaField.substring(1);
    }

    public boolean isColumnMappingRequired() {
        return columnName != null && javaField != null
                && !columnName.equalsIgnoreCase(com.baomidou.mybatisplus.core.toolkit.StringUtils.camelToUnderline(javaField));
    }

    public String getEscapedColumnComment() {
        return columnComment == null ? "" : columnComment.replace("'", "''");
    }

    /** Velocity 模板使用的安全 JavaDoc 文本。 */
    public String getJavaDocColumnComment() {
        if (columnComment == null) {
            return "";
        }
        return columnComment.replace("*/", "* /")
                .replace('\r', ' ')
                .replace('\n', ' ');
    }

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
