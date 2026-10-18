package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.MeetingRoom;

public interface IMeetingRoomService extends IService<MeetingRoom> {
    boolean createRoom(MeetingRoom input);
    boolean updateRoom(MeetingRoom input);
    boolean removeRoom(Long id, Integer version);
}
