package com.teknlgy.happyga;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.twilio.voice.CallInvite;

/**
 * Handles the "Reject" action from the incoming call notification.
 * Rejects the Twilio CallInvite and dismisses the notification.
 */
public class IncomingCallBroadcastReceiver extends BroadcastReceiver {

    private static final String TAG = "HappyGA:CallBR";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "Broadcast received — action: " + action);

        if (IncomingCallNotificationService.ACTION_REJECT.equals(action)) {
            CallInvite callInvite = intent.getParcelableExtra(
                    IncomingCallNotificationService.EXTRA_CALL_INVITE);

            if (callInvite != null) {
                callInvite.reject(context);
                Log.d(TAG, "Call rejected — callSid: " + callInvite.getCallSid());
            }

            // Dismiss the notification
            IncomingCallNotificationService.dismiss(context);
            TwilioVoicePlugin.clearActiveCallInvite();
        }
    }
}
