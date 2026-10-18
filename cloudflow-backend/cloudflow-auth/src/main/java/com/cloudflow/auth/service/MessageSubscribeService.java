package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.dto.SubscribeDTO;
import com.cloudflow.auth.domain.vo.SubscribeVO;

import java.util.List;

public interface MessageSubscribeService {
    List<SubscribeVO> mine();
    void saveMine(List<SubscribeDTO> settings);
}
