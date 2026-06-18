package com.pipboy3000.launcher.telephony.sms

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * No-op service that handles RESPOND_VIA_MESSAGE.
 *
 * Required for default-SMS-app eligibility: the system expects a default SMS app
 * to expose this service. We do not implement quick-reply, so onBind returns null.
 */
class HeadlessSmsSendService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null
}
