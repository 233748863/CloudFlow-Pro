package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.dto.MeetingRoomBookingCreateDTO;
import com.cloudflow.hr.client.fallback.OaScheduleClientFallback;
import com.cloudflow.hr.client.vo.MeetingRoomBookingVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * OA日程服务Feign客户端
 */
@FeignClient(
        name = "cloudflow-service-oa",
        contextId = "hrOaScheduleClient",
        fallback = OaScheduleClientFallback.class
)
public interface OaScheduleClient {

    @PostMapping("/inner/oa/schedule/meeting-room-booking")
    R<MeetingRoomBookingVO> createMeetingRoomBooking(@RequestBody MeetingRoomBookingCreateDTO dto);
}
