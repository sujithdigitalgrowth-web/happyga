package com.teknlgy.happyga;

import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.twilio.voice.CallException;
import com.twilio.voice.CallInvite;
import com.twilio.voice.CancelledCallInvite;
import com.twilio.voice.MessageListener;
import com.twilio.voice.Voice;

/**
 * Receives FCM push messages and routes Twilio Voice pushes to the
 * native Twilio Voice SDK.  Non-Twilio pushes are ignored (fall through
 * to the default Capacitor/Firebase handling).
 *
 * The Twilio SDK parses the push data and fires CallInvite or
 * CancelledCallInvite events which are handled by
 * {@link IncomingCallNotificationService}.
 */
public class HappyGAFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "HappyGA:FCM";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Log.d(TAG, "Push received — data keys: " + remoteMessage.getData().keySet());

        // Check if this is a Twilio Voice push by looking for Twilio-specific keys
        if (!remoteMessage.getData().containsKey("twi_message_type")) {
            Log.d(TAG, "Not a Twilio push — ignoring");
            super.onMessageReceived(remoteMessage);
            return;
        }

        // Hand the push data to the Twilio Voice SDK
        Voice.handleMessage(this, remoteMessage.getData(), new MessageListener() {
            @Override
            public void onCallInvite(@NonNull CallInvite callInvite) {
                Log.d(TAG, "CallInvite received — from: " + callInvite.getFrom()
                        + ", to: " + callInvite.getTo()
                        + ", callSid: " + callInvite.getCallSid());

                // Show a system notification + bring the app to the foreground
                IncomingCallNotificationService.showIncomingCallNotification(
                        HappyGAFirebaseMessagingService.this, callInvite);
            }

            @Override
            public void onCancelledCallInvite(@NonNull CancelledCallInvite cancelledCallInvite,
                                               @Nullable CallException callException) {
                Log.d(TAG, "CancelledCallInvite — callSid: " + cancelledCallInvite.getCallSid());

                IncomingCallNotificationService.cancelIncomingCallNotification(
                        HappyGAFirebaseMessagingService.this, cancelledCallInvite);
            }
        });
    }

    /**
     * Called when FCM generates a new device token (first launch or token rotation).
     * The token is stored and will be picked up by TwilioVoicePlugin when
     * the app calls registerForCalls().
     */
    @Override
    public void onNewToken(@NonNull String token) {
        Log.d(TAG, "New FCM token: " + token.substring(0, Math.min(20, token.length())) + "...");
        // Store token so the Capacitor plugin can read it later
        TwilioVoicePlugin.setFcmToken(token);
    }
}
