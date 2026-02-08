package com.cloudflow.workflow.service;

/**
 * 防重放攻击服务接口
 * 使用 Token + Redis 实现幂等性
 */
public interface IReplayAttackPreventionService {

    /** 检查并注册 nonce，防止重放攻击 */
    boolean checkAndRegisterNonce(String nonce);

    /** 生成唯一的 nonce */
    String generateNonce();
}
