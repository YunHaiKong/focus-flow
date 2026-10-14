package cn.yunhaikong.focusflow

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import cn.yunhaikong.focusflow.sync.SyncManager
import com.bumptech.glide.Glide

class MainActivity : AppCompatActivity() {

    private lateinit var syncManager: SyncManager
    private lateinit var tvPermissionHint: TextView
    private lateinit var btnRequestOverlay: TextView
    private lateinit var btnToggleBall: Button
    private lateinit var etSyncKey: EditText
    private lateinit var etSyncServer: EditText
    private lateinit var btnSaveSync: Button
    private lateinit var imgLogo: ImageView

    private var isServiceRunning = false

    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
            if (!isGranted) {
                Toast.makeText(this, "建议开启通知权限以保持桌面悬浮桌宠稳定运行", Toast.LENGTH_LONG).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        syncManager = SyncManager.getInstance(this)

        tvPermissionHint = findViewById(R.id.tv_permission_hint)
        btnRequestOverlay = findViewById(R.id.btn_request_overlay_perm)
        btnToggleBall = findViewById(R.id.btn_toggle_floating_ball)
        etSyncKey = findViewById(R.id.et_sync_key)
        etSyncServer = findViewById(R.id.et_sync_server)
        btnSaveSync = findViewById(R.id.btn_save_sync)
        imgLogo = findViewById(R.id.img_app_logo)

        // Load animated Elysia GIF logo
        Glide.with(this).asGif().load(R.drawable.realm).into(imgLogo)

        etSyncKey.setText(syncManager.syncKey)
        etSyncServer.setText(syncManager.serverUrl)

        btnRequestOverlay.setOnClickListener {
            requestOverlayPermission()
        }

        btnToggleBall.setOnClickListener {
            if (!checkOverlayPermission()) {
                requestOverlayPermission()
                return@setOnClickListener
            }

            if (isServiceRunning) {
                stopFloatingService()
            } else {
                startFloatingService()
            }
        }

        btnSaveSync.setOnClickListener {
            val key = etSyncKey.text.toString().trim()
            val server = etSyncServer.text.toString().trim()
            if (key.isNotEmpty()) syncManager.syncKey = key
            if (server.isNotEmpty()) syncManager.serverUrl = server
            syncManager.connectWebSocket()
            Toast.makeText(this, "已保存同步配置，正在连接云端...", Toast.LENGTH_SHORT).show()
        }

        checkNotificationPermission()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionUi()
    }

    private fun checkOverlayPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(this)
        } else {
            true
        }
    }

    private fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivity(intent)
        }
    }

    private fun checkNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun updatePermissionUi() {
        val hasOverlay = checkOverlayPermission()
        if (hasOverlay) {
            tvPermissionHint.text = "悬浮窗权限: 已授权 ✓"
            tvPermissionHint.setTextColor(ContextCompat.getColor(this, R.color.accent))
            btnRequestOverlay.visibility = View.GONE
        } else {
            tvPermissionHint.text = "悬浮窗权限: 未开启 (无法显示桌面桌宠)"
            tvPermissionHint.setTextColor(ContextCompat.getColor(this, R.color.danger))
            btnRequestOverlay.visibility = View.VISIBLE
        }
    }

    private fun startFloatingService() {
        val intent = Intent(this, FloatingPetService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        isServiceRunning = true
        btnToggleBall.text = getString(R.string.btn_stop_service)
        btnToggleBall.setBackgroundColor(ContextCompat.getColor(this, R.color.text_secondary))
        Toast.makeText(this, "爱莉希雅桌面桌宠已出现，返回手机桌面即可查看！", Toast.LENGTH_LONG).show()
    }

    private fun stopFloatingService() {
        val intent = Intent(this, FloatingPetService::class.java)
        stopService(intent)
        isServiceRunning = false
        btnToggleBall.text = getString(R.string.btn_start_service)
        btnToggleBall.setBackgroundColor(ContextCompat.getColor(this, R.color.primary))
        Toast.makeText(this, "悬浮球已收起", Toast.LENGTH_SHORT).show()
    }
}
