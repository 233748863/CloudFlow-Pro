package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.dto.ChannelTestDTO;
import com.cloudflow.auth.domain.dto.MessageChannelDTO;
import com.cloudflow.auth.domain.vo.ChannelTestResultVO;
import com.cloudflow.auth.domain.vo.SysMessageChannelVO;
import com.cloudflow.common.core.domain.PageResult;

import java.util.List;

public interface MessageChannelService {
    PageResult<SysMessageChannelVO> list(String channelType, String status, int pageNum, int pageSize);
    SysMessageChannelVO get(Long channelId);
    void add(MessageChannelDTO dto);
    void edit(MessageChannelDTO dto);
    ChannelTestResultVO test(Long channelId, ChannelTestDTO dto);
    void remove(List<Long> ids);
    SysMessageChannel findEnabled(String channelType);
}
