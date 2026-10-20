package dev.portablevoice

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.*
import org.json.JSONObject

/** One browser session for either the App surface or the foreground desktop service. */
class VoiceBrowser(context: Context, address: String, desktop: Boolean, private val emit: (String) -> Unit) {
    val view = WebView(context)
    private val main = Handler(Looper.getMainLooper())
    private var released = false
    private val origin = Uri.parse(address)
    private fun allowed(uri: Uri) = uri.scheme == "https" && uri.host == origin.host && uri.port == origin.port && uri.userInfo == null
    init {
        require(origin.scheme == "https" && !origin.host.isNullOrBlank() && origin.userInfo == null)
        view.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = false
            allowFileAccess = false; allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
        }
        view.addJavascriptInterface(object {
            @JavascriptInterface fun transcript(role: String, text: String) {
                if (role !in listOf("user", "assistant") || text.length > 6000) return
                main.post { if (!released) emit(JSONObject().put("type", "transcript").put("role", role).put("text", text).toString()) }
            }
            @JavascriptInterface fun capabilities(): String = "plugin-host-v1"
            @JavascriptInterface fun task(payload: String) {
                if (payload.length > 10000) return
                main.post { if (!released) emit(payload) }
            }
            @JavascriptInterface fun activity(value: String) {
                if (value !in listOf("listening", "thinking", "speaking", "working")) return
                main.post { if (!released) emit(JSONObject().put("type", "activity").put("state", value).toString()) }
            }
            @JavascriptInterface fun state(value: String) {
                if (value !in listOf("connected", "closed", "error")) return
                main.post { if (!released) emit(value) }
            }
        }, "PortableVoice")
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest) = !allowed(request.url)
            override fun onReceivedError(v: WebView, request: WebResourceRequest, error: WebResourceError) { if (request.isForMainFrame && !released) emit("error") }
            override fun onReceivedHttpError(v: WebView, request: WebResourceRequest, response: WebResourceResponse) { if (request.isForMainFrame && response.statusCode >= 400 && !released) emit("error") }
            override fun onReceivedSslError(v: WebView, handler: SslErrorHandler, error: android.net.http.SslError) { handler.cancel(); if (!released) emit("error") }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                main.post {
                    if (!released && allowed(request.origin) && request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    else request.deny()
                }
            }
        }
        val url = origin.buildUpon().apply { if (desktop) appendQueryParameter("desktop", "1") }.build().toString()
        view.loadUrl(url)
    }
    fun deliver(payload: String) {
        if (!released && payload.length <= 10000) view.evaluateJavascript("window.portableHost && window.portableHost(" + JSONObject.quote(payload) + ")", null)
    }
    fun close() {
        if (released) return
        released = true
        view.removeJavascriptInterface("PortableVoice")
        view.stopLoading(); view.loadUrl("about:blank"); view.onPause(); view.removeAllViews(); view.destroy()
    }
}
