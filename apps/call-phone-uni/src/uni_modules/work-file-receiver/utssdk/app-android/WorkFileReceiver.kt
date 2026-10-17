package dev.aimarket.workfiles

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Base64
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.File
import java.util.UUID

/** External URI grants only live briefly: copy while this receiving Activity owns the grant. */
object WorkFileInbox {
    private const val LIMIT = 8 * 1024 * 1024
    private val supported = setOf("txt", "md", "json", "pdf", "docx", "pptx", "xlsx", "csv", "tsv")
    private fun directory(context: Context) = File(context.filesDir, "work-file-inbox").apply { mkdirs() }
    private fun validId(id: String) = Regex("[a-f0-9-]{36}").matches(id)
    @Synchronized private fun clean(context: Context) {
        directory(context).listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86400000L }?.forEach { it.delete() }
    }
    @Synchronized fun receive(context: Context, uri: Uri) {
        require(uri.scheme == "content") { "仅支持其他应用提供的文件" }
        clean(context)
        val root = directory(context)
        require((root.listFiles()?.filter { it.extension == "json" }?.size ?: 0) < 20) { "待添加文件过多，请先处理已有文件" }
        var name = ""
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) { val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (column >= 0) name = cursor.getString(column) ?: "" }
        }
        require(name.isNotBlank() && name.length <= 120 && !name.startsWith(".") && !name.any { it == '/' || it == '\\' || it.code < 32 }) { "无法读取文件名称" }
        require(name.substringAfterLast('.', "").lowercase() in supported) { "暂未支持的文件类型，当前仅支持文档和表格" }
        require((root.listFiles()?.sumOf { it.length() } ?: 0L) < 56L * 1024 * 1024) { "待添加文件占用过多，请先处理已有文件" }
        val id = UUID.randomUUID().toString()
        val data = File(root, "$id.bin")
        try {
            val input = context.contentResolver.openInputStream(uri) ?: error("文件无法读取")
            input.use { source -> data.outputStream().use { output ->
                val buffer = ByteArray(8192); var total = 0
                while (true) { val count = source.read(buffer); if (count < 0) break; total += count
                    require(total <= LIMIT) { "文件最多 8 MiB" }; output.write(buffer, 0, count)
                }
            } }
            File(root, "$id.json").writeText(JSONObject().put("id", id).put("name", name).put("size", data.length()).toString())
        } catch (e: Exception) { data.delete(); File(root, "$id.json").delete(); throw e }
    }
    /** Keep mutable byte arrays entirely on the JVM; Native.js copies array arguments. */
    @JvmStatic fun readBytes(source: InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = source.read(buffer)
            if (count < 0) break
            require(output.size() + count <= LIMIT) { "文件最多 8 MiB" }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
    @JvmStatic fun readDocument(context: Context, value: String): String {
        val uri = Uri.parse(value)
        require(uri.scheme == "content") { "文件地址无效" }
        val input = context.contentResolver.openInputStream(uri) ?: error("文件无法读取")
        return input.use { Base64.encodeToString(readBytes(it), Base64.NO_WRAP) }
    }
    @JvmStatic @Synchronized fun pending(context: Context): String {
        clean(context); val result = JSONArray()
        directory(context).listFiles()?.filter { it.extension == "json" }?.sortedBy { it.lastModified() }?.forEach {
            try { result.put(JSONObject(it.readText())) } catch (_: Exception) { it.delete() }
        }
        return result.toString()
    }
    @JvmStatic @Synchronized fun read(context: Context, id: String): String {
        require(validId(id)); clean(context)
        val file = File(directory(context), "$id.bin")
        require(file.isFile && file.length() <= LIMIT)
        return Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
    }
    @JvmStatic @Synchronized fun discard(context: Context, id: String): Boolean {
        if (!validId(id)) return false
        val root = directory(context); File(root, "$id.bin").delete()
        return File(root, "$id.json").delete()
    }
}

class WorkFileReceiverActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) { finish(); return }
        val incoming = intent
        Thread {
            var message: String? = null
            try {
                val uris = mutableListOf<Uri>()
                when (incoming.action) {
                    Intent.ACTION_VIEW -> incoming.data?.let { uris.add(it) }
                    Intent.ACTION_SEND -> (incoming.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { uris.add(it) }
                    Intent.ACTION_SEND_MULTIPLE -> incoming.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
                    else -> error("不支持此打开方式")
                }
                if (uris.isEmpty()) incoming.clipData?.let { clip -> for (i in 0 until minOf(clip.itemCount, 20)) clip.getItemAt(i).uri?.let { uris.add(it) } }
                require(uris.isNotEmpty() && uris.size <= 20) { "未收到可用文件，或一次超过 20 个文件" }
                for (uri in uris.distinct()) WorkFileInbox.receive(applicationContext, uri)
            } catch (e: Exception) {
                val allowed = setOf("仅支持其他应用提供的文件", "待添加文件过多，请先处理已有文件", "无法读取文件名称", "暂未支持的文件类型，当前仅支持文档和表格", "待添加文件占用过多，请先处理已有文件", "文件最多 8 MiB", "未收到可用文件，或一次超过 20 个文件")
                message = e.message?.takeIf { it in allowed } ?: "文件接收失败，请先保存到本机后重试"
            }
            runOnUiThread {
                message?.let { Toast.makeText(this, it, Toast.LENGTH_LONG).show() }
                packageManager.getLaunchIntentForPackage(packageName)?.let {
                    it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    startActivity(it)
                }
                finish()
            }
        }.start()
    }
}
