package dev.portablevoice

import android.Manifest
import android.app.Activity
import android.app.Application
import android.app.Dialog
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import org.json.JSONObject
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.Button

/** Foreground only. The WebRTC page owns capture/playback; dismissal destroys its runtime. */
object VoiceSurface {
    private val main = Handler(Looper.getMainLooper())
    private var dialog: Dialog? = null
    @JvmStatic fun close() { main.post { dialog?.dismiss() } }
    @JvmStatic fun open(activity: Activity?, address: String, callback: (String) -> Unit) {
        main.post {
            if (activity == null || activity.isFinishing || dialog != null) { callback("error"); return@post }
            val uri = Uri.parse(address)
            if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.userInfo != null ||
                activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                callback("error"); return@post
            }
            fun sameOrigin(other: Uri): Boolean = other.scheme == uri.scheme && other.host == uri.host && other.port == uri.port
            val surface = Dialog(activity, android.R.style.Theme_Material_Light_NoActionBar)
            val browser = WebView(activity)
            val layout = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
            val dismiss = Button(activity).apply { text = "关闭语音"; setOnClickListener { surface.dismiss() } }
            layout.addView(dismiss, LinearLayout.LayoutParams(-1, -2))
            layout.addView(browser, LinearLayout.LayoutParams(-1, 0, 1f))
            var released = false
            fun send(event: String) { try { callback(event) } catch (_: Exception) {} }
            val lifecycle = object : Application.ActivityLifecycleCallbacks {
                override fun onActivityPaused(owner: Activity) { if (owner === activity) surface.dismiss() }
                override fun onActivityDestroyed(owner: Activity) { if (owner === activity) surface.dismiss() }
                override fun onActivityCreated(owner: Activity, state: Bundle?) {}
                override fun onActivityStarted(owner: Activity) {}
                override fun onActivityResumed(owner: Activity) {}
                override fun onActivityStopped(owner: Activity) {}
                override fun onActivitySaveInstanceState(owner: Activity, state: Bundle) {}
            }
            surface.setOnDismissListener {
                if (!released) {
                    released = true
                    if (dialog === surface) dialog = null
                    activity.application.unregisterActivityLifecycleCallbacks(lifecycle)
                    browser.removeJavascriptInterface("PortableVoice")
                    browser.stopLoading(); browser.loadUrl("about:blank")
                    browser.onPause(); browser.removeAllViews(); browser.destroy()
                    send("closed")
                }
            }
            try {
                browser.settings.apply {
                    javaScriptEnabled = true; domStorageEnabled = false
                    allowFileAccess = false; allowContentAccess = false
                    mediaPlaybackRequiresUserGesture = false
                    mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    setSupportMultipleWindows(false)
                }
                browser.addJavascriptInterface(object {
                    @JavascriptInterface fun transcript(role: String, text: String) {
                        if (role != "user" && role != "assistant" || text.length > 6000) return
                        main.post { if (!released) send(JSONObject().put("type", "transcript").put("role", role).put("text", text).toString()) }
                    }
                }, "PortableVoice")
                browser.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = !sameOrigin(request.url)
                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                        if (request.isForMainFrame && !released) { send("error"); surface.dismiss() }
                    }
                    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: android.webkit.WebResourceResponse) {
                        if (request.isForMainFrame && response.statusCode >= 400 && !released) { send("error"); surface.dismiss() }
                    }
                    override fun onReceivedSslError(view: WebView, handler: android.webkit.SslErrorHandler, error: android.net.http.SslError) { handler.cancel(); send("error"); surface.dismiss() }
                }
                browser.webChromeClient = object : WebChromeClient() {
                    override fun onPermissionRequest(request: PermissionRequest) {
                        main.post {
                            if (!released && sameOrigin(request.origin) && request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                            else request.deny()
                        }
                    }
                }
                activity.application.registerActivityLifecycleCallbacks(lifecycle)
                surface.setContentView(layout); dialog = surface; surface.show()
                surface.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                browser.loadUrl(address); send("opened")
            } catch (_: Exception) { send("error"); surface.dismiss() }
        }
    }
}
