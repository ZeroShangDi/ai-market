package cn.callphone.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;

public final class Protocol {
    private Protocol() {}
    public record Actor(String tenant, String user, String device) {}
    public record Send(@NotBlank @Pattern(regexp="[a-fA-F0-9-]{36}") String request_id,
                       @NotBlank @Pattern(regexp="[0-9]{1,19}") String conversation_id,
                       @NotBlank @Size(max=4000) String content,
                       @Pattern(regexp="[0-9]{1,19}") String retry_of, Boolean web_search,
                       @Pattern(regexp="[a-z][a-z0-9-]{0,39}-[1-9][0-9]{0,8}") String character) {
        public Send(String request_id,String conversation_id,String content,String retry_of,Boolean web_search) { this(request_id,conversation_id,content,retry_of,web_search,null); }
        public Send(String request_id,String conversation_id,String content,String retry_of) { this(request_id,conversation_id,content,retry_of,false); }
    }
    public record Transcript(@NotBlank String request_id, @NotBlank String role, @NotBlank @Size(max=6000) String content) {}
    public static final class Problem extends RuntimeException {
        public final String code;
        public final int status;
        public Problem(String code, String message, int status) { super(message); this.code=code; this.status=status; }
    }
    public static Problem missing() { return new Problem("NOT_FOUND", "会话或请求不存在", 404); }
    public static Problem invalid(String message) { return new Problem("VALIDATION_ERROR", message, 400); }
    public static Map<String,Object> error(String code, String message) {
        return Map.of("error", Map.of("code", code, "message", message));
    }
}
