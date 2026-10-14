package cn.iocoder.yudao.module.callphone.controller.update;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AppUpdateControllerTest {
    @TempDir Path root;
    MockMvc mvc;
    String apk = "106-" + "a".repeat(64) + ".apk";
    @BeforeEach void setup() throws Exception {
        mvc = MockMvcBuilders.standaloneSetup(new AppUpdateController(root.toString())).build();
        Path feed = root.resolve("uni.UNID608100/android/arm64-v8a/stable");
        Files.createDirectories(feed); Files.writeString(feed.resolve("manifest.json"), "{\"payload\":\"signed-text\",\"signature\":\"signature\"}");
        Path dir = root.resolve("uni.UNID608100/apk"); Files.createDirectories(dir);
        Files.write(dir.resolve(apk), new byte[]{0,1,2,3,4,5,6,7,8,9});
    }
    @Test void anonymousManifestIsRawAndNeverCached() throws Exception {
        mvc.perform(get("/api/v1/app-updates/uni.UNID608100/android/arm64-v8a/stable/manifest.json"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-cache"))
            .andExpect(jsonPath("$.payload").value("signed-text")).andExpect(jsonPath("$.code").doesNotExist());
    }
    @Test void streamsApkHeadAndRanges() throws Exception {
        String url = "/api/v1/app-updates/uni.UNID608100/apk/" + apk;
        mvc.perform(get(url)).andExpect(status().isOk()).andExpect(header().longValue("Content-Length",10))
            .andExpect(content().bytes(new byte[]{0,1,2,3,4,5,6,7,8,9}));
        mvc.perform(head(url)).andExpect(status().isOk()).andExpect(header().longValue("Content-Length",10));
        mvc.perform(get(url).header("Range","bytes=2-5")).andExpect(status().isPartialContent())
            .andExpect(header().string("Content-Range","bytes 2-5/10")).andExpect(content().bytes(new byte[]{2,3,4,5}));
    }
    @Test void missingMalformedAndEscapingSymlinksAreNotReadable() throws Exception {
        mvc.perform(get("/api/v1/app-updates/uni.UNID608100/android/arm64-v8a/missing/manifest.json")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/app-updates/uni.UNID608100/apk/private.pem")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/app-updates/a..b/android/arm64-v8a/stable/manifest.json")).andExpect(status().isNotFound());
        Path outside = Files.createTempFile("app-update-outside", ".apk");
        try {
            Path file=root.resolve("uni.UNID608100/apk/"+apk); Files.delete(file); Files.createSymbolicLink(file,outside);
            mvc.perform(get("/api/v1/app-updates/uni.UNID608100/apk/"+apk)).andExpect(status().isNotFound());
        } finally { Files.deleteIfExists(outside); }
    }
}
