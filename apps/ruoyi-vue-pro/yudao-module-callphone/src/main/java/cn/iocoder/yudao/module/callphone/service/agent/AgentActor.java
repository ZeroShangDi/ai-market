package cn.iocoder.yudao.module.callphone.service.agent;

/** Identity obtained only from the authenticated mobile session. */
public record AgentActor(Long tenantId, Long userId, String deviceId) {}
