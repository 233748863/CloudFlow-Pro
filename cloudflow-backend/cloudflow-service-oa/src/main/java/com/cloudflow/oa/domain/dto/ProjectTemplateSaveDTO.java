package com.cloudflow.oa.domain.dto;

import com.cloudflow.oa.domain.OaProjectTemplate;
import com.cloudflow.oa.domain.OaProjectTemplateTask;
import lombok.Data;
import java.util.List;

@Data
public class ProjectTemplateSaveDTO {
    private OaProjectTemplate template;
    private List<OaProjectTemplateTask> tasks;
}
