package dev.appoperator

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

object OperatorBridge {
    private val main = Handler(Looper.getMainLooper())
    private var busy = false
    @JvmStatic fun ready(): Boolean = OperatorService.current != null
    @JvmStatic fun execute(activity: Activity?, payload: String, callback: (String) -> Unit) {
        main.post {
            fun result(status: String, code: String? = null, data: JSONObject? = null): String {
                val out = JSONObject().put("status",status).put("verified",false)
                if (code != null) out.put("error",JSONObject().put("code",code))
                if (data != null) out.put("data",data)
                return out.toString()
            }
            if (busy) { callback(result("failed","BUSY"));return@post }
            val service = OperatorService.current
            if (service == null) { callback(result("failed","ACCESSIBILITY_UNAVAILABLE"));return@post }
            busy = true; var finished = false
            fun finish(value: String) { if (!finished) { finished = true; busy = false;callback(value) } }
            // Gestures are bounded below this timeout. No early release while a touch may still run.
            val watchdog = Runnable { finish(result("unknown","NATIVE_TIMEOUT")) }
            main.postDelayed(watchdog,10000)
            try {
                val input = JSONObject(payload);val action = input.getJSONObject("action")
                when(action.getString("operation")) {
                    "observe" -> finish(result("completed",data=service.snapshot()))
                    "screenshot" -> {
                        service.screenshot { data ->
                            if (data.has("error")) finish(result("failed", data.getString("error")))
                            else finish(result("completed", data=data))
                        }
                    }
                    "launchApp" -> {
                        val pkg = action.getJSONObject("arguments").getString("packageName")
                        if (!pkg.matches(Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+"))) throw IllegalStateException("INVALID_ARGUMENT")
                        val intent = service.packageManager.getLaunchIntentForPackage(pkg) ?: throw IllegalStateException("TARGET_NOT_FOUND")
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);service.startActivity(intent)
                        finish(result("dispatched"))
                    }
                    else -> service.perform(input) { status ->
                        finish(result(status,if (status == "failed") "NATIVE_REJECTED" else null))
                    }
                }
            } catch (e: Exception) {
                val allowed = setOf("UNSUPPORTED","INVALID_ARGUMENT","ACCESSIBILITY_UNAVAILABLE","TARGET_NOT_FOUND","TARGET_NOT_ACTIONABLE","WRONG_APPLICATION","STALE_SNAPSHOT","OUT_OF_BOUNDS","PASSWORD_TARGET","SNAPSHOT_LIMIT")
                val code = if (e.message in allowed) e.message!! else "EXECUTION_UNCONFIRMED"
                finish(result(if (code == "EXECUTION_UNCONFIRMED") "unknown" else "failed",code))
            }
            if (finished) main.removeCallbacks(watchdog)
        }
    }
}
