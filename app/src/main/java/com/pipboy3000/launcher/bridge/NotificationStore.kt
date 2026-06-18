package com.pipboy3000.launcher.bridge

import android.app.PendingIntent
import com.pipboy3000.launcher.notifications.PipNotificationListener
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap

/**
 * Shared, thread-safe holder for the currently active notifications.
 *
 * The [PipNotificationListener] service pushes snapshots into this object via
 * [attach] / [detach] / [update]; the web UI bridge ([LauncherBridge]) reads
 * them back through [snapshotJson] / [dismiss] / [open].
 *
 * Every method is fully defensive and never throws.
 */
object NotificationStore {

    /**
     * A single active notification, as captured by the listener service.
     */
    data class Item(
        val key: String,
        val packageName: String,
        val appLabel: String,
        val title: String,
        val text: String,
        val time: Long,
        val clearable: Boolean,
        val contentIntent: PendingIntent?,
    )

    /** Pre-rendered JSON array, newest first. Defaults to an empty array. */
    @Volatile
    private var snapshot: String = "[]"

    /** key -> contentIntent, used to launch a notification via [open]. */
    private val intents = ConcurrentHashMap<String, PendingIntent>()

    /** Weak reference to the live service so we never leak it. */
    @Volatile
    private var service: WeakReference<PipNotificationListener>? = null

    // ---------------------------------------------------------------------
    // Service-facing API
    // ---------------------------------------------------------------------

    /** Called by the service from onListenerConnected(). */
    fun attach(service: PipNotificationListener) {
        try {
            this.service = WeakReference(service)
        } catch (e: Throwable) {
            // swallow
        }
    }

    /** Called by the service from onListenerDisconnected(). */
    fun detach() {
        try {
            service = null
            intents.clear()
            snapshot = "[]"
        } catch (e: Throwable) {
            // swallow
        }
    }

    /**
     * Replace the current set of notifications. Rebuilds the JSON snapshot and
     * the key -> contentIntent map. [items] is expected newest-first.
     */
    fun update(items: List<Item>) {
        try {
            val arr = JSONArray()
            val freshIntents = HashMap<String, PendingIntent>()
            for (item in items) {
                try {
                    arr.put(
                        JSONObject()
                            .put("key", item.key)
                            .put("packageName", item.packageName)
                            .put("appLabel", item.appLabel)
                            .put("title", item.title)
                            .put("text", item.text)
                            .put("time", item.time)
                            .put("clearable", item.clearable)
                    )
                    item.contentIntent?.let { freshIntents[item.key] = it }
                } catch (e: Throwable) {
                    // skip a malformed item, keep the rest
                }
            }
            snapshot = arr.toString()
            intents.clear()
            intents.putAll(freshIntents)
        } catch (e: Throwable) {
            // leave the previous snapshot in place
        }
    }

    // ---------------------------------------------------------------------
    // Bridge-facing API
    // ---------------------------------------------------------------------

    /**
     * JSON array of active notifications, newest first. Each entry:
     * {"key","packageName","appLabel","title","text","time","clearable"}.
     */
    fun snapshotJson(): String = snapshot

    /** Ask the service to cancel the notification with [key]. */
    fun dismiss(key: String): Boolean {
        return try {
            service?.get()?.requestCancel(key) ?: false
        } catch (e: Throwable) {
            false
        }
    }

    /** Fire the stored contentIntent for [key]. */
    fun open(key: String): Boolean {
        return try {
            val pi = intents[key] ?: return false
            pi.send()
            true
        } catch (e: PendingIntent.CanceledException) {
            false
        } catch (e: Throwable) {
            false
        }
    }
}
