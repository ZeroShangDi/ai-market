package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.MarketingLinkPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.MarketingLinkSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.MarketingLinkDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.AcquisitionChannelMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.MarketingLinkMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import jakarta.annotation.Resource;
import java.net.URI;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.util.UriComponentsBuilder;

@Service
@Validated
public class MarketingLinkServiceImpl implements MarketingLinkService {

    private static final Pattern UTM_SOURCE_PATTERN = Pattern.compile("^[A-Za-z0-9._-]+$");
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    @Resource private MarketingLinkMapper marketingLinkMapper;
    @Resource private AcquisitionChannelMapper channelMapper;
    @Resource private LeadMapper leadMapper;

    @Override
    public PageResult<MarketingLinkDO> getPage(MarketingLinkPageReqVO reqVO) {
        return marketingLinkMapper.selectPage(reqVO);
    }

    @Override
    public Map<String, Long> getLeadCounts(List<String> publicCodes, Long ownerUserId) {
        List<String> codes = publicCodes.stream().filter(Objects::nonNull).filter(code -> !code.isBlank()).distinct().toList();
        if (codes.isEmpty() || ownerUserId == null) return Map.of();
        Map<String, Long> counts = new HashMap<>();
        for (Map<String, Object> row : leadMapper.selectAttributionCounts(codes, ownerUserId)) {
            Object sourceCode = row.get("sourceCode");
            Object count = row.get("leadCount");
            if (sourceCode != null && count instanceof Number number) {
                counts.put(sourceCode.toString(), number.longValue());
            }
        }
        return counts;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long save(MarketingLinkSaveReqVO reqVO) {
        String destinationUrl = normalizeHttpsUrl(reqVO.getDestinationUrl());
        if (!UTM_SOURCE_PATTERN.matcher(reqVO.getUtmSource()).matches()) {
            throw new ServiceException(ErrorCodeConstants.ACQUISITION_LINK_UTM_INVALID);
        }
        AcquisitionChannelDO channel = channelMapper.selectById(reqVO.getChannelId());
        if (channel == null || !Objects.equals(channel.getStatus(), "active")) {
            throw new ServiceException(ErrorCodeConstants.ACQUISITION_LINK_CHANNEL_INVALID);
        }

        MarketingLinkDO row;
        if (reqVO.getId() == null) {
            row = new MarketingLinkDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setPublicCode(generatePublicCode());
            row.setClickCount(0L);
            row.setStatus("active");
        } else {
            row = marketingLinkMapper.selectById(reqVO.getId());
            if (row == null) throw new ServiceException(ErrorCodeConstants.ACQUISITION_LINK_NOT_FOUND);
        }
        row.setName(reqVO.getName().trim());
        row.setDestinationUrl(destinationUrl);
        row.setChannelId(reqVO.getChannelId());
        row.setUtmSource(reqVO.getUtmSource().trim());
        if (reqVO.getId() == null) {
            marketingLinkMapper.insert(row);
        } else {
            marketingLinkMapper.updateById(row);
        }
        return row.getId();
    }

    @Override
    public boolean setStatus(Long id, String status) {
        if (!List.of("active", "disabled").contains(status)) return false;
        MarketingLinkDO row = marketingLinkMapper.selectById(id);
        if (row == null) return false;
        row.setStatus(status);
        return marketingLinkMapper.updateById(row) > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Optional<String> registerClickAndGetDestination(String publicCode) {
        MarketingLinkDO row = TenantUtils.executeIgnore(() -> marketingLinkMapper.selectByPublicCode(publicCode));
        if (row == null || !"active".equals(row.getStatus())) return Optional.empty();

        URI destination = URI.create(row.getDestinationUrl());
        String target = UriComponentsBuilder.fromUri(destination)
                .replaceQueryParam("utm_source", row.getUtmSource())
                .replaceQueryParam("cp_ref", row.getPublicCode())
                .build(true).toUriString();
        int updated = TenantUtils.executeIgnore(() -> marketingLinkMapper.incrementClicks(publicCode, LocalDateTime.now()));
        return updated == 1 ? Optional.of(target) : Optional.empty();
    }

    private String generatePublicCode() {
        byte[] bytes = new byte[16];
        SECURE_RANDOM.nextBytes(bytes);
        char[] result = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            result[i * 2] = HEX[(bytes[i] >>> 4) & 0x0f];
            result[i * 2 + 1] = HEX[bytes[i] & 0x0f];
        }
        return new String(result);
    }

    private String normalizeHttpsUrl(String value) {
        try {
            URI uri = URI.create(value.trim());
            if (!"https".equals(uri.getScheme().toLowerCase(Locale.ROOT)) || uri.getHost() == null || uri.getUserInfo() != null) {
                throw new IllegalArgumentException("invalid URL");
            }
            return uri.toASCIIString();
        } catch (RuntimeException exception) {
            throw new ServiceException(ErrorCodeConstants.ACQUISITION_LINK_URL_INVALID);
        }
    }
}
