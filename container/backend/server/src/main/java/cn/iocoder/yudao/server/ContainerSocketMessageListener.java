package cn.iocoder.yudao.server;

import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.websocket.core.listener.WebSocketMessageListener;
import cn.iocoder.yudao.framework.websocket.core.sender.WebSocketMessageSender;
import cn.iocoder.yudao.framework.websocket.core.session.WebSocketSessionManager;
import cn.iocoder.yudao.framework.websocket.core.util.WebSocketFrameworkUtils;
import cn.iocoder.yudao.module.infra.websocket.message.DemoSendMessage;
import cn.iocoder.yudao.module.infra.websocket.message.DemoReceiveMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;
import java.util.Objects;

/** 原管理通信页面协议；只向同租户、仍获授权的管理会话发送，不注册业务消息处理器。 */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "yudao.websocket.enable", havingValue = "true")
public class ContainerSocketMessageListener implements WebSocketMessageListener<DemoSendMessage> {
    private final WebSocketSessionManager sessions;
    private final WebSocketMessageSender sender;
    private final ContainerWebSocketAccess access;
    @Override
    public void onMessage(WebSocketSession session, DemoSendMessage message) {
        if (message == null || message.getText() == null || message.getText().isBlank() || message.getText().length() > 4096 || !access.isAllowed(session)) return;
        var received = new DemoReceiveMessage().setFromUserId(WebSocketFrameworkUtils.getLoginUserId(session))
                .setText(message.getText()).setSingle(message.getToUserId() != null);
        for (var target : sessions.getSessionList(UserTypeEnum.ADMIN.getValue())) {
            if (!Objects.equals(WebSocketFrameworkUtils.getTenantId(target), WebSocketFrameworkUtils.getTenantId(session))) continue;
            if (message.getToUserId() != null && !Objects.equals(message.getToUserId(), WebSocketFrameworkUtils.getLoginUserId(target))) continue;
            if (target.isOpen() && access.isAllowed(target)) sender.sendObject(target.getId(), "demo-message-receive", received);
        }
    }
    @Override
    public String getType() { return "demo-message-send"; }
}
