package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 表单定义实体类
 */
@Data
@TableName("wf_form_definition")
public class WfFormDefinition implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 表单ID */
    @TableId
    private String formId;

    /** 租户ID */
    private Long tenantId;

    /** 表单Key */
    private String formKey;

    /** 表单名称 */
    private String formName;

    /** 表单字段JSON */
    private String fieldsJson;

    /** 表单Schema JSON */
    private String formSchema;

    /** 版本 */
    private Integer version;

    /** 乐观锁版本号 */
    @TableField("lock_version")
    @Version
    private Integer versionLock;

    /** 是否最新版本 (1=是, 0=否) */
    private Integer isLatest;

    /** 状态 (DRAFT, PUBLISHED, ARCHIVED) */
    private String status;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime createTime;
}
