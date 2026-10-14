package cn.yunhaikong.focusflow.model

import com.google.gson.annotations.SerializedName
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

data class Task(
    @SerializedName("id")
    var id: String = UUID.randomUUID().toString(),

    @SerializedName("title")
    var title: String = "",

    @SerializedName("date")
    var date: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()),

    @SerializedName("time")
    var time: String? = null,

    @SerializedName("completed")
    var completed: Boolean = false,

    @SerializedName("priority")
    var priority: Int = 0,

    @SerializedName("postponedFrom")
    var postponedFrom: String? = null,

    @SerializedName("postponeCount")
    var postponeCount: Int = 0,

    @SerializedName("createdAt")
    var createdAt: Long = System.currentTimeMillis(),

    @SerializedName("updatedAt")
    var updatedAt: Long = System.currentTimeMillis()
) {
    fun calculatePostponeDays(): Int {
        if (postponeCount > 0) return postponeCount
        if (!postponedFrom.isNullOrEmpty() && postponedFrom != date) {
            return try {
                val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                val from = sdf.parse(postponedFrom!!)?.time ?: return 1
                val to = sdf.parse(date)?.time ?: return 1
                val diffDays = ((to - from) / (1000 * 60 * 60 * 24)).toInt()
                if (diffDays > 0) diffDays else 1
            } catch (e: Exception) {
                1
            }
        }
        return 0
    }
}
