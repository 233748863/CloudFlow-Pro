package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.io.Serializable;
import java.util.Date;

/**
 * 表单定义实体类
 */
@TableName("wf_form_definition")
public class WfFormDefinition implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 表单ID */
    @TableId
    private String formId;

    /** 表单名称 */
    private String formName;

    /** 表单字段JSON */
    private String fieldsJson;

    /** 版本 */
    private Integer version;

    /** 创建时间 */
    private Date createTime;

    public String getFormId() {
        return formId;
    }

    public void setFormId(String formId) {
        this.formId = formId;
    }

    public String getFormName() {
        return formName;
    }

    public void setFormName(String formName) {
        this.formName = formName;
    }

    public String getFieldsJson() {
        return fieldsJson;
    }

    public void setFieldsJson(String fieldsJson) {
        this.fieldsJson = fieldsJson;
    }

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

    public Date getCreateTime() {
        return createTime;
    }

    public void setCreateTime(Date createTime) {
        this.createTime = createTime;
    }
}
