package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.dto.HotUpdateRequest;
import com.cloudflow.workflow.domain.dto.HotUpdateResult;
import com.cloudflow.workflow.domain.entity.WfHotUpdateRecord;

import java.util.List;

public interface IHotUpdateService {

    HotUpdateResult analyzeOrExecute(HotUpdateRequest request);

    HotUpdateResult prepareExecute(HotUpdateRequest request);

    List<WfHotUpdateRecord> getHistory(String processKey);
}
