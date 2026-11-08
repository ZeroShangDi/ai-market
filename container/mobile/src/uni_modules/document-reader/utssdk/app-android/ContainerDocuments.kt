package dev.container.documents
import android.content.Context
import android.net.Uri
import android.util.Base64
import java.io.InputStream
import java.io.ByteArrayOutputStream
/** Extracted from the existing WorkFileInbox document reader. No data is persisted. */
object ContainerDocuments {
    private const val LIMIT = 8 * 1024 * 1024
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
}
