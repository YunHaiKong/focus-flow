package cn.yunhaikong.focusflow

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.WindowManager
import android.widget.Toast
import androidx.core.app.NotificationCompat
import cn.yunhaikong.focusflow.model.FocusState
import cn.yunhaikong.focusflow.model.Task
import cn.yunhaikong.focusflow.sync.SyncManager
import cn.yunhaikong.focusflow.ui.FloatingPetView
import cn.yunhaikong.focusflow.ui.TaskPanelView
import cn.yunhaikong.focusflow.util.DateParser

class FloatingPetService : Service() {

    companion object {
        const val CHANNEL_ID = "focus_flow_floating_channel"
        const val NOTIFICATION_ID = 23119
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
    }

    private lateinit var windowManager: WindowManager
    private lateinit var syncManager: SyncManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var floatingPetView: FloatingPetView? = null
    private var taskPanelView: TaskPanelView? = null
    private var isPanelShowing = false

    // Focus Timer
    private var focusState = FocusState()
    private val timerRunnable = object : Runnable {
        override fun run() {
            if (focusState.isRunning && !focusState.isPaused) {
                if (focusState.remainingSeconds > 0) {
                    focusState.remainingSeconds--
                    updateUiForFocus()
                    mainHandler.postDelayed(this, 1000)
                } else {
                    onPomodoroComplete()
                }
            }
        }
    }

    // Clipboard listener for #task sniffing
    private var clipboardManager: ClipboardManager? = null
    private val clipboardListener = ClipboardManager.OnPrimaryClipChangedListener {
        handleClipboardChange()
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        syncManager = SyncManager.getInstance(this)
        clipboardManager = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboardManager?.addPrimaryClipChangedListener(clipboardListener)

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildForegroundNotification("爱莉希雅桌面桌宠运行中"))

        initFloatingPet()
        initTaskPanel()

        syncManager.connectWebSocket()
        syncManager.addTasksListener { tasks ->
            mainHandler.post {
                val uncompleted = tasks.filter { !it.completed }.size
                floatingPetView?.updateBadge(uncompleted, focusState.isRunning, focusState.remainingSeconds / 60)
                taskPanelView?.updateTasks(tasks)
            }
        }

        syncManager.addFocusListener { focus ->
            mainHandler.post {
                this.focusState = focus
                updateUiForFocus()
                taskPanelView?.updateFocusState(focus)
            }
        }

        syncManager.addConnectionListener { connected ->
            mainHandler.post {
                taskPanelView?.updateSyncStatus(connected)
            }
        }
    }

    private fun initFloatingPet() {
        floatingPetView = FloatingPetView(this).apply {
            onPetClick = {
                toggleTaskPanel()
            }
            onPetDoubleClick = {
                toggleQuickFocus()
            }
        }
        windowManager.addView(floatingPetView, floatingPetView?.layoutParams)
    }

    private fun initTaskPanel() {
        taskPanelView = TaskPanelView(
            context = this,
            syncManager = syncManager,
            onStartFocus = { minutes ->
                startFocusSession(minutes)
            },
            onStopFocus = {
                stopFocusSession()
            },
            onTaskActionCelebration = {
                celebrateTaskDone()
            }
        ).apply {
            onCloseRequested = {
                hideTaskPanel()
            }
        }
    }

    private fun toggleTaskPanel() {
        if (isPanelShowing) {
            hideTaskPanel()
        } else {
            showTaskPanel()
        }
    }

    private fun showTaskPanel() {
        if (!isPanelShowing && taskPanelView != null) {
            try {
                windowManager.addView(taskPanelView, taskPanelView?.layoutParams)
                isPanelShowing = true
                taskPanelView?.updateTasks(syncManager.getTasksList())
                taskPanelView?.updateFocusState(focusState)
                taskPanelView?.updateSyncStatus(syncManager.isConnected)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun hideTaskPanel() {
        if (isPanelShowing && taskPanelView != null) {
            try {
                windowManager.removeView(taskPanelView)
                isPanelShowing = false
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun startFocusSession(minutes: Int) {
        focusState.isRunning = true
        focusState.isPaused = false
        focusState.totalSeconds = minutes * 60
        focusState.remainingSeconds = minutes * 60
        focusState.mode = "focus"
        syncManager.updateFocus(focusState)

        mainHandler.removeCallbacks(timerRunnable)
        mainHandler.post(timerRunnable)

        floatingPetView?.loadSprite(R.drawable.flowers)
        updateUiForFocus()
        Toast.makeText(this, "专注已开启: ${minutes}分钟", Toast.LENGTH_SHORT).show()
    }

    private fun stopFocusSession() {
        focusState.isRunning = false
        focusState.isPaused = false
        focusState.remainingSeconds = focusState.totalSeconds
        syncManager.updateFocus(focusState)

        mainHandler.removeCallbacks(timerRunnable)
        floatingPetView?.loadSprite(R.drawable.realm)
        updateUiForFocus()
    }

    private fun toggleQuickFocus() {
        if (focusState.isRunning) {
            stopFocusSession()
            Toast.makeText(this, "专注已结束", Toast.LENGTH_SHORT).show()
        } else {
            startFocusSession(25)
        }
    }

    private fun onPomodoroComplete() {
        focusState.isRunning = false
        syncManager.updateFocus(focusState)

        // Vibrate
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400), -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(longArrayOf(0, 400, 200, 400), -1)
        }

        celebrateTaskDone()
        Toast.makeText(this, "🎉 番茄专注达成！休息一下吧~", Toast.LENGTH_LONG).show()
    }

    private fun celebrateTaskDone() {
        floatingPetView?.loadSprite(R.drawable.clap)
        mainHandler.postDelayed({
            if (focusState.isRunning) {
                floatingPetView?.loadSprite(R.drawable.flowers)
            } else {
                floatingPetView?.loadSprite(R.drawable.realm)
            }
        }, 3000)
    }

    private fun updateUiForFocus() {
        val remainingMin = focusState.remainingSeconds / 60
        floatingPetView?.updateBadge(
            count = syncManager.getTodayTasks().count { !it.completed },
            isFocusing = focusState.isRunning,
            focusRemainingMin = remainingMin
        )
        taskPanelView?.updateFocusState(focusState)
    }

    private fun handleClipboardChange() {
        try {
            val clip = clipboardManager?.primaryClip
            if (clip != null && clip.itemCount > 0) {
                val text = clip.getItemAt(0).text?.toString()?.trim() ?: ""
                if (text.startsWith("#task ")) {
                    val taskBody = text.substring(6).trim()
                    if (taskBody.isNotEmpty()) {
                        val parsed = DateParser.parse(taskBody)
                        val task = Task(
                            title = parsed.title,
                            date = parsed.date,
                            time = parsed.time
                        )
                        syncManager.addTask(task)
                        Toast.makeText(this, "剪贴板自动添加待办: ${task.title}", Toast.LENGTH_SHORT).show()
                        celebrateTaskDone()
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Focus Flow 悬浮桌宠",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "保持桌面爱莉希雅悬浮球与后台同步运行"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(content: String): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Focus Flow 桌面桌宠")
            .setContentText(content)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        clipboardManager?.removePrimaryClipChangedListener(clipboardListener)
        hideTaskPanel()
        if (floatingPetView != null) {
            try {
                windowManager.removeView(floatingPetView)
            } catch (e: Exception) {}
            floatingPetView = null
        }
        syncManager.disconnect()
        mainHandler.removeCallbacks(timerRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
