package cn.iocoder.yudao.module.callphone.controller.update;

import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.tenant.core.aop.TenantIgnore;
import jakarta.annotation.security.PermitAll;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.nio.file.*;

/** Independent public character data; no executable plugins or business authentication. */
@RestController
@RequestMapping("/api/v1/pet-resources")
@TenantIgnore
@PermitAll
public class PetResourceController {
    private final Path root;
    public PetResourceController(@Value("${app-update.storage-root:./data/app-updates}") String root) { this.root=Path.of(root).resolve("pet-resources").toAbsolutePath().normalize(); }
    @ApiAccessLog(requestEnable=false,responseEnable=false)
    @RequestMapping(value="/catalog.json",method={RequestMethod.GET,RequestMethod.HEAD})
    public ResponseEntity<Resource> catalog() throws IOException { return file(root.resolve("catalog.json")); }
    @ApiAccessLog(requestEnable=false,responseEnable=false)
    @RequestMapping(value="/{pack}/{name}",method={RequestMethod.GET,RequestMethod.HEAD})
    public ResponseEntity<Resource> resource(@PathVariable String pack,@PathVariable String name) throws IOException {
        if(!pack.matches("[a-z][a-z0-9-]{0,39}-[1-9][0-9]{0,8}") || !name.matches("[A-Za-z0-9_-]+\\.(json|mp4|wav|md|txt)")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return file(root.resolve(pack).resolve(name));
    }
    private ResponseEntity<Resource> file(Path path) throws IOException {
        if(!Files.isRegularFile(path) || !path.toRealPath().startsWith(root.toRealPath())) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        String name=path.getFileName().toString();
        String type=name.endsWith(".json")?"application/json":name.endsWith(".mp4")?"video/mp4":name.endsWith(".wav")?"audio/wav":"text/plain;charset=UTF-8";
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).header("X-Content-Type-Options","nosniff").contentType(MediaType.parseMediaType(type)).contentLength(Files.size(path)).body(new FileSystemResource(path));
    }
}
