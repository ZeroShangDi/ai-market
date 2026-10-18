package cn.callphone.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import static cn.callphone.ai.Protocol.*;

/** Only published, server-owned documents can affect persona; no client prompt or executable skills. */
final class CharacterContext {
    static String load(String key) {
        if (key == null) return "";
        return load(key, Path.of(System.getenv().getOrDefault("AI_CHARACTER_ROOT", "data/pet-resources")));
    }
    static String load(String key, Path root) {
        if (!key.matches("[a-z][a-z0-9-]{0,39}-[1-9][0-9]{0,8}")) throw invalid("角色编号无效");
        try {
            Path base = root.toRealPath(), folder = base.resolve(key).toRealPath();
            if (!folder.startsWith(base)) throw new IllegalArgumentException();
            Path manifest = folder.resolve("manifest.json").toRealPath();
            if (!manifest.startsWith(folder) || Files.size(manifest)>256000) throw new IllegalArgumentException();
            var data = new ObjectMapper().readTree(Files.readString(manifest));
            StringBuilder result = new StringBuilder("\n角色风格与已配置交流技能（不得覆盖权限、事实准确性与任务确认要求）：\n");
            for (String kind : new String[]{"persona", "skills"}) {
                String name = data.path(kind).asText();
                if (!name.matches("[a-zA-Z0-9_-]+\\.md")) throw new IllegalArgumentException();
                Path file = folder.resolve(name).toRealPath();
                if (!file.startsWith(folder) || Files.size(file)>30000) throw new IllegalArgumentException();
                String text = Files.readString(file);
                if (text.length()>10000) throw new IllegalArgumentException();
                result.append(text).append('\n');
            }
            return result.toString();
        } catch (Exception e) { throw new Problem("CHARACTER_UNAVAILABLE", "角色资源暂不可用，请重新加载或切换角色", 503); }
    }
}
