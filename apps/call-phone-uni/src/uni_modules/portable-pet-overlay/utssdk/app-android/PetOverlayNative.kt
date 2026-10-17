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
import android.view.ViewGroup
import android.view.ViewConfiguration
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.ScrollView
import com.lzf.easyfloat.EasyFloat
import com.lzf.easyfloat.enums.ShowPattern
import com.lzf.easyfloat.enums.SidePattern
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.Executors
import org.json.JSONArray

/** Native UI ownership only. No accounts, network, phone calls, app IDs, or preference keys. */
object PetOverlayNative {
    private const val TAG = "dev.portablepet.overlay.v1"
    private val main = Handler(Looper.getMainLooper())
    private var listener: ((String) -> Unit)? = null
    private var generation = 0L
    private var root: LinearLayout? = null
    private var image: ImageView? = null
    private var video: PetVideoView? = null
    private var videoMode = false
    private var automaticVideo = true
    private var videoWeights = emptyMap<String, Double>()
    private var label: TextView? = null
    private var animation: AnimationDrawable? = null
    private var owner = WeakReference<Activity>(null)
    private var application: Application? = null
    private var pending: ((String) -> Unit)? = null
    private var timeout: Runnable? = null
    private var width = 0
    private var height = 0
    private var requested = false
    private var statusText = ""
    private var bubble: LinearLayout? = null
    private var bubbleDismiss: Runnable? = null
    private var videoBounds = emptyMap<String, IntArray>()
    private var currentBounds: IntArray? = null
    private var videoScale = 1f
    private var resumeAfterMenu = false
    private var holdReady: Runnable? = null
    private var returnToIdle: Runnable? = null
    private var menu: LinearLayout? = null
    private var collapsedPosition: IntArray? = null
    private var petSize = 0
    private var petHeight = 0
    private var selection = 0L
    private val decoder = Executors.newSingleThreadExecutor()
    private var sheets = emptyList<JSONObject>()
    private var actions = emptyList<Action>()
    private val clips = linkedMapOf<String, AnimationDrawable>()
    private data class Action(val id: String, val label: String, val group: String, val sheet: Int,
        val frames: JSONArray, val repeats: Int)

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
                        statusText = text
                        showBubble(text)
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
        width = dp(size); height = dp(size)
        petSize = width; petHeight = height; statusText = text
        videoMode = options.optString("renderer") == "rgb-alpha-sbs-v1"
        configureActions(options)
        currentBounds = videoBounds["idle"]
        if (videoMode) currentBounds?.let {
            videoScale = dp(size).toFloat() / it[3]
            width = (it[2] * videoScale).toInt().coerceAtLeast(1)
            height = dp(size); petSize = width; petHeight = height
        }
        val drawable = if (videoMode) null else decodeAnimation(activity, options)
        if (drawable != null) actions.firstOrNull()?.let { clips[it.id] = drawable }
        var consumePetTouch: ((MotionEvent) -> Unit)? = null
        val layout = object : LinearLayout(activity) {
            private var ownsTouch = false
            override fun dispatchTouchEvent(event: MotionEvent): Boolean {
                if (event.actionMasked == MotionEvent.ACTION_DOWN) ownsTouch = menu == null
                if (ownsTouch) {
                    consumePetTouch?.invoke(event)
                    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) ownsTouch = false
                    return true
                }
                return super.dispatchTouchEvent(event)
            }
        }.apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            isClickable = true // Consume DOWN so a stationary hold receives its matching UP.
            contentDescription = "桌宠，点击返回应用，长按选择表情和动作"
        }
        val portrait = ImageView(activity).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            setImageDrawable(drawable)
        }
        val currentGeneration = generation
        val videoPortrait = if (videoMode) PetVideoView(activity, options) { type, id, token, code ->
            if (currentGeneration == generation && (token == selection || token == 0L)) {
                when (type) {
                    "frame" -> {
                        applyVideoBounds(id)
                        if (pending != null && visible()) { clamp(); finish(true); showBubble(statusText) }
                    }
                    "ended" -> {
                        if (menu != null) resumeAfterMenu = true
                        else {
                            val next = if (automaticVideo) randomVideoAction() else actions.firstOrNull()
                            next?.let { playAction(it, true) }
                        }
                    }
                    "error" -> {
                        if (pending != null) {
                            finish(false, code, "桌宠视频播放失败，请检查系统 WebView 后重试")
                            remove(code)
                        } else {
                            remove(code)
                            event("lost", code, "桌宠视频播放失败，请返回应用重新开启")
                        }
                    }
                }
            }
        } else null
        video = videoPortrait
        val caption = TextView(activity).apply {
            gravity = Gravity.START; textSize = 13f; maxLines = 6
            setTextColor(Color.rgb(48, 57, 80)); setPadding(dp(13), dp(10), dp(13), dp(10))
            maxWidth = dp(208)
            background = GradientDrawable().apply {
                setColor(Color.WHITE); cornerRadius = dp(15).toFloat()
                setStroke(dp(1), Color.rgb(225, 230, 242))
            }
            elevation = dp(3).toFloat()
        }
        val speech = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(dp(5), dp(5), dp(5), dp(6)); visibility = View.GONE
            addView(caption, LinearLayout.LayoutParams(-2, -2))
            addView(object : View(activity) {
                private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
                override fun onDraw(canvas: android.graphics.Canvas) {
                    val path = android.graphics.Path().apply {
                        moveTo(0f, 0f); lineTo(width.toFloat(), 0f); lineTo(width * 0.5f, height.toFloat()); close()
                    }
                    canvas.drawPath(path, paint)
                }
            }, LinearLayout.LayoutParams(dp(12), dp(7)))
        }
        bubble = speech
        layout.addView(speech, LinearLayout.LayoutParams(-2, -2))
        layout.addView(videoPortrait ?: portrait, LinearLayout.LayoutParams(petSize, petHeight))
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
        var downX = 0f; var downY = 0f; var windowX = 0; var windowY = 0
        var dragging = false
        consumePetTouch = { motion ->
            if (menu == null) {
                if (motion.actionMasked == MotionEvent.ACTION_DOWN) {
                    downX = motion.rawX; downY = motion.rawY; dragging = false
                    val position = IntArray(2); (layout.parent as? View)?.getLocationOnScreen(position)
                    windowX = position[0]; windowY = position[1] - statusBarHeight(activity)
                }
                val action = gesture.accept(motion.actionMasked, motion.rawX, motion.rawY, motion.eventTime)
                if (motion.actionMasked == MotionEvent.ACTION_DOWN) startHold(gesture)
                if (!gesture.canHold()) cancelHold()
                if (motion.actionMasked == MotionEvent.ACTION_MOVE && gesture.isDragging()) {
                    dragging = true
                    EasyFloat.updateFloat(TAG, windowX + (motion.rawX - downX).toInt(), windowY + (motion.rawY - downY).toInt())
                }
                if (motion.actionMasked == MotionEvent.ACTION_UP && dragging) {
                    clamp()
                    val position = IntArray(2); (layout.parent as? View)?.getLocationOnScreen(position)
                    val screenWidth = activity.resources.displayMetrics.widthPixels
                    EasyFloat.updateFloat(TAG, if (position[0] + width / 2 < screenWidth / 2) 0 else (screenWidth - width).coerceAtLeast(0),
                        position[1] - statusBarHeight(activity))
                }
                if (action != PetGesture.NONE) main.post {
                    if (current == generation) {
                        if (action == PetGesture.MENU) openActionMenu()
                        else try { bringToFront(activity.applicationContext) }
                        catch (_: Exception) { event("error", "OPEN_APP_FAILED", "请点击桌面图标返回应用") }
                    }
                }
            }
        }
        EasyFloat.with(if (videoMode) VideoOverlayContext(activity) else activity)
            .setTag(TAG).setLayout(layout).setShowPattern(ShowPattern.ALL_TIME)
            .setSidePattern(SidePattern.RESULT_HORIZONTAL).setDragEnable(false)
            .setAnimator(null).setImmersionStatusBar(false)
            .setLocation(dp(12), dp(160))
            .registerCallback {
                createResult { created, message, _ ->
                    main.post {
                        if (current == generation && pending != null) {
                            if (created && visible()) {
                                if (video != null) {
                                    actions.firstOrNull()?.let { playAction(it, true) }
                                } else { animation?.start(); clamp(); finish(true) }
                            }
                            else { finish(false, "CREATE_FAILED", message ?: "悬浮窗创建失败"); remove("CREATE_FAILED") }
                        }
                    }
                }
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
        val rows = options.optInt("rows", 1)
        require(rows in 1..16) { "INVALID_ROWS" }
        val frames = options.getJSONArray("frames")
        require(frames.length() in 1..256) { "INVALID_FRAMES" }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        val useAsset = bounds.outWidth <= 0
        if (useAsset && assetPath.isNotEmpty()) context.assets.open(assetPath).use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth % columns == 0 && bounds.outHeight % rows == 0 &&
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
                require(cell in 0 until columns * rows && duration in 50..60000) { "INVALID_FRAME" }
                val drawable = cells.getOrPut(cell) {
                    val crop = Bitmap.createBitmap(bitmap, (cell % columns) * (bitmap.width / columns),
                        (cell / columns) * (bitmap.height / rows), bitmap.width / columns, bitmap.height / rows)
                    BitmapDrawable(context.resources, Bitmap.createScaledBitmap(crop, 192, 192, true))
                }
                addFrame(drawable, duration)
            }
        }
        // Bitmap references are released with drawables; never recycle a bitmap still used by a View.
    }

    private fun configureActions(options: JSONObject) {
        if (videoMode) {
            val source = options.getJSONArray("actions")
            require(source.length() in 1..128) { "INVALID_VIDEO_ACTIONS" }
            val parsed = (0 until source.length()).map { i ->
                val value = source.getJSONObject(i)
                val id = value.getString("id"); val label = value.getString("label"); val group = value.getString("group")
                val repeats = value.getInt("repeats")
                require(id.matches(Regex("[a-z][a-z0-9_-]{0,23}")) && label.length in 1..40 && group.length in 1..20 &&
                    repeats in 0..6 && (id == "idle") == (repeats == 0)) { "INVALID_VIDEO_ACTION" }
                Action(id, label, group, 0, JSONArray(), repeats)
            }
            require(parsed.first().id == "idle" && parsed.map { it.id }.distinct().size == parsed.size) { "INVALID_IDLE_ACTION" }
            videoBounds = (0 until source.length()).associate { i ->
                val item = source.getJSONObject(i)
                val bounds = item.getJSONArray("bounds")
                require(bounds.length() == 4) { "INVALID_VIDEO_BOUNDS" }
                val values = IntArray(4) { bounds.getInt(it) }
                require(values[0] >= 0 && values[1] >= 0 && values[2] > 0 && values[3] > 0 &&
                    values[0] + values[2] <= 640 && values[1] + values[3] <= 640) { "INVALID_VIDEO_BOUNDS" }
                item.getString("id") to values
            }
            videoWeights = (0 until source.length()).associate { i ->
                val item = source.getJSONObject(i)
                val weight = item.optDouble("randomWeight", 0.0)
                require(weight.isFinite() && weight in 0.0..100.0) { "INVALID_VIDEO_WEIGHT" }
                item.getString("id") to weight
            }
            actions = parsed; sheets = emptyList(); return
        }
        val sourceSheets = options.optJSONArray("sheets") ?: return
        val sourceActions = options.getJSONArray("actions")
        require(sourceSheets.length() in 1..32 && sourceActions.length() in 1..32) { "INVALID_ACTIONS" }
        val parsedSheets = (0 until sourceSheets.length()).map { sourceSheets.getJSONObject(it) }
        val parsedActions = (0 until sourceActions.length()).map { i ->
            val value = sourceActions.getJSONObject(i)
            val id = value.getString("id")
            val label = value.getString("label")
            val group = value.getString("group")
            val sheet = value.getInt("sheet")
            val frames = value.getJSONArray("frames")
            val repeats = value.getInt("repeats")
            require(id.matches(Regex("[a-z][a-z0-9_-]{0,23}")) && label.length in 1..12 &&
                group.length in 1..12 && sheet in parsedSheets.indices && frames.length() in 1..256 &&
                repeats in 0..6) { "INVALID_ACTION" }
            val columns = parsedSheets[sheet].getInt("columns")
            val rows = parsedSheets[sheet].optInt("rows", 1)
            require(columns in 1..16 && rows in 1..16) { "INVALID_GRID" }
            for (f in 0 until frames.length()) {
                require(frames.getJSONObject(f).getInt("cell") in 0 until columns * rows &&
                    frames.getJSONObject(f).getInt("duration") in 50..60000) { "INVALID_FRAME" }
            }
            require((id == "idle") == (repeats == 0)) { "INVALID_REPEAT" }
            Action(id, label, group, sheet, frames, repeats)
        }
        require(parsedActions.first().id == "idle" && parsedActions.map { it.id }.distinct().size == parsedActions.size) {
            "INVALID_IDLE_ACTION"
        }
        require(parsedSheets[parsedActions.first().sheet].getString("imagePath") == options.getString("imagePath") &&
            parsedActions.first().frames.toString() == options.getJSONArray("frames").toString()) { "INVALID_IDLE_SOURCE" }
        sheets = parsedSheets; actions = parsedActions
    }

    private fun startHold(gesture: PetGesture) {
        cancelHold()
        holdReady = Runnable {
            if (visible() && gesture.takeHold()) {
                root?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                openActionMenu()
            }
        }.also { main.postDelayed(it, PetGesture.HOLD_MS) }
    }

    private fun cancelHold() {
        holdReady?.let { main.removeCallbacks(it) }; holdReady = null

    }

    private fun reflowPet(nextWidth: Int = petSize, nextHeight: Int = petHeight, deltaX: Int = 0, deltaY: Int = 0) {
        val layout = root ?: return
        val portrait = video ?: image ?: return
        val anchor = IntArray(2); portrait.getLocationOnScreen(anchor)
        val mounted = layout.isAttachedToWindow
        petSize = nextWidth; petHeight = nextHeight
        portrait.layoutParams = LinearLayout.LayoutParams(petSize, petHeight)
        val speech = bubble
        var speechWidth = 0; var speechHeight = 0
        if (speech != null && speech.visibility == View.VISIBLE) {
            speech.measure(View.MeasureSpec.makeMeasureSpec((208 * layout.resources.displayMetrics.density).toInt(), View.MeasureSpec.AT_MOST),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
            speechWidth = speech.measuredWidth; speechHeight = speech.measuredHeight
        }
        width = maxOf(petSize, speechWidth, menu?.layoutParams?.width ?: 0)
        height = petHeight + speechHeight + (menu?.layoutParams?.height ?: 0)
        layout.layoutParams?.let { it.width = width; it.height = height; layout.layoutParams = it }
        if (mounted) EasyFloat.updateFloat(TAG, anchor[0] + deltaX - (width - petSize) / 2,
            anchor[1] + deltaY - speechHeight - statusBarHeight(layout.context))
        layout.requestLayout()
        layout.post { if (root === layout) clamp() }
    }

    private fun applyVideoBounds(id: String) {
        val next = videoBounds[id] ?: return
        val previous = currentBounds ?: next
        if (previous.contentEquals(next)) return
        currentBounds = next
        reflowPet((next[2] * videoScale).toInt().coerceAtLeast(1), (next[3] * videoScale).toInt().coerceAtLeast(1),
            ((next[0] - previous[0]) * videoScale).toInt(), ((next[1] - previous[1]) * videoScale).toInt())
    }

    private fun showBubble(text: String) {
        val speech = bubble ?: return
        bubbleDismiss?.let { main.removeCallbacks(it) }; bubbleDismiss = null
        label?.text = text
        speech.visibility = if (text.isBlank()) View.GONE else View.VISIBLE
        reflowPet()
        if (text.isNotBlank()) {
            val current = generation
            bubbleDismiss = Runnable {
                if (current == generation) { speech.visibility = View.GONE; reflowPet() }
            }.also { main.postDelayed(it, 6500) }
        }
    }

    private fun randomVideoAction(): Action? {
        val total = videoWeights.values.sum()
        if (total <= 0.0) return actions.firstOrNull()
        var position = Math.random() * total
        for (action in actions) {
            position -= videoWeights[action.id] ?: 0.0
            if (position < 0.0) return action
        }
        return actions.firstOrNull()
    }

    private fun playAction(action: Action, automatic: Boolean = false) {
        val context = root?.context?.applicationContext ?: return
        returnToIdle?.let { main.removeCallbacks(it) }; returnToIdle = null
        val current = generation
        val request = ++selection
        if (videoMode) { automaticVideo = automatic; video?.play(action.id, request); return }
        fun applyClip(drawable: AnimationDrawable) {
            if (current != generation || request != selection || !visible()) return
            animation?.stop(); image?.setImageDrawable(drawable); animation = drawable
            // Keep idle plus at most two other decoded clips; do not decode all 72 cells at startup.
            clips.remove(action.id); clips[action.id] = drawable
            while (clips.size > 3) clips.keys.firstOrNull { it != "idle" && it != action.id }?.let { clips.remove(it) }
            drawable.stop(); drawable.selectDrawable(0); drawable.start()
            if (action.repeats > 0) {
                var length = 0L
                for (i in 0 until action.frames.length()) length += action.frames.getJSONObject(i).getLong("duration")
                returnToIdle = Runnable {
                    if (current == generation && request == selection) actions.firstOrNull()?.let { playAction(it) }
                }.also { main.postDelayed(it, length * action.repeats) }
            }
        }
        val cached = clips[action.id]
        if (cached != null) { applyClip(cached); return }
        val options = JSONObject(sheets[action.sheet].toString()).put("frames", action.frames)
        decoder.execute {
            try {
                val drawable = decodeAnimation(context, options)
                main.post { applyClip(drawable) }
            } catch (e: Exception) {
                main.post {
                    if (current == generation && request == selection) {
                        event("error", "ACTION_DECODE_FAILED", "动作加载失败，请重试：" + (e.message ?: "素材不可用"))
                        actions.firstOrNull()?.let { playAction(it) }
                    }
                }
            }
        }
    }

    private fun openActionMenu() {
        val layout = root ?: return
        if (menu != null || !visible()) return
        cancelHold()
        if (actions.isEmpty()) { event("error", "NO_ACTIONS", "当前角色尚未配置动作"); return }
        val density = layout.resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt().coerceAtLeast(1)
        val location = IntArray(2)
        (layout.parent as? View)?.getLocationOnScreen(location)
        collapsedPosition = intArrayOf(location[0], location[1] - statusBarHeight(layout.context))
        val metrics = layout.resources.displayMetrics
        val menuWidth = dp(252).coerceAtMost(metrics.widthPixels)
        val panelHeight = dp(292).coerceAtMost((metrics.heightPixels - petHeight - (bubble?.takeIf { it.visibility == View.VISIBLE }?.measuredHeight ?: 0) - statusBarHeight(layout.context)).coerceAtLeast(dp(100)))

        val panel = LinearLayout(layout.context).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(8), 0, dp(8), 0)
            background = GradientDrawable().apply { setColor(Color.rgb(250, 251, 255)); cornerRadius = dp(16).toFloat() }
            elevation = dp(4).toFloat()
        }
        fun text(value: String, size: Float = 12f) = TextView(layout.context).apply {
            this.text = value; textSize = size; gravity = Gravity.CENTER
            setTextColor(Color.rgb(48, 57, 80))
        }
        panel.addView(text("选择表情和动作", 14f), LinearLayout.LayoutParams(-1, dp(36)))
        val content = LinearLayout(layout.context).apply { orientation = LinearLayout.VERTICAL }
        fun button(value: String, click: () -> Unit) = text(value).apply {
            background = GradientDrawable().apply { setColor(Color.rgb(240, 243, 250)); cornerRadius = dp(8).toFloat() }
            isFocusable = true
            setOnClickListener { click() }
        }
        fun rowButtons(values: List<Pair<String, () -> Unit>>) {
            for (row in values.chunked(2)) {
                val buttons = LinearLayout(layout.context)
                for ((name, click) in row) buttons.addView(button(name, click),
                    LinearLayout.LayoutParams(0, dp(52), 1f).apply { setMargins(dp(3), dp(3), dp(3), dp(3)) })
                repeat(2 - row.size) { buttons.addView(View(layout.context), LinearLayout.LayoutParams(0, dp(52), 1f)) }
                content.addView(buttons)
            }
        }
        lateinit var showGroups: () -> Unit
        fun showGroup(group: String) {
            content.removeAllViews()
            content.addView(button("返回分类 · " + group) { showGroups() }, LinearLayout.LayoutParams(-1, dp(40)))
            rowButtons(actions.filter { it.group == group }.map { action ->
                Pair(action.label, { closeActionMenu(); playAction(action) })
            })
        }
        showGroups = {
            content.removeAllViews()
            rowButtons(actions.map { it.group }.distinct().map { group ->
                Pair(group + "（" + actions.count { it.group == group } + "）", { showGroup(group) })
            })
        }
        showGroups()
        val scroll = ScrollView(layout.context).apply { addView(content) }
        panel.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        val footer = LinearLayout(layout.context)
        footer.addView(text("语音聊天").apply {
            isFocusable = true; setOnClickListener {
                closeActionMenu()
                try { bringToFront(layout.context); event("voice") }
                catch (_: Exception) { event("error", "OPEN_APP_FAILED", "请返回 App 开启语音") }
            }
        }, LinearLayout.LayoutParams(0, dp(44), 1f))
        footer.addView(text("收起").apply { isFocusable = true; setOnClickListener { closeActionMenu() } }, LinearLayout.LayoutParams(0, dp(44), 1f))
        panel.addView(footer)

        menu = panel; layout.addView(panel, LinearLayout.LayoutParams(menuWidth, panelHeight))


        EasyFloat.dragEnable(false, TAG)
        reflowPet()
        layout.post { if (root === layout && menu === panel) clamp() }
    }

    private fun closeActionMenu() {
        val panel = menu ?: return
        root?.removeView(panel); menu = null
        root?.setOnClickListener(null); root?.isClickable = true
        image?.apply { setOnClickListener(null); isClickable = false }
        reflowPet()
        EasyFloat.dragEnable(false, TAG)
        collapsedPosition?.let { EasyFloat.updateFloat(TAG, it[0].coerceAtLeast(0), it[1].coerceAtLeast(0)) }
        collapsedPosition = null
        if (resumeAfterMenu) { resumeAfterMenu = false; actions.firstOrNull()?.let { playAction(it, true) } }
        val layout = root
        layout?.post { if (root === layout) clamp() }
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
        selection++
        cancelHold()
        returnToIdle?.let { main.removeCallbacks(it) }; returnToIdle = null
        menu?.let { root?.removeView(it) }; menu = null; collapsedPosition = null
        actions = emptyList(); sheets = emptyList(); clips.clear(); videoWeights = emptyMap()
        requested = false
        bubbleDismiss?.let { main.removeCallbacks(it) }; bubbleDismiss = null
        bubble = null; currentBounds = null; videoBounds = emptyMap(); resumeAfterMenu = false
        animation?.stop()
        video?.let { (it.parent as? ViewGroup)?.removeView(it); it.release() }; video = null
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
