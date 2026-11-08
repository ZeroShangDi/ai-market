package cn.iocoder.yudao.framework.websocket.core.security;

import org.springframework.web.socket.WebSocketSession;

/** 可选会话校验扩展。业务授权由装配层提供，通信框架不依赖具体业务模块。 */
public interface WebSocketSessionGuard {
    boolean isAllowed(WebSocketSession session);
}
