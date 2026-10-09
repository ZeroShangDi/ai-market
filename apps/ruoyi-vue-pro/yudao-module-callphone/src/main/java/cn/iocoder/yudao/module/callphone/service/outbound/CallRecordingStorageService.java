package cn.iocoder.yudao.module.callphone.service.outbound;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordingAssetDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordingAssetMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import jakarta.annotation.Resource;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stores audio only on the customer deployment, encrypted at rest with AES-GCM. */
@Service
public class CallRecordingStorageService {

    public static final long MAX_RECORDING_BYTES = 25L * 1024 * 1024;
    private static final int GCM_OVERHEAD_BYTES = 28;

    @Value("${CALLPHONE_RECORDING_STORAGE_PATH:/yudao-server/data/callphone/recordings}")
    private String storagePath;

    @Resource private CallRecordingAssetMapper assetMapper;
    @Resource private CallRecordMapper callRecordMapper;
    @Resource private PiiCryptoService crypto;

    @Transactional(rollbackFor = Exception.class)
    public CallRecordingAssetDO save(Long callId, Long deviceId, Long ownerUserId, String uploadId, byte[] content) {
        if (uploadId == null || !uploadId.matches("[A-Za-z0-9_-]{16,100}") || content == null
                || content.length == 0 || content.length > MAX_RECORDING_BYTES) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    ErrorCodeConstants.CALL_RECORDING_UPLOAD_INVALID);
        }
        String contentType = detectAudioType(content);
        if (contentType == null) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    ErrorCodeConstants.CALL_RECORDING_UPLOAD_INVALID);
        }
        String sha256 = sha256(content);
        CallRecordingAssetDO prior = assetMapper.selectByUploadId(deviceId, uploadId);
        if (prior != null) {
            if (Objects.equals(prior.getCallRecordId(), callId) && Objects.equals(prior.getSha256(), sha256)) return prior;
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    ErrorCodeConstants.CALL_RECORDING_UPLOAD_CONFLICT);
        }
        if (assetMapper.selectByCallRecordId(callId) != null) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    ErrorCodeConstants.CALL_RECORDING_UPLOAD_CONFLICT);
        }

        String objectKey = UUID.randomUUID() + ".enc";
        Path root = Path.of(storagePath).toAbsolutePath().normalize();
        Path target = root.resolve(objectKey).normalize();
        Path temporary = null;
        try {
            Files.createDirectories(root);
            if (!target.startsWith(root)) throw new IOException("Invalid recording object path");
            temporary = Files.createTempFile(root, ".recording-", ".tmp");
            Files.write(temporary, crypto.encryptRecording(content));
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, target);
            }
            temporary = null;

            CallRecordingAssetDO asset = new CallRecordingAssetDO();
            asset.setId(IdUtil.getSnowflake().nextId());
            asset.setCallRecordId(callId);
            asset.setDeviceId(deviceId);
            asset.setOwnerUserId(ownerUserId);
            asset.setUploadId(uploadId);
            asset.setObjectKey(objectKey);
            asset.setContentType(contentType);
            asset.setSizeBytes((long) content.length);
            asset.setSha256(sha256);
            try {
                assetMapper.insert(asset);
            } catch (DuplicateKeyException conflict) {
                // A concurrent retry can win the unique upload/call key after the pre-check.
                // Use locking reads so MySQL REPEATABLE_READ sees the committed winner.
                CallRecordingAssetDO uploaded = assetMapper.selectByUploadIdForUpdate(deviceId, uploadId);
                if (uploaded != null) {
                    if (Objects.equals(uploaded.getCallRecordId(), callId)
                            && Objects.equals(uploaded.getSha256(), sha256)) {
                        Files.deleteIfExists(target);
                        return uploaded;
                    }
                    throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                            ErrorCodeConstants.CALL_RECORDING_UPLOAD_CONFLICT);
                }
                if (assetMapper.selectByCallRecordIdForUpdate(callId) != null) {
                    throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                            ErrorCodeConstants.CALL_RECORDING_UPLOAD_CONFLICT);
                }
                throw conflict;
            }

            int updated = callRecordMapper.update(null, new LambdaUpdateWrapper<CallRecordDO>()
                    .set(CallRecordDO::getRecordingState, "ready")
                    .eq(CallRecordDO::getId, callId)
                    .eq(CallRecordDO::getDeviceId, deviceId)
                    .eq(CallRecordDO::getOwnerUserId, ownerUserId)
                    .eq(CallRecordDO::getStatus, "ended"));
            if (updated != 1) {
                throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                        ErrorCodeConstants.CALL_RECORDING_UPLOAD_INVALID);
            }
            return asset;
        } catch (Exception exception) {
            try {
                if (temporary != null) Files.deleteIfExists(temporary);
                Files.deleteIfExists(target);
            } catch (IOException ignored) {
                // A later deployment cleanup can remove orphaned encrypted objects.
            }
            throw exception instanceof RuntimeException runtimeException ? runtimeException
                    : new IllegalStateException("Unable to store encrypted Call Phone recording", exception);
        }
    }

    public CallRecordingAssetDO getAsset(Long callId) {
        return assetMapper.selectByCallRecordId(callId);
    }

    public byte[] read(CallRecordingAssetDO asset) {
        if (asset == null || asset.getObjectKey() == null || !asset.getObjectKey().matches("[a-f0-9-]{36}\\.enc")) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
        }
        Path root = Path.of(storagePath).toAbsolutePath().normalize();
        Path object = root.resolve(asset.getObjectKey()).normalize();
        try {
            if (!object.startsWith(root) || !Files.isRegularFile(object)) {
                throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                        ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
            }
            long encryptedLength = Files.size(object);
            if (encryptedLength <= GCM_OVERHEAD_BYTES || encryptedLength > MAX_RECORDING_BYTES + GCM_OVERHEAD_BYTES) {
                throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                        ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
            }
            byte[] cleartext = crypto.decryptRecording(Files.readAllBytes(object));
            if (cleartext.length != asset.getSizeBytes() || !Objects.equals(sha256(cleartext), asset.getSha256())) {
                throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                        ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
            }
            return cleartext;
        } catch (IOException exception) {
            throw cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception(
                    ErrorCodeConstants.CALL_RECORDING_NOT_FOUND);
        }
    }

    private String sha256(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to fingerprint recording", exception);
        }
    }

    private String detectAudioType(byte[] value) {
        if (value.length >= 12 && ascii(value, 0, "RIFF") && ascii(value, 8, "WAVE")) return "audio/wav";
        if (value.length >= 6 && ascii(value, 0, "#!AMR\n")) return "audio/amr";
        if (value.length >= 8 && ascii(value, 4, "ftyp")) return "audio/mp4";
        if (value.length >= 3 && ascii(value, 0, "ID3")) return "audio/mpeg";
        if (value.length >= 2 && (value[0] & 0xff) == 0xff && (value[1] & 0xe0) == 0xe0) {
            return (value[1] & 0xf6) == 0xf0 ? "audio/aac" : "audio/mpeg";
        }
        return null;
    }

    private boolean ascii(byte[] value, int offset, String expected) {
        byte[] bytes = expected.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        if (offset + bytes.length > value.length) return false;
        for (int i = 0; i < bytes.length; i++) if (value[offset + i] != bytes[i]) return false;
        return true;
    }
}
