package dev.portablepet.overlay

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Data-only packages. Staging and digest checks precede the atomic activation pointer. */
object PetPackages {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private fun id(value: String): String { require(value.matches(Regex("[a-z][a-z0-9-]{0,39}"))); return value }
    private fun root(context: Context) = File(context.filesDir, "pet-packages").apply { mkdirs() }
    private fun state(context: Context): JSONObject {
        val base = root(context)
        val active = context.getSharedPreferences("pet-packages", 0).getString("active", "") ?: ""
        val installed = JSONArray()
        base.listFiles()?.filter { it.isDirectory && !it.name.startsWith('.') }?.forEach { dir ->
            try { installed.put(JSONObject(File(dir,"manifest.json").readText()).put("directory", dir.absolutePath)) } catch (_: Exception) {}
        }
        return JSONObject().put("active", active).put("installed", installed)
    }
    private fun fetch(url: URL, target: File, limit: Long): Pair<Long,String> {
        require(url.protocol in listOf("http","https") && url.userInfo == null)
        val connection = url.openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false; connection.connectTimeout = 15000; connection.readTimeout = 30000
        var count = 0L; val hash = MessageDigest.getInstance("SHA-256")
        try {
            require(connection.responseCode == 200) { "DOWNLOAD_FAILED" }
            connection.inputStream.use { input -> target.outputStream().use { output ->
                val buffer = ByteArray(65536)
                while (true) { val size = input.read(buffer); if (size < 0) break
                    count += size; require(count <= limit) { "PACKAGE_TOO_LARGE" }; hash.update(buffer,0,size); output.write(buffer,0,size)
                }
            } }
        } finally { connection.disconnect() }
        return Pair(count, hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) })
    }
    @JvmStatic fun execute(context: Context, command: String, payload: String, callback: (String) -> Unit) {
        worker.execute {
            var staging: File? = null
            try {
                val data = JSONObject(payload); val base = root(context)
                when (command) {
                    "packageInstall" -> {
                        val key = id(data.getString("id")); val version = data.getInt("version"); require(version > 0)
                        val directory = "$key-$version"; val target = File(base,directory)
                        if (!target.isDirectory) {
                            val stage = File(base,".$directory-staging"); staging = stage; stage.deleteRecursively(); stage.mkdirs()
                            val origin = URL(data.getString("baseUrl").trimEnd('/') + "/")
                            val file = File(stage,"manifest.json")
                            val digest = fetch(URL(origin,"$directory/manifest.json"),file,256000)
                            require(digest.second == data.getString("sha256")) { "MANIFEST_CHECKSUM" }
                            val manifest = JSONObject(file.readText()); require(manifest.getString("id") == key && manifest.getInt("version") == version)
                            require(manifest.getString("format") == "rgb-alpha-sbs-v1")
                            val files = manifest.getJSONArray("files"); require(files.length() in 1..400)
                            var total = 0L; val names = mutableSetOf<String>()
                            for (i in 0 until files.length()) {
                                val entry = files.getJSONObject(i); val name = entry.getString("name")
                                require(name.matches(Regex("[a-zA-Z0-9_-]+\\.(mp4|wav|json|md|txt)")) && name != "manifest.json" && names.add(name))
                                val size = entry.getLong("bytes"); require(size in 1..100_000_000)
                                total += size; require(total <= 300_000_000)
                                val result = fetch(URL(origin,"$directory/$name"),File(stage,name),size)
                                require(result.first == size && result.second == entry.getString("sha256")) { "FILE_CHECKSUM" }
                            }
                            val actions = manifest.getJSONArray("actions"); require(actions.length() in 1..200)
                            val ids = mutableSetOf<String>()
                            for (i in 0 until actions.length()) {
                                val action = actions.getJSONObject(i); val actionId = id(action.getString("id"))
                                require(ids.add(actionId) && names.contains(action.getString("file")) && action.getString("file").endsWith(".mp4"))
                                val b = action.getJSONArray("bounds"); require(b.length() == 4)
                                require(b.getInt(0) >= 0 && b.getInt(1) >= 0 && b.getInt(2) > 0 && b.getInt(3) > 0 && b.getInt(0)+b.getInt(2)<=640 && b.getInt(1)+b.getInt(3)<=640)
                            }
                            require(ids.contains("idle"))
                            require(names.contains(manifest.getString("persona")) && names.contains(manifest.getString("skills")))
                            require(stage.renameTo(target)) { "INSTALL_FAILED" }; staging = null
                        }
                        require(context.getSharedPreferences("pet-packages",0).edit().putString("active",directory).commit())
                    }
                    "packageActivate" -> {
                        val directory = id(data.getString("id"))+"-"+data.getInt("version")
                        require(File(base,"$directory/manifest.json").isFile)
                        require(context.getSharedPreferences("pet-packages",0).edit().putString("active",directory).commit())
                    }
                    "packageDelete" -> {
                        val directory = id(data.getString("id"))+"-"+data.getInt("version")
                        val prefs = context.getSharedPreferences("pet-packages",0)
                        if (prefs.getString("active","") == directory) require(prefs.edit().remove("active").commit())
                        require(!File(base,directory).exists() || File(base,directory).deleteRecursively())
                    }
                    "packageState" -> {}
                    else -> error("INVALID_COMMAND")
                }
                val result = state(context).put("ok",true).toString(); main.post { callback(result) }
            } catch (_: Exception) {
                staging?.deleteRecursively()
                main.post { callback(JSONObject().put("ok",false).put("message","资源操作失败，请检查网络与剩余空间后重试").toString()) }
            }
        }
    }
}
