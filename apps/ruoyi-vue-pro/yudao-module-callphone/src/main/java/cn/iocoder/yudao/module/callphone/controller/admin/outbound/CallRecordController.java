package cn.iocoder.yudao.module.callphone.controller.admin.outbound;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.framework.excel.core.util.ExcelUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordEventRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordExportExcelVO;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordSummaryRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.MobileCallEventDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.PairedDeviceDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.MobileCallEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.outbound.CallRecordService;
import cn.iocoder.yudao.module.callphone.service.outbound.CallRecordingAccessService;
import cn.iocoder.yudao.module.callphone.service.outbound.CallRecordingContent;
import cn.iocoder.yudao.module.callphone.framework.datapermission.CallPhoneOwnerScopeService;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 外呼记录")
@RestController
@RequestMapping("/callphone/call-record")
@Validated
public class CallRecordController {

    private static final int EXPORT_MAX_ROWS = 5_000;
    private static final Map<String, String> DIRECTION_LABELS = Map.of("outbound", "呼出", "inbound", "呼入");
    private static final Map<String, String> STATUS_LABELS = Map.of("requested", "等待手机", "dialing", "拨号中",
            "connected", "已接通", "ended", "已结束", "failed", "失败", "cancelled", "已撤回");
    private static final Map<String, String> RESULT_LABELS = Map.of("connected", "已接通", "no_answer", "无人接听",
            "busy", "忙线", "rejected", "拒接", "invalid_number", "号码无效", "other", "其他");
    private static final Map<String, String> RECORDING_LABELS = Map.of("none", "无录音", "pending", "待同步",
            "ready", "可用", "failed", "失败");
    private static final Map<String, String> SUMMARY_LABELS = Map.of("unavailable", "不可用", "pending", "待处理",
            "ready", "已完成", "failed", "失败");

    @Resource
    private CallRecordService callRecordService;
    @Resource
    private AdminUserApi adminUserApi;
    @Resource
    private PiiCryptoService piiCryptoService;
    @Resource
    private PairedDeviceMapper deviceMapper;
    @Resource
    private MobileCallEventMapper eventMapper;
    @Resource
    private CallRecordingAccessService recordingAccessService;
    @Resource
    private CallPhoneOwnerScopeService ownerScopeService;

    @GetMapping("/page")
    @Operation(summary = "外呼与通话记录分页")
    @PreAuthorize("@ss.hasPermission('callphone:call:record:query')")
    public CommonResult<PageResult<CallRecordRespVO>> getPage(@Valid CallRecordPageReqVO reqVO) {
        PageResult<CallRecordDO> page = callRecordService.getCallRecordPage(reqVO);
        List<CallRecordRespVO> records = BeanUtils.toBean(page.getList(), CallRecordRespVO.class);
        Map<Long, AdminUserRespDTO> userMap = adminUserApi.getUserMap(
                cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet(
                        page.getList(), CallRecordDO::getOwnerUserId));
        Map<Long, PairedDeviceDO> deviceMap = deviceMapper.selectBatchIds(
                cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet(
                        page.getList(), CallRecordDO::getDeviceId)).stream()
                .collect(java.util.stream.Collectors.toMap(PairedDeviceDO::getId, device -> device, (left, right) -> left));
        for (int i = 0; i < records.size(); i++) {
            CallRecordRespVO record = records.get(i);
            CallRecordDO source = page.getList().get(i);
            record.setCustomerName(piiCryptoService.decrypt(source.getCustomerNameCiphertext()));
            record.setNextStep(piiCryptoService.decrypt(source.getNextStepCiphertext()));
            record.setNote(piiCryptoService.decrypt(source.getNoteCiphertext()));
            AdminUserRespDTO owner = userMap.get(record.getOwnerUserId());
            if (owner != null) {
                record.setOwnerName(owner.getNickname());
            }
            PairedDeviceDO device = deviceMap.get(record.getDeviceId());
            if (device != null) record.setDeviceName(device.getDisplayName());
        }
        return success(new PageResult<>(records, page.getTotal()));
    }

    @GetMapping("/summary")
    @Operation(summary = "读取本人通话统计与待跟进数量")
    @PreAuthorize("@ss.hasPermission('callphone:call:record:query')")
    public CommonResult<CallRecordSummaryRespVO> getSummary(@Valid CallRecordPageReqVO reqVO) {
        return success(callRecordService.getSummary(reqVO));
    }

