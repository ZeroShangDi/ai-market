package cn.callphone.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Pattern;

@ConfigurationProperties("ai")
@Validated
public record AiSettings(String internalToken, String storageKey, String apiKey, String baseUrl,
                         String model, String completionsPath, @Min(1) @Max(8192) int maxOutputTokens, @Min(2) @Max(100) int maxContextMessages,
                         @Min(4096) @Max(64000) int maxContextChars, @Min(1) @Max(32000) int maxReplyChars,
                         @Min(1) @Max(32) int maxConcurrent, @Min(1) @Max(1000) int requestsPerMinute,
                         @Min(1) @Max(180) int generationSeconds, boolean streamUsage, @Pattern(regexp="|enabled|disabled") String thinkingMode) {}
