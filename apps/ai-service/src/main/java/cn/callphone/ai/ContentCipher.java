package cn.callphone.ai;

import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

@Component
public final class ContentCipher {
    private final SecretKeySpec key;
    private final byte[] fingerprintKey;
    private final SecureRandom random = new SecureRandom();
    public ContentCipher(AiSettings settings) {
        try {
            byte[] raw = Base64.getDecoder().decode(settings.storageKey());
            if (raw.length != 32) throw new IllegalArgumentException();
            key = new SecretKeySpec(raw, "AES");
            Mac mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(raw,"HmacSHA256"));
            fingerprintKey=mac.doFinal("ai:request-fingerprint:v1".getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { throw new IllegalStateException("AI_STORAGE_KEY must be Base64 encoded 32 bytes"); }
    }
    public String encrypt(String text) {
        try {
            byte[] nonce=new byte[12]; random.nextBytes(nonce);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,key,new GCMParameterSpec(128,nonce));
            byte[] encrypted=cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(12+encrypted.length).put(nonce).put(encrypted).array());
        } catch(Exception e) { throw new IllegalStateException("Cannot encrypt AI content"); }
    }
    public String decrypt(String text) {
        try {
            ByteBuffer bytes=ByteBuffer.wrap(Base64.getDecoder().decode(text));
            byte[] nonce=new byte[12]; bytes.get(nonce); byte[] data=new byte[bytes.remaining()]; bytes.get(data);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,nonce));
            return new String(cipher.doFinal(data),StandardCharsets.UTF_8);
        } catch(Exception e) { throw new IllegalStateException("Cannot decrypt AI content; check the storage key"); }
    }
    public String fingerprint(String text) {
        try {
            Mac mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(fingerprintKey,"HmacSHA256"));
            return Base64.getEncoder().encodeToString(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)));
        } catch(Exception e) { throw new IllegalStateException("Cannot fingerprint AI request"); }
    }
}
