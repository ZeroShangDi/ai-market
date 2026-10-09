package cn.iocoder.yudao.module.callphone.service.system;

import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import jakarta.annotation.Resource;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.CipherInputStream;
import javax.crypto.CipherOutputStream;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

/** Encrypts portable local backups with a domain-separated key derived from the deployment secret. */
@Service
public class CallPhoneBackupCryptoService {
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    @Resource private PiiCryptoService piiCrypto;
    private final SecureRandom secureRandom = new SecureRandom();

    public OutputStream encrypt(OutputStream target) throws Exception {
        byte[] nonce = new byte[NONCE_BYTES];
        secureRandom.nextBytes(nonce);
        target.write(nonce);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, nonce));
        return new CipherOutputStream(target, cipher);
    }

    public InputStream decrypt(InputStream source) throws Exception {
        byte[] nonce = source.readNBytes(NONCE_BYTES);
        if (nonce.length != NONCE_BYTES) throw new IllegalArgumentException("Backup encryption header is truncated");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, nonce));
        return new CipherInputStream(source, cipher);
    }

    private SecretKeySpec key() {
        byte[] derived = HexFormat.of().parseHex(piiCrypto.indexHash("callphone-backup-key", "portable-backup-v1"));
        return new SecretKeySpec(derived, "AES");
    }
}
