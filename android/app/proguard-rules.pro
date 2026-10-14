# Keep data models
-keep class cn.yunhaikong.focusflow.model.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
