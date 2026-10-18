package cn.callphone.ai;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class CharacterContextTest {
    @TempDir Path root;
    @Test void publishedDocumentsOnly() throws Exception {
        Path folder=Files.createDirectory(root.resolve("elf-1"));
        Files.writeString(folder.resolve("manifest.json"), "{\"persona\":\"persona.md\",\"skills\":\"skills.md\"}");
        Files.writeString(folder.resolve("persona.md"), "开朗精灵");
        Files.writeString(folder.resolve("skills.md"), "创建任务需确认");
        String text=CharacterContext.load("elf-1", root);
        assertTrue(text.contains("开朗精灵")); assertTrue(text.contains("创建任务需确认"));
        assertThrows(Protocol.Problem.class, () -> CharacterContext.load("../elf-1", root));
        assertThrows(Protocol.Problem.class, () -> CharacterContext.load("whale-1", root));
        Files.delete(folder.resolve("persona.md"));
        Path outside=Files.createTempFile("persona-outside", ".md");
        try {
            Files.createSymbolicLink(folder.resolve("persona.md"), outside);
            assertThrows(Protocol.Problem.class, () -> CharacterContext.load("elf-1", root));
        } finally { Files.deleteIfExists(outside); }
    }
}
