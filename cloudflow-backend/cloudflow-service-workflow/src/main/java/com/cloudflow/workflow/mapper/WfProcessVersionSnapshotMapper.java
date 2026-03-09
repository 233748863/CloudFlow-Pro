package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfProcessVersionSnapshot;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 流程版本快照Mapper接口
 */
@Mapper
public interface WfProcessVersionSnapshotMapper extends BaseMapper<WfProcessVersionSnapshot> {

    @Select("SELECT * FROM wf_process_version_snapshot WHERE process_def_id = #{processDefId} ORDER BY version DESC")
    List<WfProcessVersionSnapshot> listByProcessDefId(@Param("processDefId") String processDefId);

    @Select("SELECT * FROM wf_process_version_snapshot WHERE process_key = #{processKey} ORDER BY version DESC, id DESC")
    List<WfProcessVersionSnapshot> listByProcessKey(@Param("processKey") String processKey);

    @Select("SELECT * FROM wf_process_version_snapshot WHERE process_def_id = #{processDefId} AND version = #{version}")
    WfProcessVersionSnapshot selectByProcessDefIdAndVersion(@Param("processDefId") String processDefId, @Param("version") Integer version);

    @Select("SELECT * FROM wf_process_version_snapshot WHERE process_key = #{processKey} AND version = #{version} ORDER BY id DESC LIMIT 1")
    WfProcessVersionSnapshot selectByProcessKeyAndVersion(@Param("processKey") String processKey, @Param("version") Integer version);

    @Select("""
            SELECT s.*
            FROM wf_process_version_snapshot s
            INNER JOIN wf_deploy_record d
                ON d.process_def_id = s.process_def_id
               AND d.version = s.version
            WHERE d.id = #{deployId}
            ORDER BY s.id DESC
            LIMIT 1
            """)
    WfProcessVersionSnapshot selectByDeployId(@Param("deployId") Long deployId);

    @Select("SELECT * FROM wf_process_version_snapshot WHERE process_def_id = #{processDefId} ORDER BY version DESC LIMIT 1")
    WfProcessVersionSnapshot selectLatestByProcessDefId(@Param("processDefId") String processDefId);
}
