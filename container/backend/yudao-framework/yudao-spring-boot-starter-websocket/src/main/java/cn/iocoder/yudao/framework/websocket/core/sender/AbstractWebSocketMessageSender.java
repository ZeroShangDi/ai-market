package cn.iocoder.yudao.framework.websocket.core.sender;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.iocoder.yudao.framework.common.util.json.JsonUtils;
import cn.iocoder.yudao.framework.websocket.core.message.JsonWebSocketMessage;
import cn.iocoder.yudao.framework.websocket.core.session.WebSocketSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

/**
 * WebSocketMessageSender 实现类
 *
 * @author 芋道源码
 */
@Slf4j
@RequiredArgsConstructor
public abstract class AbstractWebSocketMessageSender implements WebSocketMessageSender {

    private final WebSocketSessionManager sessionManager;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private List<cn.iocoder.yudao.framework.websocket.core.security.WebSocketSessionGuard> guards = List.of();

    @Override
    public void send(Integer userType, Long userId, String messageType, String messageContent) {
        send(null, userType, userId, messageType, messageContent);
    }

    @Override
    public void send(Integer userType, String messageType, String messageContent) {
        send(null, userType, null, messageType, messageContent);
    }

    @Override
    public void send(String sessionId, String messageType, String messageContent) {
        send(sessionId, null, null, messageType, messageContent);
    }

    /**
     * 发送消息
     *
     * @param sessionId Session 编号
     * @param userType 用户类型
     * @param userId 用户编号
     * @param messageType 消息类型
     * @param messageContent 消息内容
     */
    public void send(String sessionId, Integer userType, Long userId, String messageType, String messageContent) {
        // 1. 获得 Session 列表
        List<WebSocketSession> sessions = Collections.emptyList();
        if (StrUtil.isNotEmpty(sessionId)) {
            WebSocketSession session = sessionManager.getSession(sessionId);
            if (session != null) {
                sessions = Collections.singletonList(session);
            }
        } else if (userType != null && userId != null) {
            sessions = (List<WebSocketSession>) sessionManager.getSessionList(userType, userId);
        } else if (userType != null) {
            sessions = (List<WebSocketSession>) sessionManager.getSessionList(userType);
        }
        if (CollUtil.isEmpty(sessions)) {
            if (log.isDebugEnabled()) {
                log.debug("[send][sessionId({}) userType({}) userId({}) messageType({}) length({}) 未匹配到会话]",
                        sessionId, userType, userId, messageType, messageContent == null ? 0 : messageContent.length());
            }
        }
        // 2. 执行发送
        doSend(sessions, messageType, messageContent);
    }

    /**
     * 发送消息的具体实现
     *
     * @param sessions Session 列表
     * @param messageType 消息类型
     * @param messageContent 消息内容
     */
    public void doSend(Collection<WebSocketSession> sessions, String messageType, String messageContent) {
        JsonWebSocketMessage message = new JsonWebSocketMessage().setType(messageType).setContent(messageContent);
        String payload = JsonUtils.toJsonString(message); // 关键，使用 JSON 序列化
        sessions.forEach(session -> {
            if (session == null || !session.isOpen() || guards.stream().anyMatch(guard -> !guard.isAllowed(session))) return;
            // 1. 各种校验，保证 Session 可以被发送
            if (session == null) {
                log.warn("[doSend][session_missing]");
                return;
            }
            if (!session.isOpen()) {
                log.debug("[doSend][session({}) closed]", session.getId());
                return;
            }
            // 2. 执行发送
            try {
                session.sendMessage(new TextMessage(payload));
                log.debug("[doSend][session({}) sent]", session.getId());
            } catch (IOException ex) {
                log.warn("[doSend][session({}) send_failed({})]", session.getId(), ex.getClass().getSimpleName());
            }
        });
    }

}
