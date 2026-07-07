package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 并行网关汇聚到达记录
 *
 * 每个并行分支到达汇聚点时插入一行（与审批/流转同事务，事务回滚记录自动撤销），
 * 到达行数等于分支总数时汇聚放行并清理记录。
 * 替代原 Redis increment 计数（Redis 计数不随事务回滚且有过期错位问题）。
 *
 * 唯一键 (instance_id, gateway_id, branch_key) 防止同一分支重复计数。
 *
 * @author CloudFlow
 */
@TableName("wf_parallel_join")
public class WfParallelJoin implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 主键 */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 流程实例ID */
    private String instanceId;

    /** 并行网关节点ID */
    private String gatewayId;

    /** 到达汇聚点的分支标识（汇聚点直接前驱节点ID） */
    private String branchKey;

    /** 到达时间 */
    private LocalDateTime createTime;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }

    public String getInstanceId() {
        return instanceId;
    }

    public void setInstanceId(String instanceId) {
        this.instanceId = instanceId;
    }

    public String getGatewayId() {
        return gatewayId;
    }

    public void setGatewayId(String gatewayId) {
        this.gatewayId = gatewayId;
    }

    public String getBranchKey() {
        return branchKey;
    }

    public void setBranchKey(String branchKey) {
        this.branchKey = branchKey;
    }

    public LocalDateTime getCreateTime() {
        return createTime;
    }

    public void setCreateTime(LocalDateTime createTime) {
        this.createTime = createTime;
    }
}
