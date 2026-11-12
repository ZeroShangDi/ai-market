package dev.portablevoice

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.os.*
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager

/** A transient permission host, never opens the application's business page. */
class VoiceStartActivity : Activity() {
    private var started = false
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        if (VoiceSurface.pendingAddress == null || !Settings.canDrawOverlays(this)) { fail(); return }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 17)
    }
    override fun onResume() {
        super.onResume()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) begin()
    }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code == 17) { if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) begin() else fail() }
    }
    private fun begin() {
        if (started || isFinishing) return
        started = true
        try {
            val intent = Intent(this, VoiceDesktopService::class.java)
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent) else startService(intent)
            // Service starts while this user-initiated Activity is visible (Android microphone restriction).
            val handler = Handler(Looper.getMainLooper())
            val deadline = SystemClock.elapsedRealtime() + 5000
            val check = object : Runnable {
                override fun run() {
                    if (isFinishing) return
                    if (VoiceDesktopService.running) finish()
                    else if (SystemClock.elapsedRealtime() >= deadline) fail()
                    else handler.postDelayed(this, 50)
                }
            }
            handler.post(check)
        } catch (_: Exception) { fail() }
    }
    private fun fail() { VoiceSurface.pendingAddress = null; VoiceSurface.send("error"); finish() }
}

class VoiceDesktopService : Service() {
    companion object { @Volatile var running = false; internal var instance: VoiceDesktopService? = null }
    private var browser: VoiceBrowser? = null
    private var audio: AudioManager? = null
    private var focus: AudioFocusRequest? = null
    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        if (change < 0) main.post { stopSelf() }
    }
    private var windows: WindowManager? = null
    private val main = Handler(Looper.getMainLooper())
    private val deadline = Runnable { VoiceSurface.send("error"); stopSelf() }
    internal fun deliver(payload: String) { browser?.deliver(payload) }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "close") { stopSelf(); return START_NOT_STICKY }
        if (running) return START_NOT_STICKY
        val address = VoiceSurface.pendingAddress
        VoiceSurface.pendingAddress = null
        if (address == null || !Settings.canDrawOverlays(this) || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            VoiceSurface.send("error"); stopSelf(); return START_NOT_STICKY
        }
        try {
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("pet_voice", "桌宠语音", NotificationManager.IMPORTANCE_LOW))
            val stop = PendingIntent.getService(this, 1, Intent(this, VoiceDesktopService::class.java).setAction("close"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "pet_voice") else Notification.Builder(this)
            val notification = builder.setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("桌宠语音已开启")
                .setContentText("点击关闭语音，或长按桌宠关闭").setOngoing(true).setContentIntent(stop)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭语音", stop).build()
            if (Build.VERSION.SDK_INT >= 29) startForeground(48083, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else startForeground(48083, notification)
            audio = getSystemService(AUDIO_SERVICE) as AudioManager
            val granted = if (Build.VERSION.SDK_INT >= 26) {
                focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setOnAudioFocusChangeListener(focusListener, main).build()
                audio!!.requestAudioFocus(focus!!)
            } else audio!!.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            check(granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
            windows = getSystemService(WINDOW_SERVICE) as WindowManager
            browser = VoiceBrowser(this, address, true) { event ->
                when (event) {
                    "connected" -> { main.removeCallbacks(deadline); VoiceSurface.send("opened") }
                    "closed", "error" -> { if (event == "error") VoiceSurface.send("error"); stopSelf() }
                    else -> VoiceSurface.send(event)
                }
            }
            val params = WindowManager.LayoutParams(1, 1,
                if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.START; alpha = 0.01f }
            windows!!.addView(browser!!.view, params)
            instance = this; running = true
            main.postDelayed(deadline, 30000)
        } catch (_: Exception) { VoiceSurface.send("error"); stopSelf() }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        main.removeCallbacks(deadline)
        browser?.let { try { windows?.removeView(it.view) } catch (_: Exception) {}; it.close() }
        VoiceTasks.dismiss(); instance = null
        browser = null; running = false
        if (Build.VERSION.SDK_INT >= 26) focus?.let { audio?.abandonAudioFocusRequest(it) }
        else audio?.abandonAudioFocus(focusListener)
        focus = null; audio = null
        stopForeground(true); VoiceSurface.send("closed")
        super.onDestroy()
    }
}
