package dev.appoperator

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityService.TakeScreenshotCallback
import android.accessibilityservice.AccessibilityService.ScreenshotResult
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.graphics.Bitmap
import android.os.Build
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

/** Native input only: no socket, credentials, planner, business functions or diagnostic content logs. */
class OperatorService : AccessibilityService() {
    companion object { @Volatile var current: OperatorService? = null; private set }
    override fun onServiceConnected() { current = this }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}
    override fun onDestroy() { if (current === this) current = null; super.onDestroy() }

    fun snapshot(): JSONObject {
        val root = rootInActiveWindow ?: throw IllegalStateException("ACCESSIBILITY_UNAVAILABLE")
        val nodes = JSONArray()
        fun walk(node: AccessibilityNodeInfo, path: String, depth: Int) {
            if (depth > 64 || nodes.length() >= 2000) throw IllegalStateException("SNAPSHOT_LIMIT")
            val b = Rect(); node.getBoundsInScreen(b)
            nodes.put(JSONObject().put("nodeRef", path).put("resourceId", node.viewIdResourceName ?: "")
                .put("role", node.className?.toString() ?: "").put("password", node.isPassword)
                .put("text", if (node.isPassword) "" else node.text?.toString() ?: "")
                .put("description", if (node.isPassword) "" else node.contentDescription?.toString() ?: "")
                .put("bounds", JSONObject().put("left",b.left).put("top",b.top).put("right",b.right).put("bottom",b.bottom))
                .put("visible",node.isVisibleToUser).put("enabled",node.isEnabled).put("clickable",node.isClickable)
                .put("longClickable",node.isLongClickable).put("editable",node.isEditable).put("scrollable",node.isScrollable))
            for (i in 0 until node.childCount) node.getChild(i)?.let { walk(it,"$path.$i",depth+1) }
        }
        walk(root,"n:0",0)
        val pkg = root.packageName?.toString() ?: ""
        @Suppress("DEPRECATION")
        val version = try { packageManager.getPackageInfo(pkg,0).versionName ?: "" } catch (_: Exception) { "" }
        val dm = resources.displayMetrics
        val state = JSONObject().put("foregroundPackage",pkg).put("appVersion",version)
            .put("display",JSONObject().put("width",dm.widthPixels).put("height",dm.heightPixels)).put("nodes",nodes)
        val digest = MessageDigest.getInstance("SHA-256").digest(state.toString().toByteArray(Charsets.UTF_8))
        return state.put("snapshotId",digest.joinToString("") { "%02x".format(it.toInt() and 255) })
    }

    private fun node(ref: String): AccessibilityNodeInfo {
        if (!ref.matches(Regex("n:0(\\.[0-9]+)*"))) throw IllegalStateException("TARGET_NOT_FOUND")
        var n = rootInActiveWindow ?: throw IllegalStateException("ACCESSIBILITY_UNAVAILABLE")
        for (part in ref.removePrefix("n:0").split('.').filter { it.isNotEmpty() })
            n = n.getChild(part.toInt()) ?: throw IllegalStateException("TARGET_NOT_FOUND")
        if (!n.isVisibleToUser || !n.isEnabled) throw IllegalStateException("TARGET_NOT_ACTIONABLE")
        return n
    }

    fun screenshot(done: (JSONObject) -> Unit) {
        if (Build.VERSION.SDK_INT < 30) throw IllegalStateException("UNSUPPORTED")
        val executor = java.util.concurrent.Executor { command -> Handler(Looper.getMainLooper()).post(command) }
        takeScreenshot(android.view.Display.DEFAULT_DISPLAY, executor, object : TakeScreenshotCallback {
            override fun onSuccess(result: ScreenshotResult) {
                val buffer = result.hardwareBuffer
                try {
                    val colorSpace = result.colorSpace
                    val bitmap = Bitmap.wrapHardwareBuffer(buffer, colorSpace)
                        ?: throw IllegalStateException("SCREENSHOT_UNAVAILABLE")
                    val output = ByteArrayOutputStream()
                    if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output))
                        throw IllegalStateException("SCREENSHOT_ENCODE_FAILED")
                    done(JSONObject().put("mime", "image/jpeg").put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP))
                        .put("width", bitmap.width).put("height", bitmap.height).put("secure", false))
                } catch (e: Exception) { done(JSONObject().put("error", "SCREENSHOT_FAILED")) } finally { buffer.close() }
            }
            override fun onFailure(errorCode: Int) { done(JSONObject().put("error", "SCREENSHOT_FAILED_$errorCode")) }
        })
    }

    fun perform(payload: JSONObject, done: (String) -> Unit) {
        val action = payload.getJSONObject("action"); val op = action.getString("operation")
        val args = action.getJSONObject("arguments")
        val before = if (op in listOf("back","home","recentApps") && !args.has("expectedPackage") && !payload.has("snapshotId")) JSONObject() else snapshot()
        if (args.has("expectedPackage") && before.getString("foregroundPackage") != args.getString("expectedPackage"))
            throw IllegalStateException("WRONG_APPLICATION")
        if (payload.has("snapshotId") && before.getString("snapshotId") != payload.getString("snapshotId"))
            throw IllegalStateException("STALE_SNAPSHOT")
        val resolved = payload.optJSONObject("resolved") ?: JSONObject()
        if (op in listOf("click","longClick","setText","scroll")) {
            val target = resolved.getJSONObject("target")
            if (target.has("nodeRef") && !(op == "longClick" && args.has("durationMs"))) {
                val n = node(target.getString("nodeRef"))
                val accepted = when(op) {
                    "click" -> n.isClickable && n.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    "longClick" -> n.isLongClickable && n.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK)
                    "setText" -> {
                        if (n.isPassword) throw IllegalStateException("PASSWORD_TARGET")
                        if (!n.isEditable) throw IllegalStateException("TARGET_NOT_ACTIONABLE")
                        val value = (if (args.optBoolean("replace",true)) "" else n.text?.toString() ?: "") + args.getString("text")
                        val bundle = Bundle(); bundle.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,value)
                        n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,bundle)
                    }
                    else -> {
                        if (!n.isScrollable) throw IllegalStateException("TARGET_NOT_ACTIONABLE")
                        val code = when(args.getString("direction")) {
                            "up" -> AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_UP.id
                            "down" -> AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_DOWN.id
                            "left" -> AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_LEFT.id
                            else -> AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_RIGHT.id
                        }
                        n.performAction(code)
                    }
                }
                done(if (accepted) "dispatched" else "failed"); return
            }
        }
        if (op in listOf("click","longClick","swipe")) {
            val path = Path(); var duration = args.optLong("durationMs", if (op == "longClick") 600 else 50)
            if (op == "click" || op == "longClick") {
                val p = resolved.getJSONObject("target").getJSONObject("point")
                checkPoint(p,before);path.moveTo(p.getInt("x").toFloat(),p.getInt("y").toFloat())
            } else {
                val points = payload.getJSONArray("gesture")
                if (points.length() < 2 || points.length() > 121) throw IllegalStateException("INVALID_ARGUMENT")
                var time = -1L
                for (i in 0 until points.length()) {
                    val p = points.getJSONObject(i);checkPoint(p,before)
                    val t = p.getLong("timeMs"); if (t <= time || (i == 0 && t != 0L)) throw IllegalStateException("INVALID_ARGUMENT")
                    time = t
                    if (i == 0) path.moveTo(p.getInt("x").toFloat(),p.getInt("y").toFloat())
                    else path.lineTo(p.getInt("x").toFloat(),p.getInt("y").toFloat())
                }
                duration = time
                if (duration < 100 || duration > 5000) throw IllegalStateException("INVALID_ARGUMENT")
            }
            // Android Path supports geometry but not per-point timing; sampled easing is not a timing guarantee.
            val hold = 0L
            val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path,0,duration+hold)).build()
            val accepted = dispatchGesture(gesture,object: GestureResultCallback() {
                override fun onCompleted(g: GestureDescription) { done("completed") }
                override fun onCancelled(g: GestureDescription) { done("unknown") }
            },Handler(Looper.getMainLooper()))
            if (!accepted) done("failed")
            return
        }
        val global = when(op) { "back" -> GLOBAL_ACTION_BACK; "home" -> GLOBAL_ACTION_HOME; "recentApps" -> GLOBAL_ACTION_RECENTS; else -> 0 }
        if (global != 0) { done(if (performGlobalAction(global)) "dispatched" else "failed");return }
        throw IllegalStateException("UNSUPPORTED")
    }
    private fun checkPoint(p: JSONObject, state: JSONObject) {
        val d = state.getJSONObject("display"); val x = p.getInt("x"); val y = p.getInt("y")
        if (x < 0 || y < 0 || x >= d.getInt("width") || y >= d.getInt("height")) throw IllegalStateException("OUT_OF_BOUNDS")
    }
}
