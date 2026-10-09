package cn.iocoder.yudao.module.callphone.service.security;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;

/** Authenticated encryption for customer identifiers. The key must come from deployment secrets. */
@Service
public class PiiCryptoService {

    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final String CIPHER = "AES/GCM/NoPadding";

    @Value("${CALLPHONE_PII_ENCRYPTION_KEY:}")
    private String encodedKey;

    private SecretKeySpec key;
    private SecretKeySpec indexKey;
    private SecretKeySpec recordingKey;
    private final SecureRandom secureRandom = new SecureRandom();

    @PostConstruct
    public void initialize() {
        if (encodedKey == null || encodedKey.isBlank()) {
            throw new IllegalStateException("CALLPHONE_PII_ENCRYPTION_KEY must be configured");
        }
        byte[] rawKey;
        try {
            rawKey = Base64.getDecoder().decode(encodedKey);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("CALLPHONE_PII_ENCRYPTION_KEY must be valid Base64", exception);
        }
        if (rawKey.length != 32) {
            throw new IllegalStateException("CALLPHONE_PII_ENCRYPTION_KEY must decode to exactly 32 bytes");
        }
        key = new SecretKeySpec(rawKey, "AES");
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(rawKey, "HmacSHA256"));
            indexKey = new SecretKeySpec(mac.doFinal("callphone:index-key:v1".getBytes(java.nio.charset.StandardCharsets.UTF_8)), "HmacSHA256");
            recordingKey = new SecretKeySpec(mac.doFinal("callphone:recording-storage-key:v1".getBytes(java.nio.charset.StandardCharsets.UTF_8)), "AES");
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to derive Call Phone search index key", exception);
        }
    }

    /** Encrypts customer-side audio with a domain-separated key and a fresh GCM nonce. */
    public byte[] encryptRecording(byte[] plaintext) {
        if (plaintext == null) throw new IllegalArgumentException("Recording content is required");
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            secureRandom.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, recordingKey, new GCMParameterSpec(TAG_BITS, nonce));
            byte[] encrypted = cipher.doFinal(plaintext);
            return ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to encrypt Call Phone recording", exception);
        }
    }

    /** Decrypts and authenticates a customer-side audio object. */
    public byte[] decryptRecording(byte[] ciphertext) {
        if (ciphertext == null || ciphertext.length <= NONCE_BYTES) {
            throw new IllegalArgumentException("Encrypted recording is truncated");
        }
        try {
            ByteBuffer buffer = ByteBuffer.wrap(ciphertext);
            byte[] nonce = new byte[NONCE_BYTES];
            buffer.get(nonce);
            byte[] encrypted = new byte[buffer.remaining()];
            buffer.get(encrypted);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, recordingKey, new GCMParameterSpec(TAG_BITS, nonce));
            return cipher.doFinal(encrypted);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to authenticate Call Phone recording", exception);
        }
    }

    public String encrypt(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            secureRandom.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length)
                    .put(nonce).put(encrypted).array());
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to encrypt Call Phone PII", exception);
        }
    }

    public String decrypt(String ciphertext) {
        if (ciphertext == null) return null;
        try {
            byte[] bytes = Base64.getDecoder().decode(ciphertext);
            if (bytes.length <= NONCE_BYTES) throw new IllegalArgumentException("Encrypted value is truncated");
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            byte[] nonce = new byte[NONCE_BYTES];
            buffer.get(nonce);
            byte[] encrypted = new byte[buffer.remaining()];
            buffer.get(encrypted);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            return new String(cipher.doFinal(encrypted), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to decrypt Call Phone PII", exception);
        }
    }

    /** Creates a deterministic, tenant-local lookup token with a domain-separated HMAC key. */
    public String indexHash(String domain, String value) {
        if (domain == null || !domain.matches("[a-z0-9-]{1,48}") || value == null) {
            throw new IllegalArgumentException("Invalid deterministic index input");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(indexKey);
            mac.update(domain.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            mac.update((byte) 0);
            return java.util.HexFormat.of().formatHex(mac.doFinal(value.trim().toLowerCase(java.util.Locale.ROOT)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to create Call Phone lookup token", exception);
        }
    }
}
