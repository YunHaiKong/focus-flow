package cn.yunhaikong.focusflow.sync

import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import cn.yunhaikong.focusflow.model.FocusState
import cn.yunhaikong.focusflow.model.Task
import cn.yunhaikong.focusflow.util.DateUtil
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import okhttp3.*
import java.util.UUID
import java.util.concurrent.TimeUnit

class SyncManager private constructor(private val context: Context) {

    companion object {
        @Volatile
        private var instance: SyncManager? = null

        fun getInstance(context: Context): SyncManager {
            return instance ?: synchronized(this) {
                instance ?: SyncManager(context.applicationContext).also { instance = it }
            }
        }
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences("focus_flow_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    var serverUrl: String
        get() = prefs.getString("sync_server_url", "https://focus-flow-y68c.onrender.com") ?: "https://focus-flow-y68c.onrender.com"
        set(value) = prefs.edit().putString("sync_server_url", value.trim().removeSuffix("/")).apply()

    var syncKey: String
        get() = prefs.getString("sync_key", "ff_flow_888") ?: "ff_flow_888"
        set(value) = prefs.edit().putString("sync_key", value.trim()).apply()

    val deviceId: String
        get() {
            var id = prefs.getString("device_id", null)
            if (id == null) {
                id = "android_" + UUID.randomUUID().toString().substring(0, 8)
                prefs.edit().putString("device_id", id).apply()
            }
            return id
        }

    private var webSocket: WebSocket? = null
    var isConnected: Boolean = false
        private set

    private var reconnectDelay = 2000L
    private val reconnectRunnable = Runnable { connectWebSocket() }
    private val pingRunnable = object : Runnable {
        override fun run() {
            webSocket?.send("{\"type\":\"PING\"}")
            mainHandler.postDelayed(this, 25000)
        }
    }

    // In-memory tasks map: taskId -> Task
    private val tasksMap = LinkedHashMap<String, Task>()
    private var currentFocusState = FocusState()

    // Listeners
    private val taskListeners = mutableListOf<(List<Task>) -> Unit>()
    private val focusListeners = mutableListOf<(FocusState) -> Unit>()
    private val connectionListeners = mutableListOf<(Boolean) -> Unit>()

    init {
        loadTasksFromCache()
    }

    fun addTasksListener(listener: (List<Task>) -> Unit) {
        taskListeners.add(listener)
        listener(getTasksList())
    }

    fun removeTasksListener(listener: (List<Task>) -> Unit) {
        taskListeners.remove(listener)
    }

    fun addFocusListener(listener: (FocusState) -> Unit) {
        focusListeners.add(listener)
        listener(currentFocusState)
    }

    fun removeFocusListener(listener: (FocusState) -> Unit) {
        focusListeners.remove(listener)
    }

    fun addConnectionListener(listener: (Boolean) -> Unit) {
        connectionListeners.add(listener)
        listener(isConnected)
    }

    fun removeConnectionListener(listener: (Boolean) -> Unit) {
        connectionListeners.remove(listener)
    }

    fun getTasksList(): List<Task> {
        return synchronized(tasksMap) {
            tasksMap.values.toList().sortedWith(compareBy<Task> { it.completed }.thenByDescending { it.priority })
        }
    }

    fun getTodayTasks(): List<Task> {
        val today = DateUtil.getTodayString()
        return synchronized(tasksMap) {
            tasksMap.values.filter { it.date == today }
                .sortedWith(compareBy<Task> { it.completed }.thenByDescending { it.priority })
        }
    }

    fun getCurrentFocus(): FocusState = currentFocusState

    fun connectWebSocket() {
        if (syncKey.isEmpty()) return

        val wsUrl = (if (serverUrl.startsWith("https://")) {
            serverUrl.replace("https://", "wss://")
        } else {
            serverUrl.replace("http://", "ws://")
        }) + "/ws?key=$syncKey&deviceId=$deviceId"

        val request = Request.Builder().url(wsUrl).build()

        webSocket?.close(1000, "Reconnecting")
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                isConnected = true
                reconnectDelay = 2000L
                mainHandler.post {
                    connectionListeners.forEach { it(true) }
                    mainHandler.removeCallbacks(pingRunnable)
                    mainHandler.post(pingRunnable)
                }
            }

            override fun onMessage(ws: WebSocket, text: String) {
                handleIncomingMessage(text)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                handleDisconnect()
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                handleDisconnect()
            }
        })
    }

    private fun handleDisconnect() {
        isConnected = false
        mainHandler.post {
            connectionListeners.forEach { it(false) }
            mainHandler.removeCallbacks(pingRunnable)
            mainHandler.removeCallbacks(reconnectRunnable)
            mainHandler.postDelayed(reconnectRunnable, reconnectDelay)
            reconnectDelay = (reconnectDelay * 1.5).toLong().coerceAtMost(30000L)
        }
    }

    fun disconnect() {
        mainHandler.removeCallbacks(reconnectRunnable)
        mainHandler.removeCallbacks(pingRunnable)
        webSocket?.close(1000, "App paused/stopped")
        webSocket = null
        isConnected = false
        connectionListeners.forEach { it(false) }
    }

    private fun handleIncomingMessage(text: String) {
        try {
            val json = gson.fromJson(text, JsonObject::class.java)
            val type = json.get("type")?.asString ?: return
            val payload = json.getAsJsonObject("payload") ?: return

            when (type) {
                "INIT_SNAPSHOT", "TASK_MUTATION" -> {
                    if (payload.has("tasks")) {
                        val taskListType = object : TypeToken<List<Task>>() {}.type
                        val incomingTasks: List<Task> = gson.fromJson(payload.get("tasks"), taskListType)
                        mergeTasks(incomingTasks)
                    }
                    if (payload.has("focusState")) {
                        val incomingFocus: FocusState = gson.fromJson(payload.get("focusState"), FocusState::class.java)
                        currentFocusState = incomingFocus
                        mainHandler.post { focusListeners.forEach { it(currentFocusState) } }
                    }
                }
                "FOCUS_CHANGE" -> {
                    if (payload.has("focusState")) {
                        val incomingFocus: FocusState = gson.fromJson(payload.get("focusState"), FocusState::class.java)
                        currentFocusState = incomingFocus
                        mainHandler.post { focusListeners.forEach { it(currentFocusState) } }
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun mergeTasks(incomingTasks: List<Task>) {
        var changed = false
        synchronized(tasksMap) {
            for (task in incomingTasks) {
                tasksMap[task.id] = task
                changed = true
            }
        }
        if (changed) {
            saveTasksToCache()
            mainHandler.post {
                val list = getTasksList()
                taskListeners.forEach { it(list) }
            }
        }
    }

    fun addTask(task: Task) {
        synchronized(tasksMap) {
            tasksMap[task.id] = task
        }
        saveTasksToCache()
        notifyTasksChanged()
        pushTaskMutation(listOf(task))
    }

    fun updateTask(task: Task) {
        task.updatedAt = System.currentTimeMillis()
        synchronized(tasksMap) {
            tasksMap[task.id] = task
        }
        saveTasksToCache()
        notifyTasksChanged()
        pushTaskMutation(listOf(task))
    }

    fun deleteTask(taskId: String) {
        synchronized(tasksMap) {
            tasksMap.remove(taskId)
        }
        saveTasksToCache()
        notifyTasksChanged()

        // Push deletion to server
        val deletedJson = JsonObject().apply {
            addProperty("id", taskId)
            addProperty("deleted", true)
            addProperty("updatedAt", System.currentTimeMillis())
        }
        val mutation = JsonObject().apply {
            addProperty("type", "TASK_MUTATION")
            val payload = JsonObject()
            val arr = com.google.gson.JsonArray()
            arr.add(deletedJson)
            payload.add("tasks", arr)
            add("payload", payload)
        }
        sendJsonOverWs(mutation.toString())
    }

    /**
     * 未完顺延 (Postpone all uncompleted tasks from before today to today)
     * Calculates days postponed and marks them.
     */
    fun postponeUnfinishedTasks(): Int {
        val today = DateUtil.getTodayString()
        val modified = mutableListOf<Task>()

        synchronized(tasksMap) {
            for (task in tasksMap.values) {
                if (!task.completed && task.date < today) {
                    val originalDate = task.postponedFrom ?: task.date
                    val daysDiff = DateUtil.daysBetween(originalDate, today).coerceAtLeast(1)
                    task.postponedFrom = originalDate
                    task.postponeCount = daysDiff
                    task.date = today
                    task.updatedAt = System.currentTimeMillis()
                    modified.add(task)
                }
            }
        }

        if (modified.isNotEmpty()) {
            saveTasksToCache()
            notifyTasksChanged()
            pushTaskMutation(modified)
        }
        return modified.size
    }

    fun updateFocus(focusState: FocusState) {
        this.currentFocusState = focusState
        mainHandler.post { focusListeners.forEach { it(currentFocusState) } }

        val msg = JsonObject().apply {
            addProperty("type", "FOCUS_CHANGE")
            val payload = JsonObject()
            payload.add("focusState", gson.toJsonTree(focusState))
            add("payload", payload)
        }
        sendJsonOverWs(msg.toString())
    }

    private fun pushTaskMutation(tasks: List<Task>) {
        val msg = JsonObject().apply {
            addProperty("type", "TASK_MUTATION")
            val payload = JsonObject()
            payload.add("tasks", gson.toJsonTree(tasks))
            add("payload", payload)
        }
        sendJsonOverWs(msg.toString())
    }

    private fun sendJsonOverWs(jsonStr: String) {
        if (isConnected && webSocket != null) {
            webSocket?.send(jsonStr)
        }
    }

    private fun notifyTasksChanged() {
        val list = getTasksList()
        mainHandler.post { taskListeners.forEach { it(list) } }
    }

    private fun saveTasksToCache() {
        try {
            val list = synchronized(tasksMap) { tasksMap.values.toList() }
            val json = gson.toJson(list)
            prefs.edit().putString("tasks_cache_json", json).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun loadTasksFromCache() {
        try {
            val json = prefs.getString("tasks_cache_json", null) ?: return
            val taskListType = object : TypeToken<List<Task>>() {}.type
            val list: List<Task> = gson.fromJson(json, taskListType)
            synchronized(tasksMap) {
                tasksMap.clear()
                list.forEach { tasksMap[it.id] = it }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
