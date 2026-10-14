package cn.callphone.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.core.ParameterizedTypeReference;
import reactor.core.publisher.Flux;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import static cn.callphone.ai.Protocol.*;

/** Internal-only stream bridge. Public device tokens and keys never leave the customer API. */
@Component
public final class WebChatGateway {
    private final WebClient client;
    private final String token;
    public WebChatGateway(@Value("${AGENT_SERVICE_URL:http://127.0.0.1:48082}") String url,
                          @Value("${AGENT_INTERNAL_TOKEN:}") String token) {
        this.client=WebClient.builder().baseUrl(url).codecs(c -> c.defaultCodecs().maxInMemorySize(262144)).build(); this.token=token;
    }
    public void checkAvailable() {
        if(token==null || token.length()<32) throw new Problem("WEB_CHAT_UNAVAILABLE","联网服务尚未配置，请联系管理员",503);
    }
    public Flux<ModelGateway.Chunk> stream(List<ModelGateway.Turn> turns,Actor actor) {
        return Flux.defer(() -> {
            checkAvailable();
            AtomicBoolean done=new AtomicBoolean();
            return client.post().uri("/internal/v1/agent/chat/stream").headers(headers -> {
                headers.setBearerAuth(token); headers.set("X-AI-Tenant",actor.tenant()); headers.set("X-AI-User",actor.user()); headers.set("X-AI-Device",actor.device());
            }).bodyValue(Map.of("turns",turns)).retrieve()
                .onStatus(status -> status.isError(), response -> response.releaseBody().then(reactor.core.publisher.Mono.error(
                    new Problem("WEB_CHAT_UNAVAILABLE","联网服务暂时不可用，请重试",503))))
                .bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<Map<String,Object>>>() {})
                .<ModelGateway.Chunk>handle((event,sink) -> {
                    Map<String,Object> data=event.data();
                    // A live search can take longer than a text token. Preserve authenticated
                    // upstream heartbeats; ChatService still enforces its 180-second total bound.
                    if(data==null) { if(event.comment()!=null) sink.next(new ModelGateway.Chunk("",0,0)); return; }
                    switch(String.valueOf(data.get("type"))) {
                        case "chunk" -> { if(!(data.get("text") instanceof String text)) throw invalid("联网回复格式不正确"); sink.next(new ModelGateway.Chunk(text,0,0)); }
                        case "activity" -> { String stage=String.valueOf(data.get("stage")); if(!List.of("searching","answering").contains(stage)) throw invalid("联网状态不正确"); sink.next(new ModelGateway.Chunk("",0,0,stage)); }
                        case "usage" -> sink.next(new ModelGateway.Chunk("",number(data.get("input_tokens")),number(data.get("output_tokens"))));
                        case "done" -> done.set(true);
                        case "error" -> sink.error(new Problem("WEB_SEARCH_UNAVAILABLE","联网搜索未完成，请重试",503));
                        default -> sink.error(new Problem("WEB_CHAT_UNAVAILABLE","联网回复格式不正确",503));
                    }
                }).concatWith(Flux.defer(() -> done.get()?Flux.empty():Flux.error(new Problem("WEB_CHAT_UNAVAILABLE","联网回复中断，请重试",503))))
                .onErrorMap(failure -> failure instanceof Problem?failure:new Problem("WEB_CHAT_UNAVAILABLE","联网服务暂时不可用，请重试",503));
        });
    }
    private static int number(Object value) { return value instanceof Number n?Math.max(0,n.intValue()):0; }
}
