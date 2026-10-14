package cn.iocoder.yudao.module.callphone.controller.update;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.tenant.core.aop.TenantIgnore;
import jakarta.annotation.security.PermitAll;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/** Public file-backed release transport. No business identity, tenant, or database dependency. */
@RestController
@RequestMapping("/api/v1/app-updates")
@TenantIgnore
public class AppUpdateController {
    private final Path root;
    public AppUpdateController(@Value("${app-update.storage-root:./data/app-updates}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    @RequestMapping(value = "/{packageName}/android/{architecture}/{channel}/manifest.json", method = {RequestMethod.GET, RequestMethod.HEAD})
    @PermitAll
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<Resource> manifest(@PathVariable String packageName, @PathVariable String architecture,
                                             @PathVariable String channel) throws IOException {
        component(packageName, "[A-Za-z0-9_][A-Za-z0-9_.]{0,127}");
        component(architecture, "[a-z0-9][a-z0-9-]{0,31}");
        component(channel, "[a-z0-9][a-z0-9-]{0,31}");
        Path file = resolve(packageName, "android", architecture, channel, "manifest.json");
        if (Files.size(file) > 150000) throw new ResponseStatusException(NOT_FOUND);
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).contentType(MediaType.APPLICATION_JSON)
                .contentLength(Files.size(file)).body(new FileSystemResource(file));
    }

    @RequestMapping(value = "/{packageName}/apk/{filename}", method = {RequestMethod.GET, RequestMethod.HEAD})
    @PermitAll
    @ApiAccessLog(requestEnable = false, responseEnable = false)
    public ResponseEntity<Resource> apk(@PathVariable String packageName, @PathVariable String filename) throws IOException {
        component(packageName, "[A-Za-z0-9_][A-Za-z0-9_.]{0,127}");
        component(filename, "[1-9][0-9]{0,9}-[a-f0-9]{64}\\.apk");
        Path file = resolve(packageName, "apk", filename);
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable())
                .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType("application/vnd.android.package-archive"))
                .contentLength(Files.size(file)).body(new FileSystemResource(file));
    }

    private static void component(String value, String pattern) {
        if (value == null || !value.matches(pattern) || value.contains("..")) throw new ResponseStatusException(NOT_FOUND);
    }
    private Path resolve(String... parts) throws IOException {
        try {
            Path base = root.toRealPath();
            Path file = base;
            for (String part : parts) file = file.resolve(part);
            file = file.toRealPath();
            if (!file.startsWith(base) || !Files.isRegularFile(file)) throw new ResponseStatusException(NOT_FOUND);
            return file;
        } catch (java.nio.file.NoSuchFileException e) { throw new ResponseStatusException(NOT_FOUND); }
    }
}
