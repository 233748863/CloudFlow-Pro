package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.util.Date;

/**
 * 5.I: 会签投票记录
 * 记录每个参与者的投票结果
 */
@Data
@TableName("wf_countersign_vote")
public class WfCountersignVote {
    
    @TableId
    private String voteId;
    
    /** 会签任务ID */
    private String countersignId;
    
    /** 关联的任务ID */
    private String taskId;
    
    /** 投票人ID */
    private Long voterId;
    
    /** 投票人名称 */
    private String voterName;
    
    /** 投票结果: APPROVE(同意), REJECT(拒绝) */
    private String voteResult;
    
    /** 投票意见 */
    private String comment;
    
    /** 投票时间 */
    private Date voteTime;
}
