package com.teknlgy.happyga;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.twilio.voice.CallInvite;
import com.twilio.voice.CancelledCallInvite;

/**
 * Manages system notifications for incoming Twilio Voice calls.
 *
 * When a push arrives via FCM while the app is backgrounded/closed,
 * this class shows a high-priority notification with Accept/Reject actions.
 * Tapping Accept or the notification body launches MainActivity with
 * the CallInvite extras so TwilioVoicePlugin can accept the call and
 * notify the Capacitor WebView.
 */
public class IncomingCallNotificationService {

    private static final String TAG = "HappyGA:CallNotif";
    private static final String CHANNEL_ID = "happyga_incoming_calls";
    private static final int NOTIFICATION_ID = 7001;

    // Intent extras & actions
    public static final String EXTRA_CALL_INVITE = "EXTRA_CALL_INVITE";
    public static final String ACTION_ACCEPT = "com.teknlgy.happyga.ACTION_ACCEPT";
    public static final String ACTION_REJECT = "com.teknlgy.happyga.ACTION_REJECT";
    public static final String ACTION_CANCEL = "com.teknlgy.happyga.ACTION_CANCEL";

    /**
     * Show a heads-up notification for an incoming call.
     */
    public static void showIncomingCallNotification(Context context, CallInvite callInvite) {
        createNotificationChannel(context);

        String callerName = callInvite.getFrom() != null ? callInvite.getFrom() : "Unknown caller";

        // Extract callerName from custom parameters if available
        if (callInvite.getCustomParameters() != null
                && callInvite.getCustomParameters().containsKey("callerName")) {
            String name = callInvite.getCustomParameters().get("callerName");
            if (name != null && !name.isEmpty()) {
                callerName = name;
            }
        }

        // Strip "client:" prefix from Twilio identity
        if (callerName.startsWith("client:")) {
            callerName = callerName.substring(7);
        }

        // Accept action — launches MainActivity with the CallInvite
        Intent acceptIntent = new Intent(context, MainActivity.class);
        acceptIntent.setAction(ACTION_ACCEPT);
        acceptIntent.putExtra(EXTRA_CALL_INVITE, callInvite);
        acceptIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent acceptPending = PendingIntent.getActivity(
                context, 0, acceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Reject action — just cancels the notification and rejects the invite
        Intent rejectIntent = new Intent(context, IncomingCallBroadcastReceiver.class);
        rejectIntent.setAction(ACTION_REJECT);
        rejectIntent.putExtra(EXTRA_CALL_INVITE, callInvite);
        PendingIntent rejectPending = PendingIntent.getBroadcast(
                context, 1, rejectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("Incoming Call")
                .setContentText(callerName + " is calling...")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(acceptPending, true)
                .setOngoing(true)
                .setAutoCancel(false)
                .addAction(android.R.drawable.ic_menu_call, "Accept", acceptPending)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Reject", rejectPending)
                .build();

        NotificationManager mgr = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (mgr != null) {
            mgr.notify(NOTIFICATION_ID, notification);
        }

        // Also store the active invite so TwilioVoicePlugin can pick it up
        // when the app is brought to the foreground
        TwilioVoicePlugin.setActiveCallInvite(callInvite);

        Log.d(TAG, "Incoming call notification shown — caller: " + callerName);
    }

    /**
     * Cancel the incoming call notification (caller hung up before answer).
     */
    public static void cancelIncomingCallNotification(Context context,
                                                       CancelledCallInvite cancelledCallInvite) {
        NotificationManager mgr = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (mgr != null) {
            mgr.cancel(NOTIFICATION_ID);
        }

        TwilioVoicePlugin.clearActiveCallInvite();

        Log.d(TAG, "Incoming call notification cancelled — callSid: "
                + cancelledCallInvite.getCallSid());
    }

    /** Dismiss the notification programmatically (after accept/reject). */
    public static void dismiss(Context context) {
        NotificationManager mgr = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (mgr != null) {
            mgr.cancel(NOTIFICATION_ID);
        }
    }

    /**
     * Create the notification channel for incoming calls (Android O+).
     */
    private static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Incoming Calls",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Notifications for incoming voice calls");
            channel.enableVibration(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager mgr = (NotificationManager)
                    context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (mgr != null) {
                mgr.createNotificationChannel(channel);
            }
        }
    }
}
