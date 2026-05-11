package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.OaScheduleClient;
import com.cloudflow.hr.client.dto.MeetingRoomBookingCreateDTO;
import com.cloudflow.hr.client.vo.MeetingRoomBookingVO;
import org.springframework.stereotype.Component;

/**
 * OA日程服务降级处理
 */
@Component
public class OaScheduleClientFallback implements OaScheduleClient {

    @Override
    public R<MeetingRoomBookingVO> createMeetingRoomBooking(MeetingRoomBookingCreateDTO dto) {
        return R.fail("OA服务暂时不可用，无法预订会议室");
    }
}
