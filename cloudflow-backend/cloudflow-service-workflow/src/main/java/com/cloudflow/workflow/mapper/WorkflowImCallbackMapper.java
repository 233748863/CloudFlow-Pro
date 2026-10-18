package com.cloudflow.workflow.mapper;

import com.cloudflow.common.security.im.ImTaskCallbacks;
import java.util.List;
import java.util.Set;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface WorkflowImCallbackMapper {
    Long lockTenant(ImTaskCallbacks.Actor actor);
    Long lockConfig(ImTaskCallbacks.Actor actor);
    Long lockBinding(ImTaskCallbacks.Actor actor);
    Long lockUser(ImTaskCallbacks.Actor actor);
    Long lockEvent(ImTaskCallbacks.Actor actor);
    Long lockTodo(ImTaskCallbacks.Actor actor);
    List<Long> lockRoles(ImTaskCallbacks.Actor actor);
    List<Long> lockBlacklist(ImTaskCallbacks.Actor actor);
    List<Long> lockMenus(@Param("menuIds") Set<Long> menuIds);
    String history(ImTaskCallbacks.Request request);
}
