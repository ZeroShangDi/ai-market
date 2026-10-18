package cn.iocoder.yudao.module.callphone.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/** Issues one-use voice tickets only after the mobile controller verifies identity and device. */
@Service
public class VoiceSessionIssuer {
    @Value("${VOICE_PUBLIC_URL:}") private String publicUrl;
    @Value("${VOICE_TICKET_SECRET:}") private String secret;
    public static final class Unavailable extends IllegalStateException {}
    private final ObjectMapper json = new ObjectMapper();

    public Map<String, String> issue(String tenant, String user, String device) {
        return issue(tenant, user, device, "");
    }

    public Map<String, String> issue(String tenant, String user, String device, String character) {
        try {
            if (!character.isEmpty() && !character.matches("[a-z][a-z0-9-]{0,39}-[1-9][0-9]{0,8}")) throw new IllegalArgumentException();
            if (secret == null || secret.length() < 32) throw new IllegalStateException();
            URI uri = URI.create(publicUrl);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null
                || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))) throw new IllegalStateException();
            var claims = Map.of("aud", "voice", "tenant", tenant, "user", user, "device", device,
                "exp", Instant.now().getEpochSecond() + 60, "nonce", UUID.randomUUID().toString(), "character", character);
            var base64 = Base64.getUrlEncoder().withoutPadding();
            String payload = base64.encodeToString(json.writeValueAsBytes(claims));
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String signature = base64.encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
            return Map.of("url", publicUrl.replaceAll("/+$", "") + "/", "ticket", payload + "." + signature);
        } catch (Exception error) {
            throw new Unavailable();
        }
    }
}
