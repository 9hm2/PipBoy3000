package com.pipboy3000.launcher.telephony.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * No-op MMS (WAP_PUSH_DELIVER) receiver.
 *
 * It only needs to exist (and be declared in the manifest) so the app is eligible
 * to be selected as the default SMS app. We do not currently handle MMS payloads.
 */
class MmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        // Intentionally a no-op. Defensive: do nothing, never throw.
    }
}
