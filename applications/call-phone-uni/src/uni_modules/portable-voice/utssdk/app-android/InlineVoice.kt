package dev.portablevoice

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup

/** Reuses the existing audio browser while the host page owns visible call controls. */
object InlineVoice {
    private val main = Handler(Looper.getMainLooper())
    private var release: (() -> Unit)? = null
    val running: Boolean get() = release != null
    fun close() { main.post { release?.invoke() } }
    fun open(activity: Activity?, address: String, callback: (String) -> Unit) {
        main.post {
            if (activity == null || activity.isFinishing || running || VoiceSurface.hasAppSurface || VoiceDesktopService.running) {
                callback("error"); return@post
            }
            var browser: VoiceBrowser? = null
            var released = false
            fun send(event: String) { try { callback(event) } catch (_: Exception) {} }
            val lifecycle = object : Application.ActivityLifecycleCallbacks {
                override fun onActivityPaused(owner: Activity) { if (owner === activity) close() }
                override fun onActivityDestroyed(owner: Activity) { if (owner === activity) close() }
                override fun onActivityCreated(owner: Activity, state: Bundle?) {}
                override fun onActivityStarted(owner: Activity) {}
                override fun onActivityResumed(owner: Activity) {}
                override fun onActivityStopped(owner: Activity) {}
                override fun onActivitySaveInstanceState(owner: Activity, state: Bundle) {}
            }
            release = {
                if (!released) {
                    released = true; release = null
                    activity.application.unregisterActivityLifecycleCallbacks(lifecycle)
                    browser?.view?.let { (it.parent as? ViewGroup)?.removeView(it) }
                    browser?.close(); send("closed")
                }
            }
            try {
                activity.application.registerActivityLifecycleCallbacks(lifecycle)
                // The existing desktop query mode starts the same browser audio engine automatically.
                browser = VoiceBrowser(activity, address, true) { event ->
                    if (event == "error" || event == "closed") { if (event == "error") send(event); close() }
                    else send(event)
                }
                activity.addContentView(browser!!.view, ViewGroup.LayoutParams(1, 1))
            } catch (_: Exception) { send("error"); release?.invoke() }
        }
    }
}
