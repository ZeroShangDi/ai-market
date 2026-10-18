package cn.iocoder.yudao.module.callphone.controller.update;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class PetResourceControllerTest {
    @TempDir Path root;
    @Test void servesOnlyPublishedFilesAndRejectsEscapes() throws Exception {
        var controller = new PetResourceController(root.toString());
        Path pack = Files.createDirectories(root.resolve("pet-resources/elf-1"));
        Files.writeString(pack.resolve("persona.md"), "角色");
        var response=controller.resource("elf-1", "persona.md");
        assertEquals(200, response.getStatusCode().value());
        assertEquals(6, response.getHeaders().getContentLength());
        assertThrows(ResponseStatusException.class, () -> controller.resource("../elf-1", "persona.md"));
        assertThrows(ResponseStatusException.class, () -> controller.resource("elf-1", "missing.md"));
        Path outside=Files.writeString(root.resolve("outside.md"), "not published");
        Files.createSymbolicLink(pack.resolve("secret.md"), outside);
        assertThrows(ResponseStatusException.class, () -> controller.resource("elf-1", "secret.md"));
    }
}
