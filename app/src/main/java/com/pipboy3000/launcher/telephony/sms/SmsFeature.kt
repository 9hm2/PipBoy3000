package com.pipboy3000.launcher.telephony.sms

import android.app.role.RoleManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsManager

/**
 * Central, thread-safe entry point for the launcher's default-SMS-app feature.
 *
 * The orchestrator sets [emitter] (which runs a JS snippet on the WebView, on the
 * UI thread) and wires the activity/bridge to the static helpers here.
 *
 * Every method is fully defensive and must never crash a system broadcast/receiver.
 */
object SmsFeature {

    /**
     * Orchestrator-supplied sink that runs a JS snippet on the WebView (UI thread).
     * Used to notify the web layer about incoming SMS.
     */
    @Volatile
    var emitter: ((String) -> Unit)? = null

    /** Run [js] on the WebView via [emitter]. Never throws. */
    fun emit(js: String) {
        try {
            emitter?.invoke(js)
        } catch (e: Throwable) {
            // swallow
        }
    }

    /** True if this app is currently the system default SMS app. */
    fun isDefaultSmsApp(ctx: Context): Boolean {
        return try {
            Telephony.Sms.getDefaultSmsPackage(ctx) == ctx.packageName
        } catch (e: Throwable) {
            false
        }
    }

    /**
     * Send an SMS via [SmsManager], splitting long bodies into multiple parts,
     * then persist a copy into the Sent box. Returns false on any failure.
     *
     * Requires SEND_SMS (declared by the orchestrator).
     */
    fun sendSms(ctx: Context, address: String, body: String): Boolean {
        return try {
            val smsManager = smsManager(ctx) ?: return false
            val parts = smsManager.divideMessage(body)
            smsManager.sendMultipartTextMessage(address, null, parts, null, null)

            try {
                val values = ContentValues().apply {
                    put(Telephony.Sms.ADDRESS, address)
                    put(Telephony.Sms.BODY, body)
                    put(Telephony.Sms.DATE, System.currentTimeMillis())
                    put(Telephony.Sms.READ, 1)
                }
                ctx.contentResolver.insert(Telephony.Sms.Sent.CONTENT_URI, values)
            } catch (e: Throwable) {
                // sending succeeded even if persisting the copy did not
            }

            true
        } catch (e: Throwable) {
            false
        }
    }

    /**
     * Build the intent that asks the user to make this app the default SMS app.
     * Returns null when no mechanism is available.
     *
     * The orchestrator's Activity is responsible for launching the returned intent.
     */
    fun requestDefaultIntent(ctx: Context): Intent? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = ctx.getSystemService(RoleManager::class.java)
                roleManager?.createRequestRoleIntent(RoleManager.ROLE_SMS)
            } else {
                @Suppress("DEPRECATION")
                Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT)
                    .putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, ctx.packageName)
            }
        } catch (e: Throwable) {
            null
        }
    }

    /**
     * Persist an incoming SMS into the Inbox. As the default SMS app, the system
     * no longer auto-stores incoming messages, so we must do it ourselves.
     */
    fun persistIncoming(ctx: Context, address: String, body: String, timestampMs: Long) {
        try {
            val values = ContentValues().apply {
                put(Telephony.Sms.ADDRESS, address)
                put(Telephony.Sms.BODY, body)
                put(Telephony.Sms.DATE, timestampMs)
                put(Telephony.Sms.READ, 0)
                put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_INBOX)
            }
            ctx.contentResolver.insert(Telephony.Sms.Inbox.CONTENT_URI, values)
        } catch (e: Throwable) {
            // swallow
        }
    }

    /** Resolve an [SmsManager] in an API-appropriate way. */
    private fun smsManager(ctx: Context): SmsManager? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                ctx.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
        } catch (e: Throwable) {
            null
        }
    }
}
