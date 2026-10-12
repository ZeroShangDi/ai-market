package cn.callphone.ai;

import org.springframework.stereotype.Component;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.retry.support.RetryTemplate;
import reactor.core.publisher.Flux;
import java.util.List;
import java.util.Map;
import static cn.callphone.ai.Protocol.*;

@Component
public final class SpringAiModelGateway implements ModelGateway {
    private final AiSettings settings;
    private volatile OpenAiChatModel client;
    public SpringAiModelGateway(AiSettings settings) { this.settings=settings; }
    @Override public void checkAvailable() {
        if (settings.apiKey()==null || settings.apiKey().isBlank() || settings.model()==null || settings.model().isBlank())
            throw new Problem("AI_UNAVAILABLE", "AI 服务尚未配置，请联系管理员",503);
    }
    private synchronized OpenAiChatModel client() {
        checkAvailable();
        if(client==null) {
            OpenAiApi api=OpenAiApi.builder().apiKey(settings.apiKey()).baseUrl(settings.baseUrl())
                .completionsPath(settings.completionsPath()).build();
            var options=OpenAiChatOptions.builder().model(settings.model()).maxTokens(settings.maxOutputTokens()).streamUsage(settings.streamUsage());
            // DeepSeek otherwise enables thinking by default, consuming the short text reply budget.
            // Leave this setting empty when using a provider without the thinking extension.
            if(settings.thinkingMode()!=null && !settings.thinkingMode().isBlank())
                options.extraBody(Map.of("thinking",Map.of("type",settings.thinkingMode())));
            client=OpenAiChatModel.builder().openAiApi(api)
                .defaultOptions(options.build())
                // A network retry can create a second billable completion; retries are explicit user requests.
                .retryTemplate(RetryTemplate.builder().maxAttempts(1).fixedBackoff(1).build()).build();
        }
        return client;
    }
    @Override public Flux<Chunk> stream(List<Turn> turns) {
        return Flux.defer(() -> {
            List<Message> messages=turns.stream().map(t -> switch(t.role()) {
                case "system" -> (Message)new SystemMessage(t.content());
                case "assistant" -> (Message)new AssistantMessage(t.content());
                default -> (Message)new UserMessage(t.content());
            }).toList();
            return client().stream(new Prompt(messages)).map(response -> {
                var usage=response.getMetadata().getUsage();
                String text=response.getResult()==null?"":response.getResult().getOutput().getText();
                return new Chunk(text==null?"":text,usage.getPromptTokens()==null?0:usage.getPromptTokens(),
                    usage.getCompletionTokens()==null?0:usage.getCompletionTokens());
            });
        });
    }
}
