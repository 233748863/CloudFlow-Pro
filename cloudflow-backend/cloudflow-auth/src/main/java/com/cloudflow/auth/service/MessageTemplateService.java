package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysMessageTemplate;
import com.cloudflow.auth.domain.dto.MessageTemplateDTO;
import com.cloudflow.auth.domain.dto.MessageTemplatePreviewDTO;
import com.cloudflow.common.core.domain.PageResult;

import java.util.Map;

public interface MessageTemplateService {
    PageResult<SysMessageTemplate> list(String templateCode, String channelType, String status,
                                        int pageNum, int pageSize);
    SysMessageTemplate get(Long id);
    void add(MessageTemplateDTO dto);
    void edit(MessageTemplateDTO dto);
    void remove(java.util.List<Long> ids);
    Map<String, String> preview(MessageTemplatePreviewDTO dto);
    SysMessageTemplate findEnabled(String code, String channelType);
}
