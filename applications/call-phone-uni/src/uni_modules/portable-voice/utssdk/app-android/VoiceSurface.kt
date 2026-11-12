package dev.portablevoice

import android.app.Activity
import android.app.Application
import android.app.Dialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.LinearLayout
import android.widget.Button

object VoiceSurface {
    private val main = Handler(Looper.getMainLooper())
    private var dialog: Dialog? = null
    private var appBrowser: VoiceBrowser? = null
    @JvmStatic fun deliver(payload: String) { main.post { (VoiceDesktopService.instance?.let { it.deliver(payload); true } ?: false).let { if (!it) appBrowser?.deliver(payload) } } }
    private var desktopContext: android.content.Context? = null
    private var desktopCallback: ((String) -> Unit)? = null
    internal var pendingAddress: String? = null
    internal fun send(value: String) { try { desktopCallback?.invoke(value) } catch (_: Exception) {} }
    @JvmStatic fun close() { main.post {
        pendingAddress = null
        VoiceTasks.dismiss()
        dialog?.dismiss()
        desktopContext?.stopService(Intent(desktopContext, VoiceDesktopService::class.java))
    } }
    @JvmStatic fun openDesktop(activity: Activity?, address: String, callback: (String) -> Unit) {
        main.post {
            if (activity == null || pendingAddress != null || VoiceDesktopService.running || dialog != null) { callback("error"); return@post }
            desktopContext = activity.applicationContext; desktopCallback = callback; pendingAddress = address
            try {
                activity.applicationContext.startActivity(Intent(activity, VoiceStartActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) { pendingAddress = null; send("error") }
        }
    }
    @JvmStatic fun open(activity: Activity?, address: String, callback: (String) -> Unit) {
        main.post {
            if (activity == null || activity.isFinishing || dialog != null || VoiceDesktopService.running) { callback("error"); return@post }
            val surface = Dialog(activity, android.R.style.Theme_Material_Light_NoActionBar)
            var browser: VoiceBrowser? = null
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
                    released = true; if (dialog === surface) dialog = null
                    activity.application.unregisterActivityLifecycleCallbacks(lifecycle)
                    VoiceTasks.dismiss(); appBrowser = null; browser?.close(); send("closed")
                }
            }
            try {
                browser = VoiceBrowser(activity, address, false) { event ->
                    if (event == "error") { send(event); surface.dismiss() }
                    else if (event == "closed") surface.dismiss()
                    else send(if (event == "connected") "opened" else event)
                }
                appBrowser = browser
                val layout = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
                layout.addView(Button(activity).apply { text = "关闭语音"; setOnClickListener { surface.dismiss() } }, LinearLayout.LayoutParams(-1, -2))
                layout.addView(browser!!.view, LinearLayout.LayoutParams(-1, 0, 1f))
                activity.application.registerActivityLifecycleCallbacks(lifecycle)
                surface.setContentView(layout); dialog = surface; surface.show(); surface.window?.setLayout(-1,-1)
                send("opened")
            } catch (_: Exception) { send("error"); surface.dismiss() }
        }
    }
}
