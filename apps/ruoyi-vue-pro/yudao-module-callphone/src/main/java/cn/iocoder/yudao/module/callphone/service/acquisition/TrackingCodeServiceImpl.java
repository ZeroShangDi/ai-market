package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodeSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.AcquisitionChannelMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeScanDailyMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import jakarta.annotation.Resource;
import java.net.URI;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.security.SecureRandom;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.util.UriComponentsBuilder;

@Service
@Validated
public class TrackingCodeServiceImpl implements TrackingCodeService {

    private static final List<String> TYPES = List.of("channel", "employee", "store", "visitor_identification");
    private static final List<String> MATCH_RULES = List.of("phone_exact", "wecom_identity", "anonymous_only");
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    @Resource private TrackingCodeMapper trackingCodeMapper;
    @Resource private TrackingCodeScanDailyMapper scanDailyMapper;
    @Resource private AcquisitionChannelMapper channelMapper;
    @Resource private LeadMapper leadMapper;
    @Resource private AdminUserApi adminUserApi;

    @Override
    public PageResult<TrackingCodeDO> getPage(TrackingCodePageReqVO reqVO, Long userId) {
        PageResult<TrackingCodeDO> page = trackingCodeMapper.selectPage(reqVO);
        if (page.getList().isEmpty()) return page;

        List<Long> codeIds = page.getList().stream().map(TrackingCodeDO::getId).toList();
        Map<Long, Long> scansByCode = new HashMap<>();
        for (Map<String, Object> row : scanDailyMapper.selectCodeTotals(codeIds)) {
            Long codeId = number(row, "trackingCodeId", "tracking_code_id");
            Long scanCount = number(row, "scanCount", "scan_count");
            if (codeId != null && scanCount != null) scansByCode.put(codeId, scanCount);
        }

        List<String> publicCodes = page.getList().stream().map(TrackingCodeDO::getPublicCode)
                .filter(code -> code != null && !code.isBlank()).toList();
        Map<String, Long> leadsByCode = new HashMap<>();
        if (userId != null && !publicCodes.isEmpty()) {
            for (Map<String, Object> row : leadMapper.selectAttributionCounts(publicCodes, userId)) {
                Object sourceCode = row.get("sourceCode");
                if (sourceCode == null) sourceCode = row.get("source_code");
                Long leadCount = number(row, "leadCount", "lead_count");
                if (sourceCode instanceof String code && leadCount != null) leadsByCode.put(code, leadCount);
            }
        }
        page.getList().forEach(row -> {
            row.setScans(scansByCode.getOrDefault(row.getId(), 0L));
            row.setLeads(leadsByCode.getOrDefault(row.getPublicCode(), 0L));
        });
        return page;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long save(TrackingCodeSaveReqVO reqVO) {
        if (!TYPES.contains(reqVO.getCodeType())) {
            throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_FIELDS_INVALID);
        }
        AcquisitionChannelDO channel = channelMapper.selectById(reqVO.getChannelId());
        if (channel == null || !Objects.equals(channel.getStatus(), "active")) {
            throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_CHANNEL_INVALID);
        }
        validateTypeFields(reqVO);

