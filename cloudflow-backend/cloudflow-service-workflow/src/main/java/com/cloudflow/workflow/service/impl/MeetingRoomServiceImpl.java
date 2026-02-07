package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.workflow.domain.MeetingRoom;
import com.cloudflow.workflow.mapper.MeetingRoomMapper;
import com.cloudflow.workflow.service.IMeetingRoomService;
import org.springframework.stereotype.Service;

@Service
public class MeetingRoomServiceImpl extends ServiceImpl<MeetingRoomMapper, MeetingRoom> implements IMeetingRoomService {
}
