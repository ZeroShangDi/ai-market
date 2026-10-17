package dev.portablepet.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream

/** Local-only packed RGB/alpha video player; no remote page or network access. */
@SuppressLint("SetJavaScriptEnabled")
class PetVideoView(context: Context, options: JSONObject,
    private val notify: (String, String, Long, String) -> Unit) : WebView(context) {
    private val main = Handler(Looper.getMainLooper())
    private var disposed = false
    private val manifest = options.getJSONArray("actions")
    private val sources = mutableMapOf<String, JSONObject>()
    private var booted = false
    private var queued: Pair<String, Long>? = null

    init {
        sources["/player"] = JSONObject().put("videoPath", options.getString("playerPath"))
            .put("assetPath", options.getString("playerAssetPath"))
        for (i in 0 until manifest.length()) {
            val action = manifest.getJSONObject(i)
            sources["/clip/" + action.getString("id")] = action
        }
        for (source in sources.values) {
            val path = source.getString("videoPath")
            val asset = source.getString("assetPath")
            require(path.startsWith('/') && !path.split('/').contains("..")) { "INVALID_VIDEO_PATH" }
            require(asset.isNotEmpty() && !asset.startsWith('/') && !asset.split('/').contains("..")) { "INVALID_VIDEO_ASSET" }
        }
        setBackgroundColor(Color.TRANSPARENT)
        isFocusable = false; isClickable = false; isLongClickable = false
        settings.javaScriptEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = false; settings.allowContentAccess = false
        settings.blockNetworkLoads = true
        settings.domStorageEnabled = false
        settings.setSupportZoom(false)
        addJavascriptInterface(object {
            @JavascriptInterface fun signal(type: String, id: String, token: Long, code: String) {
                main.post {
                    if (!disposed) {
                        if (type == "boot") {
                            booted = true
                            queued?.let { play(it.first, it.second) }; queued = null
                        } else notify(type, id, token, code)
                    }
                }
            }
        }, "PetHost")
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                return response(request)
            }
            override fun onPageFinished(view: WebView, url: String) {
                if (!disposed && url == "https://pet.invalid/player") {
                    evaluateJavascript("window.petPlayer && window.petPlayer.configure(" + manifest.toString() + ")", null)
                }
            }
        }
        loadUrl("https://pet.invalid/player")
    }

    private fun response(request: WebResourceRequest): WebResourceResponse {
        fun empty(status: Int, message: String) = WebResourceResponse("text/plain", "UTF-8", status, message,
            mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(ByteArray(0)))
        val uri = request.url
        if (disposed || uri.scheme != "https" || uri.host != "pet.invalid" || request.method != "GET") return empty(403, "Forbidden")
        val source = sources[uri.path] ?: return empty(404, "Not Found")
        return try {
            val file = File(source.getString("videoPath"))
            val asset = source.getString("assetPath")
            val local = file.isFile
            val length = if (local) file.length() else context.assets.open(asset).use { it.available().toLong() }
            var start = 0L; var end = length - 1
            val range = request.requestHeaders.entries.firstOrNull { it.key.equals("Range", true) }?.value
            if (range != null) {
                val match = Regex("bytes=(\\d+)-(\\d*)").matchEntire(range) ?: return empty(416, "Range Not Satisfiable")
                start = match.groupValues[1].toLong()
                if (match.groupValues[2].isNotEmpty()) end = minOf(end, match.groupValues[2].toLong())
                if (start > end || start < 0) return empty(416, "Range Not Satisfiable")
            }
            val stream = if (local) file.inputStream() else context.assets.open(asset)
            try {
                var skipped = 0L
                while (skipped < start) {
                    val count = stream.skip(start - skipped)
                    if (count <= 0) throw IllegalStateException("VIDEO_SEEK_FAILED")
                    skipped += count
                }
            } catch (error: Exception) { stream.close(); throw error }
            val count = end - start + 1
            val headers = mutableMapOf("Accept-Ranges" to "bytes", "Content-Length" to count.toString(), "Cache-Control" to "no-store")
            if (range != null) headers["Content-Range"] = "bytes $start-$end/$length"
            WebResourceResponse(if (uri.path == "/player") "text/html" else "video/mp4", if (uri.path == "/player") "UTF-8" else null,
                if (range == null) 200 else 206, if (range == null) "OK" else "Partial Content", headers,
                LimitedStream(stream, count))
        } catch (_: Exception) { empty(404, "Not Found") }
    }

    fun play(id: String, token: Long) {
        if (disposed) return
        if (!booted) { queued = Pair(id, token); return }
        evaluateJavascript("window.petPlayer.play(" + JSONObject.quote(id) + "," + token + ")", null)
    }

    // The native parent / EasyFloat owns all taps, holds and dragging.
    override fun onTouchEvent(event: MotionEvent): Boolean = false

    fun release() {
        if (disposed) return
        disposed = true; queued = null
        evaluateJavascript("window.petPlayer && window.petPlayer.dispose()", null)
        stopLoading(); removeJavascriptInterface("PetHost"); onPause()
        removeAllViews(); destroy()
    }

    private class LimitedStream(private val source: InputStream, private var remaining: Long) : InputStream() {
        override fun read(): Int {
            if (remaining <= 0) return -1
            val value = source.read(); if (value >= 0) remaining--
            return value
        }
        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            if (remaining <= 0) return -1
            val count = source.read(buffer, offset, minOf(length.toLong(), remaining).toInt())
            if (count > 0) remaining -= count
            return count
        }
        override fun close() = source.close()
    }
}

/** EasyFloat 2.0.4 does not expose window flags; enable GPU rendering BEFORE addView.
 * Adding FLAG_HARDWARE_ACCELERATED after attachment cannot enable a software ViewRoot.
 */
internal class VideoOverlayContext(base: Context) : ContextWrapper(base) {
    private val manager = base.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val accelerated = object : WindowManager by manager {
        override fun addView(view: View, params: ViewGroup.LayoutParams) {
            (params as? WindowManager.LayoutParams)?.let {
                it.flags = it.flags or WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
            }
            manager.addView(view, params)
        }
    }
    override fun getSystemService(name: String): Any? =
        if (name == Context.WINDOW_SERVICE) accelerated else super.getSystemService(name)
}
