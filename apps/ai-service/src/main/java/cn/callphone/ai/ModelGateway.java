package cn.callphone.ai;

import reactor.core.publisher.Flux;
import java.util.List;

/** Provider protocol stays outside conversation and request state management. */
public interface ModelGateway {
    record Turn(String role, String content) {}
    record Chunk(String text, int inputTokens, int outputTokens) {}
    void checkAvailable();
    Flux<Chunk> stream(List<Turn> turns);
}
