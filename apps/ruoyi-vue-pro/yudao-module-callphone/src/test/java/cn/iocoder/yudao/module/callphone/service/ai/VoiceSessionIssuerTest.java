package cn.iocoder.yudao.module.callphone.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import static org.junit.jupiter.api.Assertions.*;

class VoiceSessionIssuerTest {
    @Test void ticketUsesTrustedIdentityShortExpiryAndValidSignature() throws Exception {
        var issuer = new VoiceSessionIssuer();
        String secret = "synthetic-voice-test-secret-00000000";
        ReflectionTestUtils.setField(issuer, "publicUrl", "https://voice.example.test");
        ReflectionTestUtils.setField(issuer, "secret", secret);
        var result = issuer.issue("0", "7", "10", "elf-1");
        assertEquals("https://voice.example.test/", result.get("url"));
        var parts = result.get("ticket").split("\\.");
        var claims = new ObjectMapper().readTree(Base64.getUrlDecoder().decode(parts[0]));
        assertEquals("voice", claims.get("aud").asText());
        assertEquals("elf-1", claims.get("character").asText());
        assertEquals("7", claims.get("user").asText());
        assertEquals("10", claims.get("device").asText());
        assertTrue(claims.get("exp").asLong() > Instant.now().getEpochSecond());
        assertTrue(claims.get("exp").asLong() <= Instant.now().getEpochSecond() + 60);
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        assertArrayEquals(mac.doFinal(parts[0].getBytes(StandardCharsets.UTF_8)), Base64.getUrlDecoder().decode(parts[1]));
        assertNotEquals(result.get("ticket"), issuer.issue("0", "7", "10").get("ticket"));
    }
    @Test void missingSecretAndUnsafeUrlFailClosed() {
        var issuer = new VoiceSessionIssuer();
        assertThrows(IllegalStateException.class, () -> issuer.issue("0", "7", "10"));
        ReflectionTestUtils.setField(issuer, "secret", "synthetic-voice-test-secret-00000000");
        for (String url : new String[]{"http://voice.test", "https://user:password@voice.test", "https://voice.test/path", "https://voice.test?token=bad"}) {
            ReflectionTestUtils.setField(issuer,"publicUrl",url);
            assertThrows(IllegalStateException.class,()->issuer.issue("0","7","10"));
        }
    }
}
