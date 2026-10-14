package cn.yunhaikong.focusflow.ui

import android.graphics.Paint
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import cn.yunhaikong.focusflow.R
import cn.yunhaikong.focusflow.model.Task

class TaskAdapter(
    private var tasks: List<Task>,
    private val onTaskToggle: (Task) -> Unit,
    private val onTaskDelete: (Task) -> Unit,
    private val onPriorityToggle: (Task) -> Unit
) : RecyclerView.Adapter<TaskAdapter.TaskViewHolder>() {

    class TaskViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val cbDone: CheckBox = view.findViewById(R.id.cb_done)
        val tvTitle: TextView = view.findViewById(R.id.tv_task_title)
        val tvPostponeTag: TextView = view.findViewById(R.id.tv_postpone_tag)
        val tvMeta: TextView = view.findViewById(R.id.tv_task_meta)
        val btnDelete: TextView = view.findViewById(R.id.btn_delete)
        val btnPriority: TextView = view.findViewById(R.id.btn_priority)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TaskViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_task, parent, false)
        return TaskViewHolder(view)
    }

    override fun onBindViewHolder(holder: TaskViewHolder, position: Int) {
        val task = tasks[position]

        holder.tvTitle.text = task.title

        // Completed strike-through styling
        if (task.completed) {
            holder.tvTitle.paintFlags = holder.tvTitle.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
            holder.tvTitle.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.text_muted))
        } else {
            holder.tvTitle.paintFlags = holder.tvTitle.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
            holder.tvTitle.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.text_primary))
        }

        // Postpone Tag ("顺延 N 天")
        val postponeDays = task.calculatePostponeDays()
        if (postponeDays > 0) {
            holder.tvPostponeTag.visibility = View.VISIBLE
            holder.tvPostponeTag.text = "顺延 $postponeDays 天"
            if (task.completed) {
                holder.tvPostponeTag.setBackgroundResource(R.drawable.bg_postpone_tag_done)
                holder.tvPostponeTag.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.text_muted))
            } else {
                holder.tvPostponeTag.setBackgroundResource(R.drawable.bg_postpone_tag)
                holder.tvPostponeTag.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.postpone_text))
            }
        } else {
            holder.tvPostponeTag.visibility = View.GONE
        }

        // Priority icon
        if (task.priority > 0) {
            holder.btnPriority.text = "★"
            holder.btnPriority.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.postpone_text))
        } else {
            holder.btnPriority.text = "☆"
            holder.btnPriority.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.text_muted))
        }

        // Meta info (time or date)
        if (!task.time.isNullOrEmpty()) {
            holder.tvMeta.text = "计划时间: ${task.time}"
            holder.tvMeta.visibility = View.VISIBLE
        } else {
            holder.tvMeta.visibility = View.GONE
        }

        // Avoid triggering listener when binding
        holder.cbDone.setOnCheckedChangeListener(null)
        holder.cbDone.isChecked = task.completed

        holder.cbDone.setOnCheckedChangeListener { _, isChecked ->
            task.completed = isChecked
            onTaskToggle(task)
        }

        holder.btnDelete.setOnClickListener {
            onTaskDelete(task)
        }

        holder.btnPriority.setOnClickListener {
            task.priority = if (task.priority > 0) 0 else 1
            onPriorityToggle(task)
        }
    }

    override fun getItemCount(): Int = tasks.size

    fun updateTasks(newTasks: List<Task>) {
        this.tasks = newTasks
        notifyDataSetChanged()
    }
}
