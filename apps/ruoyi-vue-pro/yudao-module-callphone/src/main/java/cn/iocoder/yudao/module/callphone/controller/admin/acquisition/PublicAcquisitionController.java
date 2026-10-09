package cn.iocoder.yudao.module.callphone.controller.admin.acquisition;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.ratelimiter.core.annotation.RateLimiter;
import cn.iocoder.yudao.framework.ratelimiter.core.keyresolver.impl.ClientIpRateLimiterKeyResolver;
import cn.iocoder.yudao.module.callphone.service.acquisition.MarketingLinkService;
import cn.iocoder.yudao.module.callphone.service.acquisition.TrackingCodeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.annotation.security.PermitAll;
import jakarta.validation.constraints.Pattern;
import java.util.concurrent.TimeUnit;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Call Phone public acquisition")
@RestController
@RequestMapping("/callphone/public")
@Validated
public class PublicAcquisitionController {

    @Resource
    private MarketingLinkService marketingLinkService;
    @Resource
    private TrackingCodeService trackingCodeService;

    @GetMapping("/acquisition-link/{code}")
    @PermitAll
    @ApiAccessLog(enable = false)
    @RateLimiter(time = 1, timeUnit = TimeUnit.MINUTES, count = 60,
            keyResolver = ClientIpRateLimiterKeyResolver.class)
    @Operation(summary = "Redirect through an enabled, anonymous acquisition link")
    public ResponseEntity<Void> redirect(
            @PathVariable("code") @Pattern(regexp = "^[a-f0-9]{32}$") String code) {
        return marketingLinkService.registerClickAndGetDestination(code)
                .map(destination -> ResponseEntity.status(HttpStatus.FOUND)
                        .header(HttpHeaders.LOCATION, destination).<Void>build())
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/tracking-code/{code}")
    @PermitAll
    @ApiAccessLog(enable = false)
    @RateLimiter(time = 1, timeUnit = TimeUnit.MINUTES, count = 60,
            keyResolver = ClientIpRateLimiterKeyResolver.class)
    @Operation(summary = "Count an anonymous active tracking-code visit and redirect to its HTTPS landing page")
    public ResponseEntity<Void> scanTrackingCode(
            @PathVariable("code") @Pattern(regexp = "^[a-f0-9]{16,32}$") String code) {
        return trackingCodeService.registerPublicScanAndGetDestination(code)
                .map(destination -> ResponseEntity.status(HttpStatus.FOUND)
                        .header(HttpHeaders.LOCATION, destination)
                        .header(HttpHeaders.CACHE_CONTROL, "no-store")
                        .<Void>build())
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
