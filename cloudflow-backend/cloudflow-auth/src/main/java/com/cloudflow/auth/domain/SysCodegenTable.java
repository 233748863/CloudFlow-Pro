package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 代码生成业务表配置。
 */
@Data
@TableName("sys_codegen_table")
public class SysCodegenTable implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long tableId;

    private Long tenantId;
    private String tableName;
    private String tableComment;
    private String moduleName;
    private String businessName;
    private String className;
    private String functionName;
    private String packageName;
    private String author;
    private String tplCategory;
    private Long parentMenuId;
    private String subTableName;
    private String subTableFk;
    private String treeParentCode;
    private String treeNameCode;
    private Integer tenantFieldFlag;
    private Integer logicDeleteFlag;
    private Integer versionFieldFlag;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

    @Version
    private Integer version;

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

    public String getEscapedFunctionName() {
        return functionName == null ? "" : functionName.replace("'", "''").replace("\n", " ").replace("\r", " ");
    }

    /** Velocity 模板使用的安全 Java 字符串文本。 */
    public String getJavaStringFunctionName() {
        return escapeJavaString(functionName);
    }

    /** Velocity 模板使用的安全 JavaDoc 文本。 */
    public String getJavaDocFunctionName() {
        return escapeJavaDoc(functionName);
    }

    /** Velocity 模板使用的安全 JavaDoc 作者文本。 */
    public String getJavaDocAuthor() {
        return escapeJavaDoc(author);
    }

    private String escapeJavaString(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace('\r', ' ')
                .replace('\n', ' ');
    }

    private String escapeJavaDoc(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("*/", "* /")
                .replace('\r', ' ')
                .replace('\n', ' ');
    }
}
