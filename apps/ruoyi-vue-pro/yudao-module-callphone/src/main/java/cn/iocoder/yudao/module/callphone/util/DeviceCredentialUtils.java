package cn.iocoder.yudao.module.callphone.util;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Utilities shared by the desktop pairing flow and the mobile claim endpoint. */
public final class DeviceCredentialUtils {

    private static final SecureRandom RANDOM = new SecureRandom();

    private DeviceCredentialUtils() {
    }

    public static String sha256(String value) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    /**
     * Creates a keyed request fingerprint for idempotent device events. Length-prefixing each
     * part prevents delimiter ambiguity; the caller must use a high-entropy device credential
     * as the key and must never persist or log that key.
     */
    public static String hmacSha256(String key, String... parts) {
        if (key == null || key.isBlank() || key.getBytes(StandardCharsets.UTF_8).length < 32 || parts == null) {
            throw new IllegalArgumentException("Invalid device event fingerprint input");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            for (String part : parts) {
                byte[] bytes = part == null ? null : part.getBytes(StandardCharsets.UTF_8);
                mac.update(ByteBuffer.allocate(Integer.BYTES).putInt(bytes == null ? -1 : bytes.length).array());
                if (bytes != null) mac.update(bytes);
            }
            return java.util.HexFormat.of().formatHex(mac.doFinal());
        } catch (Exception exception) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", exception);
        }
    }

    public static String createDeviceKey() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