        TrackingCodeDO row;
        if (reqVO.getId() == null) {
            row = new TrackingCodeDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setPublicCode(createPublicCode());
            row.setStatus("active");
        } else {
            row = trackingCodeMapper.selectById(reqVO.getId());
            if (row == null) throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_NOT_FOUND);
            if (!Objects.equals(row.getCodeType(), reqVO.getCodeType())) {
                throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_TYPE_IMMUTABLE);
            }
        }
        row.setName(reqVO.getName().trim());
        row.setChannelId(reqVO.getChannelId());
        row.setEmployeeId("employee".equals(reqVO.getCodeType()) ? reqVO.getEmployeeId() : null);
        row.setStoreName("store".equals(reqVO.getCodeType()) ? reqVO.getStoreName().trim() : null);
        row.setMatchRule("visitor_identification".equals(reqVO.getCodeType()) ? reqVO.getMatchRule() : null);
        row.setWelcomeText(reqVO.getWelcomeText() == null ? "" : reqVO.getWelcomeText().trim());
        row.setLandingUrl(normalizeHttpsUrl(reqVO.getLandingUrl()));
        if (reqVO.getId() == null) {
            row.setCodeType(reqVO.getCodeType());
            trackingCodeMapper.insert(row);
        } else {
            trackingCodeMapper.updateById(row);
        }
        return row.getId();
    }

    @Override
    public boolean setStatus(Long id, String status) {
        if (!List.of("active", "disabled").contains(status)) return false;
        TrackingCodeDO row = trackingCodeMapper.selectById(id);
        if (row == null) return false;
        if ("active".equals(status) && (row.getLandingUrl() == null || row.getLandingUrl().isBlank())) return false;
        row.setStatus(status);
        return trackingCodeMapper.updateById(row) > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Optional<String> registerPublicScanAndGetDestination(String publicCode) {
        List<TrackingCodeDO> matches = TenantUtils.executeIgnore(() -> trackingCodeMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<TrackingCodeDO>()
                        .eq(TrackingCodeDO::getPublicCode, publicCode)
                        .last("FOR UPDATE")));
        if (matches.size() != 1) return Optional.empty();

        TrackingCodeDO code = matches.get(0);
        if (!"active".equals(code.getStatus()) || code.getLandingUrl() == null || code.getLandingUrl().isBlank()) {
            return Optional.empty();
        }
        LocalDate eventDay = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        TenantUtils.executeIgnore(() -> scanDailyMapper.recordScan(
                IdUtil.getSnowflake().nextId(), code.getTenantId(), code.getId(), code.getChannelId(), eventDay,
                ThreadLocalRandom.current().nextInt(16)));
        return Optional.of(withAttribution(code.getLandingUrl(), publicCode, code.getCodeType()));
    }

    private void validateTypeFields(TrackingCodeSaveReqVO reqVO) {
        if ("employee".equals(reqVO.getCodeType())) {
            if (reqVO.getEmployeeId() == null) throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_FIELDS_INVALID);
            adminUserApi.validateUser(reqVO.getEmployeeId());
        } else if ("store".equals(reqVO.getCodeType())) {
            if (reqVO.getStoreName() == null || reqVO.getStoreName().isBlank()) {
                throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_FIELDS_INVALID);
            }
        } else if ("visitor_identification".equals(reqVO.getCodeType())) {
            if (reqVO.getMatchRule() == null || !MATCH_RULES.contains(reqVO.getMatchRule())) {
                throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_FIELDS_INVALID);
            }
            if (!"anonymous_only".equals(reqVO.getMatchRule())) {
                throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_IDENTITY_MATCH_UNAVAILABLE);
            }
        }
    }

    private String createPublicCode() {
        for (int attempt = 0; attempt < 3; attempt++) {
            byte[] bytes = new byte[16];
            SECURE_RANDOM.nextBytes(bytes);
            char[] result = new char[bytes.length * 2];
            for (int i = 0; i < bytes.length; i++) {
                result[i * 2] = HEX[(bytes[i] >>> 4) & 0x0f];
                result[i * 2 + 1] = HEX[bytes[i] & 0x0f];
            }
            String code = new String(result);
            boolean exists = TenantUtils.executeIgnore(() -> !trackingCodeMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<TrackingCodeDO>()
                            .eq(TrackingCodeDO::getPublicCode, code)).isEmpty());
            if (!exists) return code;
        }
        throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_FIELDS_INVALID);
    }

    private String normalizeHttpsUrl(String value) {
        try {
            URI uri = URI.create(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
                throw new IllegalArgumentException("invalid HTTPS URL");
            }
            String asciiUrl = uri.toASCIIString();
            if (asciiUrl.length() > 2048) throw new IllegalArgumentException("URL too long");
            return asciiUrl;
        } catch (RuntimeException exception) {
            throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_LANDING_URL_INVALID);
        }
    }

    private String withAttribution(String landingUrl, String publicCode, String codeType) {
        try {
            return org.springframework.web.util.UriComponentsBuilder.fromUri(URI.create(landingUrl))
                    .replaceQueryParam("utm_source", "callphone")
                    .replaceQueryParam("cp_ref", publicCode)
                    .replaceQueryParam("cp_type", codeType)
                    .build(true).toUriString();
        } catch (RuntimeException exception) {
            throw new ServiceException(ErrorCodeConstants.TRACKING_CODE_LANDING_URL_INVALID);
        }
    }

    private Long number(Map<String, Object> values, String camelCase, String snakeCase) {
        Object value = values.get(camelCase);
        if (value == null) value = values.get(snakeCase);
        if (value instanceof Number number) return number.longValue();
        return null;
    }
}