    @GetMapping("/export-excel")
    @Operation(summary = "导出通话记录 Excel（仅含脱敏号码，最多 5000 条）")
    @PreAuthorize("@ss.hasPermission('callphone:call:record:export')")
    public void exportExcel(@Valid CallRecordPageReqVO reqVO, HttpServletResponse response) throws IOException {
        reqVO.setPageNo(1);
        reqVO.setPageSize(EXPORT_MAX_ROWS + 1);
        PageResult<CallRecordDO> page = callRecordService.getCallRecordPage(reqVO);
        if (page.getTotal() != null && page.getTotal() > EXPORT_MAX_ROWS) {
            throw new ServiceException(ErrorCodeConstants.CALL_RECORD_EXPORT_LIMIT);
        }

        Set<Long> ownerIds = page.getList().stream().map(CallRecordDO::getOwnerUserId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, AdminUserRespDTO> userMap = ownerIds.isEmpty() ? Map.of() : adminUserApi.getUserMap(ownerIds);
        Set<Long> deviceIds = page.getList().stream().map(CallRecordDO::getDeviceId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, PairedDeviceDO> devices = deviceIds.isEmpty() ? Map.of() : deviceMapper.selectBatchIds(deviceIds)
                .stream().collect(Collectors.toMap(PairedDeviceDO::getId, device -> device, (left, right) -> left));

        List<CallRecordExportExcelVO> rows = page.getList().stream().map(record -> {
            CallRecordExportExcelVO row = new CallRecordExportExcelVO();
            row.setId(record.getId() == null ? "" : record.getId().toString());
            row.setPhoneDisplay(record.getPhoneDisplay());
            row.setDirection(label(record.getDirection(), DIRECTION_LABELS));
            AdminUserRespDTO owner = userMap.get(record.getOwnerUserId());
            row.setOwnerName(owner == null ? "" : owner.getNickname());
            PairedDeviceDO device = devices.get(record.getDeviceId());
            row.setDeviceName(device == null ? "" : device.getDisplayName());
            row.setStatus(label(record.getStatus(), STATUS_LABELS));
            row.setResultCode(label(record.getResultCode(), RESULT_LABELS));
            row.setStartedAt(record.getStartedAt());
            row.setEndedAt(record.getEndedAt());
            row.setDurationSeconds(record.getDurationSeconds());
            row.setRecordingState(label(record.getRecordingState(), RECORDING_LABELS));
            row.setSummaryState(label(record.getSummaryState(), SUMMARY_LABELS));
            row.setCreateTime(record.getCreateTime());
            return row;
        }).toList();
        ExcelUtils.write(response, "Call-Phone-通话记录.xls", "通话记录", CallRecordExportExcelVO.class, rows);
    }

    private String label(String value, Map<String, String> labels) {
        return value == null ? "" : labels.getOrDefault(value, value);
    }

    @GetMapping("/get")
    @Operation(summary = "外呼与通话记录详情")
    @PreAuthorize("@ss.hasPermission('callphone:call:record:query')")
    public CommonResult<CallRecordRespVO> get(@RequestParam("id") Long id) {
        CallRecordDO record = callRecordService.getCallRecord(id);
        if (record == null) {
            return success(null);
        }
        CallRecordRespVO respVO = BeanUtils.toBean(record, CallRecordRespVO.class);
        respVO.setCustomerName(piiCryptoService.decrypt(record.getCustomerNameCiphertext()));
        respVO.setNextStep(piiCryptoService.decrypt(record.getNextStepCiphertext()));
        respVO.setNote(piiCryptoService.decrypt(record.getNoteCiphertext()));
        AdminUserRespDTO owner = adminUserApi.getUser(record.getOwnerUserId());
        if (owner != null) {
            respVO.setOwnerName(owner.getNickname());
        }
        PairedDeviceDO device = record.getDeviceId() == null ? null : deviceMapper.selectById(record.getDeviceId());
        if (device != null) respVO.setDeviceName(device.getDisplayName());
        return success(respVO);
    }

    @GetMapping("/events")
    @Operation(summary = "读取本人通话记录的手机状态事件")
    @PreAuthorize("@ss.hasPermission('callphone:call:record:query')")
    public CommonResult<List<CallRecordEventRespVO>> getEvents(@RequestParam("id") Long id) {
        CallRecordDO record = callRecordService.getCallRecord(id);
        if (record == null) {
            return success(List.of());
        }
        List<MobileCallEventDO> events = eventMapper.selectTimeline(record.getId(), record.getCallDispatchId());
        return success(events.stream().map(event -> {
            CallRecordEventRespVO resp = new CallRecordEventRespVO();
            resp.setId(event.getId());
            resp.setEventType(event.getEventType());
            resp.setOccurredAt(event.getCreateTime());
            return resp;
        }).toList());
    }

    @GetMapping("/recording")
    @Operation(summary = "按当前数据范围读取通话录音")
    @PreAuthorize("@ss.hasPermission('callphone:call:record:query')")
    public void getRecording(@RequestParam("id") Long id, HttpServletResponse response) throws IOException {
        CallRecordingContent recording = recordingAccessService.readWithinCurrentDataScope(id, getLoginUserId());
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(recording.contentType());
        response.setContentLengthLong(recording.bytes().length);
        response.setHeader("Content-Disposition", "inline; filename=call-recording");
        response.setHeader("Cache-Control", "private, no-store, max-age=0");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.getOutputStream().write(recording.bytes());
    }
}
