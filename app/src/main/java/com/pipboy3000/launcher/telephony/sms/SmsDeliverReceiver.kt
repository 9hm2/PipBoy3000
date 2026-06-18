package com.pipboy3000.launcher.telephony.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Receives SMS_DELIVER broadcasts. This is delivered only to the default SMS app,
 * which is also responsible for persisting incoming messages (the system no longer
 * auto-stores them). After persisting, the web UI is notified.
 *
 * Fully defensive: a thrown exception in a receiver can crash the system delivery
 * path, so everything is wrapped in try/catch.
 */
class SmsDeliverReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        try {
            if (intent.action != Telephony.Sms.Intents.SMS_DELIVER_ACTION) return

            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            if (messages == null || messages.isEmpty()) return

            val bodyBuilder = StringBuilder()
            for (msg in messages) {
                try {
                    msg?.messageBody?.let { bodyBuilder.append(it) }
                } catch (e: Throwable) {
                    // skip a malformed part, keep the rest
                }
            }

            val first = messages[0]
            val address = try {
                first?.originatingAddress
            } catch (e: Throwable) {
                null
            } ?: ""
            val timestamp = try {
                first?.timestampMillis ?: System.currentTimeMillis()
            } catch (e: Throwable) {
                System.currentTimeMillis()
            }

            SmsFeature.persistIncoming(context, address, bodyBuilder.toString(), timestamp)

            SmsFeature.emit("window.dispatchEvent(new CustomEvent('pipboy:sms'));")
            SmsFeature.emit("window.dispatchEvent(new CustomEvent('pipboy:refresh'));")
        } catch (e: Throwable) {
            // never crash the system delivery path
        }
    }
}
