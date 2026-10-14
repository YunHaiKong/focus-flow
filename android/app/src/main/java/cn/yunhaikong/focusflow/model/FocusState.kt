package cn.yunhaikong.focusflow.model

import com.google.gson.annotations.SerializedName

data class FocusState(
    @SerializedName("taskId")
    var taskId: String? = null,

    @SerializedName("taskTitle")
    var taskTitle: String? = null,

    @SerializedName("isRunning")
    var isRunning: Boolean = false,

    @SerializedName("isPaused")
    var isPaused: Boolean = false,

    @SerializedName("totalSeconds")
    var totalSeconds: Int = 25 * 60,

    @SerializedName("remainingSeconds")
    var remainingSeconds: Int = 25 * 60,

    @SerializedName("mode")
    var mode: String = "focus"
)
