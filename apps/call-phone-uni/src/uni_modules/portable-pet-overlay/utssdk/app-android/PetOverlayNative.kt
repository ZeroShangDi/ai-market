package dev.portablepet.overlay

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.ComponentCallbacks
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.AnimationDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.view.View
import android.view.ViewConfiguration
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.lzf.easyfloat.EasyFloat
import com.lzf.easyfloat.enums.ShowPattern
import com.lzf.easyfloat.enums.SidePattern
import org.json.JSONObject
import java.lang.ref.WeakReference

/** Native UI ownership only. No accounts, network, phone calls, app IDs, or preference keys. */
object PetOverlayNative {
    private const val TAG = "dev.portablepet.overlay.v1"
    private val main = Handler(Looper.getMainLooper())
    private var listener: ((String) -> Unit)? = null
    private var generation = 0L
    private var root: LinearLayout? = null
    private var image: ImageView? = null
    private var label: TextView? = null
    private var animation: AnimationDrawable? = null
    private var owner = WeakReference<Activity>(null)
    private var application: Application? = null
    private var pending: ((String) -> Unit)? = null
    private var timeout: Runnable? = null
    private var width = 0
    private var height = 0
    private var requested = false

    @JvmStatic fun permission(context: Context?): Int = try {
        if (context == null) -1 else if (Settings.canDrawOverlays(context)) 1 else 0
    } catch (_: Exception) { -1 }

    @JvmStatic fun setListener(callback: (String) -> Unit) { main.post { listener = callback } }
    @JvmStatic fun clearListener() { main.post { listener = null } }
    private fun safe(callback: ((String) -> Unit)?, value: String) {
        try { callback?.invoke(value) } catch (_: Exception) { /* Host callback cannot break cleanup. */ }
    }
    private fun visible(): Boolean = root?.let { it.isAttachedToWindow && it.isShown && EasyFloat.isShow(TAG) } == true
    private fun result(ok: Boolean, code: String = "OK", message: String = ""): String =
        JSONObject().put("ok", ok).put("code", code).put("message", message)
            .put("visible", visible()).toString()
    private fun event(type: String, code: String = "OK", message: String = "") {
        safe(listener, JSONObject(result(code == "OK", code, message)).put("type", type).toString())
    }

