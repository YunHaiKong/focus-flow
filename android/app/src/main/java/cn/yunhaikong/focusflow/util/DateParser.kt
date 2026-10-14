package cn.yunhaikong.focusflow.util

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.regex.Pattern

data class ParsedTaskInfo(
    val title: String,
    val date: String,
    val time: String?
)

object DateParser {
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

    fun parse(input: String): ParsedTaskInfo {
        var text = input.trim()
        val cal = Calendar.getInstance()
        var dateMatched = false
        var timeMatched: String? = null

        // 1. Check relative date keywords
        when {
            text.startsWith("大后天") -> {
                cal.add(Calendar.DAY_OF_YEAR, 3)
                text = text.substring(3).trim()
                dateMatched = true
            }
            text.startsWith("后天") -> {
                cal.add(Calendar.DAY_OF_YEAR, 2)
                text = text.substring(2).trim()
                dateMatched = true
            }
            text.startsWith("明天") -> {
                cal.add(Calendar.DAY_OF_YEAR, 1)
                text = text.substring(2).trim()
                dateMatched = true
            }
            text.startsWith("今天") -> {
                text = text.substring(2).trim()
                dateMatched = true
            }
        }

        // 2. Check Weekday keywords: 周一..周日 / 星期一..星期日 / 礼拜一..礼拜日
        val weekRegex = Pattern.compile("^(下周|本周|这周)?([周|星期|礼拜])([一|二|三|四|五|六|日|天])")
        val weekMatcher = weekRegex.matcher(text)
        if (!dateMatched && weekMatcher.find()) {
            val prefix = weekMatcher.group(1) ?: ""
            val dayChar = weekMatcher.group(3) ?: "一"
            val targetDayOfWeek = when (dayChar) {
                "一" -> Calendar.MONDAY
                "二" -> Calendar.TUESDAY
                "三" -> Calendar.WEDNESDAY
                "四" -> Calendar.THURSDAY
                "五" -> Calendar.FRIDAY
                "六" -> Calendar.SATURDAY
                "日", "天" -> Calendar.SUNDAY
                else -> Calendar.MONDAY
            }
            var currentDayOfWeek = cal.get(Calendar.DAY_OF_WEEK)
            var diff = targetDayOfWeek - currentDayOfWeek
            if (prefix == "下周") {
                diff += 7
            } else if (diff <= 0) {
                diff += 7
            }
            cal.add(Calendar.DAY_OF_YEAR, diff)
            text = text.substring(weekMatcher.end()).trim()
            dateMatched = true
        }

        // 3. Check time: 下午3点, 晚上8点半, 14:30, 9点40分
        val timeRegex = Pattern.compile("^(上午|中午|下午|晚上|早上|清晨)?\\s*(\\d{1,2})([:点时])?(\\d{1,2})?([分半])?")
        val timeMatcher = timeRegex.matcher(text)
        if (timeMatcher.find()) {
            val period = timeMatcher.group(1)
            var hour = timeMatcher.group(2)?.toIntOrNull() ?: -1
            val sep = timeMatcher.group(3)
            val minStr = timeMatcher.group(4)
            val minSuffix = timeMatcher.group(5)

            if (hour in 0..23) {
                if (period == "下午" || period == "晚上") {
                    if (hour in 1..11) hour += 12
                } else if (period == "中午" && hour in 1..2) {
                    hour += 12
                }

                var minute = 0
                if (minSuffix == "半") {
                    minute = 30
                } else if (!minStr.isNullOrEmpty()) {
                    minute = minStr.toIntOrNull() ?: 0
                }

                timeMatched = String.format(Locale.getDefault(), "%02d:%02d", hour, minute)
                text = text.substring(timeMatcher.end()).trim()
            }
        }

        // Clean leading punctuation if any
        text = text.replace(Regex("^[，,、\\s]+"), "").trim()
        if (text.isEmpty()) {
            text = input.trim()
        }

        val targetDateStr = dateFormat.format(cal.time)
        return ParsedTaskInfo(
            title = text,
            date = targetDateStr,
            time = timeMatched
        )
    }
}
