package cn.yunhaikong.focusflow.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.util.DisplayMetrics
import android.view.GestureDetector
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import cn.yunhaikong.focusflow.R
import com.bumptech.glide.Glide
import kotlin.math.abs

class FloatingPetView(context: Context) : FrameLayout(context) {

    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val layoutParams: WindowManager.LayoutParams

    private val imgSprite: ImageView
    private val tvBadge: TextView

    var onPetClick: (() -> Unit)? = null
    var onPetDoubleClick: (() -> Unit)? = null

    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var isDragging = false

    private val screenWidth: Int
    private val screenHeight: Int

    private val gestureDetector: GestureDetector

    init {
        val displayMetrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getMetrics(displayMetrics)
        screenWidth = displayMetrics.widthPixels
        screenHeight = displayMetrics.heightPixels

        val view = LayoutInflater.from(context).inflate(R.layout.view_floating_pet, this, true)
        imgSprite = view.findViewById(R.id.img_pet_sprite)
        tvBadge = view.findViewById(R.id.tv_badge)

        val windowType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            windowType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = screenWidth - 180
            y = screenHeight / 3
        }

        gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                onPetClick?.invoke()
                return true
            }

            override fun onDoubleTap(e: MotionEvent): Boolean {
                onPetDoubleClick?.invoke()
                return true
            }
        })

        loadSprite(R.drawable.realm)
    }

    fun loadSprite(drawableResId: Int) {
        Glide.with(context)
            .asGif()
            .load(drawableResId)
            .into(imgSprite)
    }

    fun updateBadge(count: Int, isFocusing: Boolean = false, focusRemainingMin: Int = 0) {
        if (isFocusing) {
            tvBadge.visibility = View.VISIBLE
            tvBadge.setBackgroundResource(R.drawable.bg_badge_green)
            tvBadge.text = "${focusRemainingMin}m"
        } else if (count > 0) {
            tvBadge.visibility = View.VISIBLE
            tvBadge.setBackgroundResource(R.drawable.bg_badge_red)
            tvBadge.text = if (count > 99) "99+" else count.toString()
        } else {
            tvBadge.visibility = View.GONE
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        gestureDetector.onTouchEvent(event)

        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                initialX = layoutParams.x
                initialY = layoutParams.y
                initialTouchX = event.rawX
                initialTouchY = event.rawY
                isDragging = false
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = (event.rawX - initialTouchX).toInt()
                val dy = (event.rawY - initialTouchY).toInt()

                if (abs(dx) > 12 || abs(dy) > 12) {
                    isDragging = true
                }

                if (isDragging) {
                    layoutParams.x = initialX + dx
                    layoutParams.y = initialY + dy
                    try {
                        windowManager.updateViewLayout(this, layoutParams)
                    } catch (e: Exception) {}
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                if (isDragging) {
                    snapToEdge()
                }
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun snapToEdge() {
        val targetX = if (layoutParams.x + width / 2 < screenWidth / 2) {
            10 // Snap to left edge
        } else {
            screenWidth - width - 10 // Snap to right edge
        }

        val startX = layoutParams.x
        val animator = ValueAnimator.ofInt(startX, targetX)
        animator.duration = 200
        animator.interpolator = DecelerateInterpolator()
        animator.addUpdateListener { animation ->
            layoutParams.x = animation.animatedValue as Int
            try {
                windowManager.updateViewLayout(this@FloatingPetView, layoutParams)
            } catch (e: Exception) {}
        }
        animator.start()
    }
}
