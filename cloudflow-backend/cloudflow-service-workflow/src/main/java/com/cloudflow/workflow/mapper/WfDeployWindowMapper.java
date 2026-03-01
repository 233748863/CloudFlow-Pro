package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfDeployWindow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 流程发布窗口配置Mapper接口
 */
@Mapper
public interface WfDeployWindowMapper extends BaseMapper<WfDeployWindow> {

    /**
     * 检查指定时间是否在发布窗口内
     * @param checkTime 检查时间
     * @return 符合条件的窗口列表
     */
    @Select("SELECT * FROM wf_deploy_window WHERE is_enabled = 1 " +
            "AND (" +
            "  (window_type = 'DAILY' AND TIME(#{checkTime}) BETWEEN start_time AND end_time) " +
            "  OR (window_type = 'WEEKLY' AND FIND_IN_SET(DAYOFWEEK(#{checkTime}), week_days) > 0 " +
            "      AND TIME(#{checkTime}) BETWEEN start_time AND end_time) " +
            "  OR (window_type = 'MONTHLY' AND FIND_IN_SET(DAY(#{checkTime}), month_days) > 0 " +
            "      AND TIME(#{checkTime}) BETWEEN start_time AND end_time)" +
            ")")
    List<WfDeployWindow> checkDeployWindow(@Param("checkTime") LocalDateTime checkTime);

    /**
     * 获取所有启用的发布窗口
     * @return 启用的窗口列表
     */
    @Select("SELECT * FROM wf_deploy_window WHERE is_enabled = 1 ORDER BY create_time DESC")
    List<WfDeployWindow> listEnabledWindows();
}
