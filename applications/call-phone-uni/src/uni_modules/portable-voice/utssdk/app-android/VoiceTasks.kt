package dev.portablevoice

import android.app.Activity
import android.app.AlertDialog
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.WindowManager

/** Explicit human confirmation; speech/model output cannot press the positive button. */
object VoiceTasks {
    private val main = Handler(Looper.getMainLooper())
    private var dialog: AlertDialog? = null
    @JvmStatic fun dismiss() { main.post { dialog?.cancel() } }
    @JvmStatic fun confirm(activity: Activity?, prompt: String, callback: (Boolean) -> Unit) { main.post {
        if (prompt.isBlank() || prompt.length > 6500 || dialog != null) { callback(false); return@post }
        val service = VoiceDesktopService.instance
        val context = service ?: activity
        if (context == null) { callback(false); return@post }
        var settled=false
        fun finish(value:Boolean) { if (!settled) { settled=true; callback(value) } }
        try {
            val box=AlertDialog.Builder(context).setTitle("创建后台任务？").setMessage(prompt)
                .setPositiveButton("创建任务") { _,_ -> finish(true) }
                .setNegativeButton("取消") { _,_ -> finish(false) }.create()
            box.setOnCancelListener { finish(false) }
            box.setOnDismissListener { if(dialog===box)dialog=null;finish(false) }
            if(service!=null) box.window?.setType(if(Build.VERSION.SDK_INT>=26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE)
            dialog=box;box.show()
        } catch (_:Exception) { dialog=null;finish(false) }
    } }
}
