package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("wf_form_draft")
public class WfFormDraft implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId
    private String draftId;
    private Long tenantId;
    private String definitionId;
    private String definitionName;
    private String formId;
    private Long userId;
    private String title;
    private String formData;
    private String nodeAssignees;
    private String attachmentUrl;
    private String definitionSnapshotHash;
    private Integer lockVersion;
    private LocalDateTime lastSaveTime;
    private LocalDateTime expireTime;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
