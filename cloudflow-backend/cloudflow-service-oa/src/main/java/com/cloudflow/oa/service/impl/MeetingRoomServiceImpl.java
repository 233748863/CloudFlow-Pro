package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.mapper.MeetingRoomMapper;
import com.cloudflow.oa.service.IMeetingRoomService;
import com.cloudflow.common.audit.annotation.Audit;
import org.springframework.stereotype.Service;

@Service
public class MeetingRoomServiceImpl extends ServiceImpl<MeetingRoomMapper, MeetingRoom> implements IMeetingRoomService {
}
