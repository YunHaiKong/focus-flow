package cn.yunhaikong.focusflow.ui

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.*
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import cn.yunhaikong.focusflow.R
import cn.yunhaikong.focusflow.model.FocusState
import cn.yunhaikong.focusflow.model.Task
import cn.yunhaikong.focusflow.sync.SyncManager
import cn.yunhaikong.focusflow.util.DateParser
import cn.yunhaikong.focusflow.util.DateUtil

class TaskPanelView(
    context: Context,
    private val syncManager: SyncManager,
    private val onStartFocus: (Int) -> Unit,
    private val onStopFocus: () -> Unit,
    private val onTaskActionCelebration: () -> Unit
) : FrameLayout(context) {

    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val layoutParams: WindowManager.LayoutParams

    private val tvTitle: TextView
    private val tvSyncStatus: TextView
    private val btnPostpone: TextView
    private val btnClose: TextView
    private val tabTasks: TextView
    private val tabFocus: TextView
    private val containerTasks: LinearLayout
    private val containerFocus: LinearLayout
    private val rvTasks: RecyclerView
    private val tvEmptyHint: TextView
    private val etNewTask: EditText
    private val btnAddTask: TextView

    // Focus UI
    private val tvFocusTime: TextView
    private val tvFocusTask: TextView
    private val btnStartFocus: TextView
    private val btnStopFocus: TextView
    private val btnDur15: TextView
    private val btnDur25: TextView
    private val btnDur45: TextView
    private val btnDur60: TextView

    private val taskAdapter: TaskAdapter
    var onCloseRequested: (() -> Unit)? = null
    private var selectedDurationMinutes = 25

    init {
        val view = LayoutInflater.from(context).inflate(R.layout.layout_task_panel, this, true)

        val windowType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            windowType,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }

        val overlayRoot: FrameLayout = view.findViewById(R.id.panel_overlay_root)
        val panelCard: LinearLayout = view.findViewById(R.id.panel_card)

        tvTitle = view.findViewById(R.id.tv_panel_title)
        tvSyncStatus = view.findViewById(R.id.tv_sync_status)
        btnPostpone = view.findViewById(R.id.btn_postpone)
        btnClose = view.findViewById(R.id.btn_close_panel)
        tabTasks = view.findViewById(R.id.tab_tasks)
        tabFocus = view.findViewById(R.id.tab_focus)
        containerTasks = view.findViewById(R.id.container_tasks)
        containerFocus = view.findViewById(R.id.container_focus)
        rvTasks = view.findViewById(R.id.rv_panel_tasks)
        tvEmptyHint = view.findViewById(R.id.tv_empty_hint)
        etNewTask = view.findViewById(R.id.et_new_task)
        btnAddTask = view.findViewById(R.id.btn_add_task)

        tvFocusTime = view.findViewById(R.id.tv_focus_time_display)
        tvFocusTask = view.findViewById(R.id.tv_focus_current_task)
        btnStartFocus = view.findViewById(R.id.btn_start_focus)
        btnStopFocus = view.findViewById(R.id.btn_stop_focus)
        btnDur15 = view.findViewById(R.id.btn_dur_15)
        btnDur25 = view.findViewById(R.id.btn_dur_25)
        btnDur45 = view.findViewById(R.id.btn_dur_45)
        btnDur60 = view.findViewById(R.id.btn_dur_60)

        // Dismiss when tapping the background mask
        overlayRoot.setOnClickListener {
            onCloseRequested?.invoke()
        }
        panelCard.setOnClickListener {
            // Prevent clicks on card from bubbling to overlayRoot
        }
        btnClose.setOnClickListener {
            onCloseRequested?.invoke()
        }

        // Setup Task RecyclerView
        rvTasks.layoutManager = LinearLayoutManager(context)
        taskAdapter = TaskAdapter(
            tasks = emptyList(),
            onTaskToggle = { task ->
                syncManager.updateTask(task)
                if (task.completed) {
                    onTaskActionCelebration()
                }
            },
            onTaskDelete = { task ->
                syncManager.deleteTask(task.id)
            },
            onPriorityToggle = { task ->
                syncManager.updateTask(task)
            }
        )
        rvTasks.adapter = taskAdapter

        // Setup Tab switching
        tabTasks.setOnClickListener { switchTab(true) }
        tabFocus.setOnClickListener { switchTab(false) }

        // Setup Postpone Button
        btnPostpone.setOnClickListener {
            val count = syncManager.postponeUnfinishedTasks()
            val msg = if (count > 0) "已将 ${count} 个未完任务顺延至今日" else "昨日待办均已完成，无顺延项"
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        }

        // Setup Add Task
        btnAddTask.setOnClickListener { submitNewTask() }
        etNewTask.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                submitNewTask()
                true
            } else {
                false
            }
        }

        // Setup Duration buttons
        btnDur15.setOnClickListener { selectDuration(15) }
        btnDur25.setOnClickListener { selectDuration(25) }
        btnDur45.setOnClickListener { selectDuration(45) }
        btnDur60.setOnClickListener { selectDuration(60) }

        btnStartFocus.setOnClickListener {
            onStartFocus(selectedDurationMinutes)
        }
        btnStopFocus.setOnClickListener {
            onStopFocus()
        }

        updateHeaderDate()
    }

    fun updateTasks(tasks: List<Task>) {
        val today = DateUtil.getTodayString()
        val todayTasks = tasks.filter { it.date == today }
        taskAdapter.updateTasks(todayTasks)
        tvEmptyHint.visibility = if (todayTasks.isEmpty()) View.VISIBLE else View.GONE
        rvTasks.visibility = if (todayTasks.isEmpty()) View.GONE else View.VISIBLE
    }

    fun updateSyncStatus(connected: Boolean) {
        if (connected) {
            tvSyncStatus.text = "● 云端已连接"
            tvSyncStatus.setTextColor(ContextCompat.getColor(context, R.color.accent))
        } else {
            tvSyncStatus.text = "○ 离线模式"
            tvSyncStatus.setTextColor(ContextCompat.getColor(context, R.color.text_muted))
        }
    }

    fun updateFocusState(focus: FocusState) {
        val minutes = focus.remainingSeconds / 60
        val seconds = focus.remainingSeconds % 60
        tvFocusTime.text = String.format("%02d:%02d", minutes, seconds)

        if (focus.isRunning) {
            btnStartFocus.visibility = View.GONE
            btnStopFocus.visibility = View.VISIBLE
            tvFocusTask.text = focus.taskTitle ?: "保持专注，全力以赴"
        } else {
            btnStartFocus.visibility = View.VISIBLE
            btnStopFocus.visibility = View.GONE
            tvFocusTask.text = "准备开启专注"
        }
    }

    private fun updateHeaderDate() {
        val todayStr = DateUtil.getTodayString()
        tvTitle.text = DateUtil.formatDisplayDate(todayStr)
    }

    private fun switchTab(showTasks: Boolean) {
        if (showTasks) {
            tabTasks.setBackgroundResource(R.drawable.bg_btn_primary)
            tabTasks.setTextColor(ContextCompat.getColor(context, R.color.white))
            tabFocus.setBackgroundResource(0)
            tabFocus.setTextColor(ContextCompat.getColor(context, R.color.text_secondary))
            containerTasks.visibility = View.VISIBLE
            containerFocus.visibility = View.GONE
        } else {
            tabFocus.setBackgroundResource(R.drawable.bg_btn_primary)
            tabFocus.setTextColor(ContextCompat.getColor(context, R.color.white))
            tabTasks.setBackgroundResource(0)
            tabTasks.setTextColor(ContextCompat.getColor(context, R.color.text_secondary))
            containerTasks.visibility = View.GONE
            containerFocus.visibility = View.VISIBLE
        }
    }

    private fun selectDuration(minutes: Int) {
        selectedDurationMinutes = minutes
        val activeBg = R.drawable.bg_btn_primary
        val normalBg = R.drawable.bg_input_box
        val white = ContextCompat.getColor(context, R.color.white)
        val normal = ContextCompat.getColor(context, R.color.text_primary)

        btnDur15.setBackgroundResource(if (minutes == 15) activeBg else normalBg)
        btnDur15.setTextColor(if (minutes == 15) white else normal)

        btnDur25.setBackgroundResource(if (minutes == 25) activeBg else normalBg)
        btnDur25.setTextColor(if (minutes == 25) white else normal)

        btnDur45.setBackgroundResource(if (minutes == 45) activeBg else normalBg)
        btnDur45.setTextColor(if (minutes == 45) white else normal)

        btnDur60.setBackgroundResource(if (minutes == 60) activeBg else normalBg)
        btnDur60.setTextColor(if (minutes == 60) white else normal)

        tvFocusTime.text = String.format("%02d:00", minutes)
    }

    private fun submitNewTask() {
        val input = etNewTask.text.toString().trim()
        if (input.isEmpty()) return

        val parsed = DateParser.parse(input)
        val task = Task(
            title = parsed.title,
            date = parsed.date,
            time = parsed.time
        )
        syncManager.addTask(task)
        etNewTask.text.clear()
        Toast.makeText(context, "已添加: ${task.title}", Toast.LENGTH_SHORT).show()
    }
}
