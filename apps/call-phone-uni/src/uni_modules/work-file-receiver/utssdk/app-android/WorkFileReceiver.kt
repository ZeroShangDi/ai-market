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


/** Read-only, temporary grants expose only explicit outbound copies, never arbitrary app files. */
class WorkFileShareProvider : android.content.ContentProvider() {
    override fun onCreate() = true
    private fun file(uri: Uri): File {
        val root = File(requireNotNull(context).cacheDir, "work-file-share").canonicalFile
        val parts = uri.pathSegments
        require(parts.size == 2 && Regex("[a-f0-9-]{36}").matches(parts[0]))
        val target = File(File(root, parts[0]), parts[1]).canonicalFile
        require(target.path.startsWith(root.path + File.separator) && target.isFile)
        return target
    }
    override fun getType(uri: Uri): String = android.webkit.MimeTypeMap.getSingleton()
        .getMimeTypeFromExtension(file(uri).extension.lowercase()) ?: "application/octet-stream"
    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): android.database.Cursor {
        val target = file(uri)
        val columns = (projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE))
            .filter { it == OpenableColumns.DISPLAY_NAME || it == OpenableColumns.SIZE }.toTypedArray()
        return android.database.MatrixCursor(columns).apply {
            addRow(columns.map { if (it == OpenableColumns.DISPLAY_NAME) target.name else target.length() }.toTypedArray())
        }
    }
    override fun openFile(uri: Uri, mode: String): android.os.ParcelFileDescriptor {
        require(mode == "r")
        return android.os.ParcelFileDescriptor.open(file(uri), android.os.ParcelFileDescriptor.MODE_READ_ONLY)
    }
    override fun insert(uri: Uri, values: android.content.ContentValues?): Uri? = throw UnsupportedOperationException()
    override fun update(uri: Uri, values: android.content.ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()
}

object WorkFileShare {
    @JvmStatic fun launch(activity: Activity, path: String, name: String, callback: (String) -> Unit) {
        activity.runOnUiThread {
            val error = try { share(activity, path, name); "" } catch (_: Exception) { "无法打开文件分享，请检查文件和接收应用后重试" }
            callback(error)
        }
    }
    @JvmStatic fun launchText(activity: Activity, name: String, content: String, callback: (String) -> Unit) {
        activity.runOnUiThread {
            val error = try { shareText(activity, name, content); "" } catch (_: Exception) { "日志分享失败，请重试" }
            callback(error)
        }
    }
    @JvmStatic fun shareText(activity: Activity, name: String, content: String) {
        require(content.length <= 8 * 1024 * 1024) { "日志文件过大" }
        val temporary = File.createTempFile("diagnostic-", ".txt", activity.cacheDir)
        try { temporary.writeText(content, Charsets.UTF_8); share(activity, temporary.path, name) }
        finally { temporary.delete() }
    }
    @JvmStatic fun share(activity: Activity, path: String, name: String) {
        val source = (if (path.startsWith("file://")) File(requireNotNull(Uri.parse(path).path)) else File(path)).canonicalFile
        val roots = listOf(File(activity.applicationInfo.dataDir)) + activity.getExternalFilesDirs(null).filterNotNull()
        require(source.isFile && roots.any { source.path.startsWith(it.canonicalPath + File.separator) }) { "本地文件不可用，请重新下载" }
        val root = File(activity.cacheDir, "work-file-share").apply { mkdirs() }
        root.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86400000L }?.forEach { it.deleteRecursively() }
        val folder = File(root, UUID.randomUUID().toString()).apply { mkdirs() }
        val safeName = name.map { if (it == '/' || it == '\\' || it.code < 32) '_' else it }.joinToString("").takeLast(120).ifBlank { "文件" }
        require(safeName != "." && safeName != "..") { "文件名无效" }
        val target = File(folder, safeName)
        try {
            source.copyTo(target)
            val uri = Uri.Builder().scheme("content").authority(activity.packageName + ".workfiles.share")
                .appendPath(folder.name).appendPath(target.name).build()
            val mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(target.extension.lowercase()) ?: "application/octet-stream"
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = android.content.ClipData.newRawUri(target.name, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(intent, "分享文件"))
        } catch (e: Exception) { folder.deleteRecursively(); throw e }
    }
}
