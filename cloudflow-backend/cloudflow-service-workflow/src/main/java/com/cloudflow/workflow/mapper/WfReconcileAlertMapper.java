package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.workflow.domain.WfReconcileAlert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

@Mapper
public interface WfReconcileAlertMapper extends BaseMapper<WfReconcileAlert> {

    /**
     * 查询"流程已完成但业务表状态仍为审批中"的不一致记录。
     *
     * @param windowMinutes 时间窗（分钟），只检查最近 N 分钟内 end_time 的流程
     * @param businessTypes 注册表中收集到的业务类型定义集合，决定 UNION ALL 的子查询数量与目标表
     */
    List<WfReconcileAlert> selectInconsistentRecords(
            @Param("windowMinutes") int windowMinutes,
            @Param("businessTypes") Collection<BusinessTypeDef> businessTypes);
}
