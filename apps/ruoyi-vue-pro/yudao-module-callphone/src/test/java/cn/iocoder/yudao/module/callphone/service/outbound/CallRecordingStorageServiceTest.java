package cn.iocoder.yudao.module.callphone.service.outbound;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordingAssetDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CallRecordingAssetMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CallRecordingStorageServiceTest {

    private static final Long CALL_ID = 7001L;
    private static final Long DEVICE_ID = 8001L;
    private static final Long OWNER_ID = 9001L;
    private static final String UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";

    @Mock private CallRecordingAssetMapper assetMapper;
    @Mock private CallRecordMapper callRecordMapper;
    @Mock private PiiCryptoService crypto;

    @TempDir Path recordingDirectory;

    private CallRecordingStorageService service;

    @BeforeEach
    void setUp() {
        service = new CallRecordingStorageService();
        ReflectionTestUtils.setField(service, "storagePath", recordingDirectory.toString());
        ReflectionTestUtils.setField(service, "assetMapper", assetMapper);
        ReflectionTestUtils.setField(service, "callRecordMapper", callRecordMapper);
        ReflectionTestUtils.setField(service, "crypto", crypto);
    }

    @Test
    void concurrentSameUploadReturnsWinnerAndRemovesOrphanFile() throws Exception {
        byte[] audio = validWavHeader();
        CallRecordingAssetDO winner = new CallRecordingAssetDO();
        winner.setCallRecordId(CALL_ID);
        winner.setSha256(sha256(audio));
        when(assetMapper.selectByUploadId(DEVICE_ID, UPLOAD_ID)).thenReturn(null);
        when(assetMapper.selectByCallRecordId(CALL_ID)).thenReturn(null);
        when(crypto.encryptRecording(audio)).thenReturn(new byte[] {1, 2, 3, 4});
        doThrow(new DuplicateKeyException("concurrent unique-key winner"))
                .when(assetMapper).insert(any(CallRecordingAssetDO.class));
        when(assetMapper.selectByUploadIdForUpdate(DEVICE_ID, UPLOAD_ID)).thenReturn(winner);

        assertSame(winner, service.save(CALL_ID, DEVICE_ID, OWNER_ID, UPLOAD_ID, audio));

        try (var files = Files.list(recordingDirectory)) {
            assertEquals(0, files.count());
        }
        verify(assetMapper).selectByUploadIdForUpdate(DEVICE_ID, UPLOAD_ID);
        verifyNoInteractions(callRecordMapper);
    }

    @Test
    void concurrentDifferentUploadForSameCallReturnsConflictAndCleansFile() throws Exception {
        byte[] audio = validWavHeader();
        CallRecordingAssetDO existing = new CallRecordingAssetDO();
        existing.setCallRecordId(CALL_ID);
        when(assetMapper.selectByUploadId(DEVICE_ID, UPLOAD_ID)).thenReturn(null);
        when(assetMapper.selectByCallRecordId(CALL_ID)).thenReturn(null);
        when(crypto.encryptRecording(audio)).thenReturn(new byte[] {1, 2, 3, 4});
        doThrow(new DuplicateKeyException("concurrent call-record winner"))
                .when(assetMapper).insert(any(CallRecordingAssetDO.class));
        when(assetMapper.selectByUploadIdForUpdate(DEVICE_ID, UPLOAD_ID)).thenReturn(null);
        when(assetMapper.selectByCallRecordIdForUpdate(CALL_ID)).thenReturn(existing);

        ServiceException error = assertThrows(ServiceException.class,
                () -> service.save(CALL_ID, DEVICE_ID, OWNER_ID, UPLOAD_ID, audio));

        assertEquals(ErrorCodeConstants.CALL_RECORDING_UPLOAD_CONFLICT.getCode(), error.getCode());
        try (var files = Files.list(recordingDirectory)) {
            assertEquals(0, files.count());
        }
        verify(assetMapper).selectByCallRecordIdForUpdate(CALL_ID);
    }

    private byte[] validWavHeader() {
        return new byte[] {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'A', 'V', 'E'};
    }

    private String sha256(byte[] value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    }
}