    @JvmStatic fun execute(context: Context?, activity: Activity?, command: String, payload: String, callback: (String) -> Unit) {
        main.post {
            var completed = false
            val reply: (String) -> Unit = { value ->
                if (!completed) { completed = true; safe(callback, value) }
            }
            try {
                when (command) {
                    "show" -> {
                        require(context != null && activity != null && !activity.isFinishing && !activity.isDestroyed) { "NO_ACTIVITY" }
                        show(activity, JSONObject(payload), reply)
                    }
                    "hide", "dispose" -> {
                        val removed = remove("CANCELLED")
                        safe(reply, result(removed, if (removed) "OK" else "REMOVE_FAILED", if (removed) "" else "悬浮窗关闭失败，请重试"))
                    }
                    "status" -> {
                        if (requested && (permission(context) != 1 || (pending == null && !visible()))) {
                            val code = if (permission(context) == 0) "PERMISSION_DENIED" else "WINDOW_LOST"
                            remove(code); event("lost", code, "悬浮窗已不可用，请返回应用重新检查")
                        }
                        safe(reply, result(true))
                    }
                    "text" -> {
                        val text = JSONObject(payload).optString("text", "")
                        require(text.length <= 80) { "INVALID_TEXT" }
                        label?.text = text
                        safe(reply, result(true))
                    }
                    "settings" -> {
                        require(activity != null && !activity.isFinishing) { "NO_ACTIVITY" }
                        try {
                            activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + activity.packageName)))
                        } catch (_: Exception) {
                            activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.packageName)))
                        }
                        safe(reply, result(true))
                    }
                    "front" -> {
                        require(context != null) { "NO_CONTEXT" }
                        bringToFront(context); safe(reply, result(true))
                    }
                    else -> safe(reply, result(false, "INVALID_COMMAND", "未知桌宠操作"))
                }
            } catch (e: Exception) {
                val code = if (e is SecurityException) "PERMISSION_DENIED" else "NATIVE_ERROR"
                val message = e.message ?: "桌宠操作失败"
                if (command == "show") { finish(false, code, message); remove("CREATE_FAILED") }
                safe(reply, result(false, code, message))
            }
        }
    }

    private fun show(activity: Activity, options: JSONObject, callback: (String) -> Unit) {
        if (permission(activity) != 1) {
            safe(callback, result(false, "PERMISSION_DENIED", "请先允许显示在其他应用上层")); return
        }
        // Explicitly replace the previous instance; never reuse a destroyed Activity or old skin.
        check(remove("SUPERSEDED")) { "PREVIOUS_WINDOW_NOT_REMOVED" }
        require(options.optInt("version") == 1) { "UNSUPPORTED_OPTIONS_VERSION" }
        val size = options.optInt("sizeDp", 104)
        require(size in 32..256) { "INVALID_SIZE" }
        val text = options.optString("text", "")
        require(text.length <= 80) { "INVALID_TEXT" }
        val density = activity.resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt().coerceAtLeast(1)
        width = dp(size); height = dp(size + 24)
        val drawable = decodeAnimation(activity, options)
        val layout = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            contentDescription = "桌宠，点击返回应用，长按关闭"
        }
        val portrait = ImageView(activity).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            setImageDrawable(drawable)
        }
        layout.addView(portrait, LinearLayout.LayoutParams(width, dp(size)))
        val caption = TextView(activity).apply {
            this.text = text; gravity = Gravity.CENTER; textSize = 10f
            setTextColor(Color.WHITE)
            maxLines = 1
            background = GradientDrawable().apply { setColor(Color.rgb(22, 101, 52)); cornerRadius = dp(10).toFloat() }
        }
        layout.addView(caption, LinearLayout.LayoutParams(width, dp(24)))
        root = layout; image = portrait; label = caption; animation = drawable
        owner = WeakReference(activity); requested = true
        register(activity.application)
        val current = generation
        pending = callback
        timeout = Runnable {
            if (current == generation && pending != null) {
                finish(false, "ATTACH_TIMEOUT", "悬浮窗未挂载，请重试显示")
                remove("ATTACH_TIMEOUT")
            }
        }.also { main.postDelayed(it, 5000) }
        val slop = ViewConfiguration.get(activity).scaledTouchSlop
        val gesture = PetGesture(slop.toFloat())
        // Handle taps after EasyFloat has finished processing the current MotionEvent.
        EasyFloat.with(activity)
            .setTag(TAG).setLayout(layout).setShowPattern(ShowPattern.ALL_TIME)
            .setSidePattern(SidePattern.RESULT_HORIZONTAL).setDragEnable(true)
            .setAnimator(null).setImmersionStatusBar(false)
            .setLocation(dp(12), dp(160))
            .registerCallback {
                createResult { created, message, _ ->
                    main.post {
                        if (current == generation && pending != null) {
                            if (created && visible()) { animation?.start(); clamp(); finish(true) }
                            else { finish(false, "CREATE_FAILED", message ?: "悬浮窗创建失败"); remove("CREATE_FAILED") }
                        }
                    }
                }
                touchEvent { _, motion ->
                    val action = gesture.accept(motion.actionMasked, motion.rawX, motion.rawY, motion.eventTime)
                    if (action != PetGesture.NONE) main.post {
                        if (current == generation) {
                            if (action == PetGesture.CLOSE) { if (remove("CLOSED")) event("closed") }
                            else try { bringToFront(activity.applicationContext) }
                            catch (e: Exception) { event("error", "OPEN_APP_FAILED", e.message ?: "请点击桌面图标返回应用") }
                        }
                    }
                }
                drag { _, _ -> gesture.markDragged() }
                dragEnd { clamp() }
            }.show()
    }

    private fun finish(ok: Boolean, code: String = "OK", message: String = "") {
        timeout?.let { main.removeCallbacks(it) }; timeout = null
        val callback = pending; pending = null
        safe(callback, result(ok, code, message))
    }

    private fun decodeAnimation(context: Context, options: JSONObject): AnimationDrawable {
        val path = options.getString("imagePath")
        val assetPath = options.optString("assetPath", "")
        require(path.startsWith('/') && !path.split('/').contains("..")) { "INVALID_IMAGE_PATH" }
        require(!assetPath.startsWith('/') && !assetPath.split('/').contains("..")) { "INVALID_ASSET_PATH" }
        val columns = options.getInt("columns")
        require(columns in 1..16) { "INVALID_COLUMNS" }
        val frames = options.getJSONArray("frames")
        require(frames.length() in 1..64) { "INVALID_FRAMES" }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        val useAsset = bounds.outWidth <= 0
        if (useAsset && assetPath.isNotEmpty()) context.assets.open(assetPath).use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth % columns == 0 &&
            bounds.outWidth.toLong() * bounds.outHeight <= 8_388_608L) { "INVALID_IMAGE_DIMENSIONS" }
        val bitmap = if (useAsset) context.assets.open(assetPath).use { BitmapFactory.decodeStream(it) }
            else BitmapFactory.decodeFile(path)
        require(bitmap != null) { "IMAGE_DECODE_FAILED" }
        val cells = mutableMapOf<Int, BitmapDrawable>()
        return AnimationDrawable().apply {
            isOneShot = false
            for (i in 0 until frames.length()) {
                val frame = frames.getJSONObject(i)
                val cell = frame.getInt("cell"); val duration = frame.getInt("duration")
                require(cell in 0 until columns && duration in 50..60000) { "INVALID_FRAME" }
                val drawable = cells.getOrPut(cell) {
                    val crop = Bitmap.createBitmap(bitmap, cell * bitmap.width / columns, 0, bitmap.width / columns, bitmap.height)
                    BitmapDrawable(context.resources, Bitmap.createScaledBitmap(crop, 256, 256, true))
                }
                addFrame(drawable, duration)
            }
        }
        // Bitmap references are released with drawables; never recycle a bitmap still used by a View.
    }

    private fun bringToFront(context: Context) {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: throw IllegalStateException("无法返回应用，请点击桌面图标")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        context.startActivity(intent)
    }

    private fun clamp() {
        val view = root ?: return
        val parent = view.parent as? View ?: return
        try {
            val metrics = view.resources.displayMetrics
            val location = IntArray(2); parent.getLocationOnScreen(location)
            EasyFloat.updateFloat(TAG, location[0].coerceIn(0, (metrics.widthPixels - width).coerceAtLeast(0)),
                (location[1] - statusBarHeight(view.context)).coerceIn(0, (metrics.heightPixels - height - statusBarHeight(view.context)).coerceAtLeast(0)))
        } catch (e: Exception) {
            event("error", "POSITION_FAILED", e.message ?: "桌宠位置更新失败，请重试显示")
        }
    }
    private fun statusBarHeight(context: Context): Int {
        val id = context.resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (id == 0) 0 else context.resources.getDimensionPixelSize(id)
    }

    private fun remove(reason: String): Boolean {
        generation++
        requested = false
        animation?.stop()
        timeout?.let { main.removeCallbacks(it) }; timeout = null
        val previous = pending; pending = null
        val view = root
        val window = view?.parent as? View
        // EasyFloat swallows removal exceptions and drops its registry entry first.
        // Retain our references until Android confirms detachment, and allow a retry.
        try { EasyFloat.dismiss(TAG, true) } catch (_: Exception) { }
        if (view?.isAttachedToWindow == true && window != null) {
            try { (view.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeViewImmediate(window) }
            catch (_: Exception) { }
        }
        val removed = view?.isAttachedToWindow != true
        if (removed) {
            image?.setImageDrawable(null)
            root = null; image = null; label = null; animation = null
            owner.clear(); unregister()
        } else event("error", "REMOVE_FAILED", "悬浮窗关闭失败，请返回应用重试")
        safe(previous, result(false, reason, "桌宠显示已取消"))
        return removed
    }
    private val configCallbacks = object : ComponentCallbacks {
        override fun onConfigurationChanged(configuration: Configuration) { main.post { clamp() } }
        override fun onLowMemory() { main.post { remove("LOW_MEMORY"); event("lost", "LOW_MEMORY", "内存不足，桌宠已关闭") } }
    }
    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityDestroyed(activity: Activity) {
            if (owner.get() === activity) { remove("ACTIVITY_DESTROYED"); event("lost", "ACTIVITY_DESTROYED", "应用界面已重建，请恢复桌宠") }
        }
        override fun onActivityCreated(activity: Activity, state: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityResumed(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
    }
    private fun register(app: Application) {
        if (application === app) return
        unregister(); application = app
        app.registerActivityLifecycleCallbacks(lifecycle); app.registerComponentCallbacks(configCallbacks)
    }
    private fun unregister() {
        application?.unregisterActivityLifecycleCallbacks(lifecycle)
        application?.unregisterComponentCallbacks(configCallbacks)
        application = null
    }
}
