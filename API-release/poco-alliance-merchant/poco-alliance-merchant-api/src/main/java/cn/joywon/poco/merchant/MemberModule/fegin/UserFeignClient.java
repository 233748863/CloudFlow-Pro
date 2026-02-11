package cn.joywon.poco.merchant.MemberModule.fegin;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.merchant.MemberModule.dto.UserSyncDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(contextId = "userFeignClient", value = ServiceNameConstants.MERCHANT_SERVICE)
public interface UserFeignClient {


    /**
     * 同步添加用户
     *
     * @param dto 用户同步参数
     * @return 响应结果
     */
    @Inner(value = false)
    @PostMapping("/user/sync/add")
    R<?> addUser(@RequestBody UserSyncDTO dto);


    /**
     * 同步更新用户
     *
     * @param dto 用户同步参数
     * @return 响应结果
     */
    @PostMapping("/user/sync/update")
    R<?> updateUser(@RequestBody UserSyncDTO dto);

    @DeleteMapping("/user/sync/delete")
    R<?> deleteUser(@RequestBody Long[] ids);

}