package com.pipboy3000.launcher.notifications

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.pipboy3000.launcher.bridge.NotificationStore

/**
 * Captures the device's active notifications and pushes them into
 * [NotificationStore] for the Pip-Boy web UI to read.
 *
 * The system only delivers notifications after the user grants notification
 * access in Settings. Until then [getActiveNotifications] may be empty or
 * throw a SecurityException; every path here is defensive so the service can
 * never crash the system.
 */
class PipNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        try {
            NotificationStore.attach(this)
            refresh()
        } catch (e: Throwable) {
            // swallow
        }
    }

    override fun onListenerDisconnected() {
        try {
            NotificationStore.detach()
        } catch (e: Throwable) {
            // swallow
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        try {
            refresh()
            // Surface the newly posted notification as an in-launcher popup
            // (only acted on while the launcher is foreground; see the host).
            val item = toItem(sbn)
            if (item != null && (item.title.isNotEmpty() || item.text.isNotEmpty())) {
                NotificationStore.notifyPosted(item)
            }
        } catch (e: Throwable) {
            // swallow
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        try {
            refresh()
        } catch (e: Throwable) {
            // swallow
        }
    }

    /**
     * Cancel the notification identified by [key]. The system then delivers
     * onNotificationRemoved, which triggers a [refresh]. Returns true if the
     * cancel was invoked without throwing.
     */
    fun requestCancel(key: String): Boolean {
        return try {
            cancelNotification(key)
            true
        } catch (e: Throwable) {
            false
        }
    }

    /**
     * Read the current active notifications, map them to store items
     * (newest first) and publish them to [NotificationStore].
     */
    private fun refresh() {
        val active: Array<StatusBarNotification>? = try {
            activeNotifications
        } catch (e: SecurityException) {
            return
        } catch (e: Throwable) {
            return
        }

        if (active == null) {
            NotificationStore.update(emptyList())
            return
        }

        val items = ArrayList<NotificationStore.Item>(active.size)
        for (sbn in active) {
            try {
                val item = toItem(sbn) ?: continue
                items.add(item)
            } catch (e: Throwable) {
                // skip this notification, keep the rest
            }
        }

        items.sortByDescending { it.time }

        try {
            NotificationStore.update(items)
        } catch (e: Throwable) {
            // swallow
        }
    }

    private fun toItem(sbn: StatusBarNotification?): NotificationStore.Item? {
        if (sbn == null) return null
        val notification = sbn.notification ?: return null
        val pkg = sbn.packageName ?: return null

        val extras = try {
            notification.extras
        } catch (e: Throwable) {
            null
        }

        val title = try {
            extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        } catch (e: Throwable) {
            ""
        }

        val text = try {
            extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
                ?: extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
                ?: ""
        } catch (e: Throwable) {
            ""
        }

        // Skip empty group-summary noise (no user-visible content).
        val isGroupSummary = (notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0
        if (isGroupSummary && title.isEmpty() && text.isEmpty()) return null

        val appLabel = resolveLabel(pkg)

        return NotificationStore.Item(
            key = sbn.key,
            packageName = pkg,
            appLabel = appLabel,
            title = title,
            text = text,
            time = sbn.postTime,
            clearable = try { sbn.isClearable } catch (e: Throwable) { false },
            contentIntent = notification.contentIntent,
        )
    }

    /** Human-readable app name for [pkg]; falls back to the package name. */
    private fun resolveLabel(pkg: String): String {
        return try {
            val pm = packageManager
            @Suppress("DEPRECATION")
            val info = pm.getApplicationInfo(pkg, 0)
            pm.getApplicationLabel(info)?.toString() ?: pkg
        } catch (e: PackageManager.NameNotFoundException) {
            pkg
        } catch (e: Throwable) {
            pkg
        }
    }
}
