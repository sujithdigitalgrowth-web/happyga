package com.teknlgy.happyga;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.google.firebase.messaging.FirebaseMessaging;
import com.twilio.voice.Call;
import com.twilio.voice.CallException;
import com.twilio.voice.CallInvite;
import com.twilio.voice.RegistrationException;
import com.twilio.voice.RegistrationListener;
import com.twilio.voice.UnregistrationListener;
import com.twilio.voice.Voice;

import java.util.Map;

/**
 * Capacitor plugin that bridges the native Twilio Voice Android SDK
 * into the Capacitor WebView.
 *
 * JS interface:
 *   TwilioVoice.registerForCalls({ accessToken })   — register FCM token with Twilio
 *   TwilioVoice.unregister({ accessToken })          — unregister from Twilio push
 *   TwilioVoice.checkIncomingCall()                  — check if there's a pending invite
 *   TwilioVoice.acceptCall()                         — accept the pending call invite
 *   TwilioVoice.rejectCall()                         — reject the pending call invite
 *   TwilioVoice.hangup()                             — hang up the active native call
 *
 * Events emitted to JS:
 *   incomingCall      — { from, callerName, callerUid, callSid }
 *   callAccepted      — { callSid }
 *   callDisconnected   — { callSid }
 *   callFailed         — { error, callSid }
 *   callCancelled      — {}
 *   registrationSuccess — {}
 *   registrationError   — { error }
 */
@CapacitorPlugin(
    name = "TwilioVoice",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "audio"),
        @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications")
    }
)
public class TwilioVoicePlugin extends Plugin {

    private static final String TAG = "HappyGA:TwilioPlugin";

    // Shared state — written by FCM service, read by this plugin
    private static volatile String fcmToken = null;
    private static volatile CallInvite activeCallInvite = null;

    // Active native call (after accepting an invite)
    private Call activeCall = null;

    /** Called by HappyGAFirebaseMessagingService when a new token arrives. */
    public static void setFcmToken(String token) {
        fcmToken = token;
    }

    /** Called by IncomingCallNotificationService when an invite arrives. */
    public static void setActiveCallInvite(CallInvite invite) {
        activeCallInvite = invite;
    }

    /** Called when invite is handled or cancelled. */
    public static void clearActiveCallInvite() {
        activeCallInvite = null;
    }

    /** Get the current pending invite (used by MainActivity). */
    @Nullable
    public static CallInvite getActiveCallInvite() {
        return activeCallInvite;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Plugin methods exposed to Capacitor JS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Register the device's FCM token with Twilio so it can receive
     * push notifications for incoming Voice calls.
     *
     * JS: TwilioVoice.registerForCalls({ accessToken: '...' })
     */
    @PluginMethod
    public void registerForCalls(PluginCall call) {
        String accessToken = call.getString("accessToken");
        if (accessToken == null || accessToken.isEmpty()) {
            call.reject("accessToken is required");
            return;
        }

        // Request notification permission on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), "android.permission.POST_NOTIFICATIONS")
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        getActivity(),
                        new String[]{"android.permission.POST_NOTIFICATIONS"},
                        2001);
            }
        }

        // Get FCM token, then register with Twilio
        if (fcmToken != null) {
            registerWithTwilio(accessToken, fcmToken, call);
        } else {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    Log.e(TAG, "FCM token fetch failed", task.getException());
                    call.reject("Failed to get FCM token: "
                            + (task.getException() != null ? task.getException().getMessage() : "unknown"));
                    return;
                }
                fcmToken = task.getResult();
                Log.d(TAG, "FCM token obtained: " + fcmToken.substring(0, Math.min(20, fcmToken.length())) + "...");
                registerWithTwilio(accessToken, fcmToken, call);
            });
        }
    }

    private void registerWithTwilio(String accessToken, String token, PluginCall call) {
        Voice.register(accessToken, Voice.RegistrationChannel.FCM, token, new RegistrationListener() {
            @Override
            public void onRegistered(@NonNull String accessToken, @NonNull String fcmToken) {
                Log.d(TAG, "Twilio push registration successful");
                JSObject result = new JSObject();
                result.put("registered", true);
                call.resolve(result);
                notifyListeners("registrationSuccess", new JSObject());
            }

            @Override
            public void onError(@NonNull RegistrationException error,
                                @NonNull String accessToken,
                                @NonNull String fcmToken) {
                Log.e(TAG, "Twilio push registration failed: " + error.getMessage());
                call.reject("Twilio registration failed: " + error.getMessage());
                JSObject errorObj = new JSObject();
                errorObj.put("error", error.getMessage());
                notifyListeners("registrationError", errorObj);
            }
        });
    }

    /**
     * Unregister from Twilio push notifications.
     */
    @PluginMethod
    public void unregister(PluginCall call) {
        String accessToken = call.getString("accessToken");
        if (accessToken == null || fcmToken == null) {
            call.reject("accessToken and fcmToken required");
            return;
        }

        Voice.unregister(accessToken, Voice.RegistrationChannel.FCM, fcmToken, new UnregistrationListener() {
            @Override
            public void onUnregistered(String accessToken, String fcmToken) {
                Log.d(TAG, "Twilio push unregistration successful");
                call.resolve(new JSObject());
            }

            @Override
            public void onError(@NonNull RegistrationException error,
                                @NonNull String accessToken,
                                @NonNull String fcmToken) {
                Log.e(TAG, "Twilio push unregistration failed: " + error.getMessage());
                call.reject("Unregistration failed: " + error.getMessage());
            }
        });
    }

    /**
     * Check if there is a pending incoming call invite (e.g. after app was
     * launched from a notification tap).
     */
    @PluginMethod
    public void checkIncomingCall(PluginCall call) {
        CallInvite invite = activeCallInvite;
        JSObject result = new JSObject();
        if (invite != null) {
            result.put("hasIncoming", true);
            result.put("from", invite.getFrom());
            result.put("callSid", invite.getCallSid());
            populateCallerInfo(result, invite);
        } else {
            result.put("hasIncoming", false);
        }
        call.resolve(result);
    }

    /**
     * Accept the pending call invite. The call audio will be handled natively
     * by the Twilio Voice SDK. The JS side shows the in-call UI.
     */
    @PluginMethod
    public void acceptCall(PluginCall call) {
        CallInvite invite = activeCallInvite;
        if (invite == null) {
            call.reject("No incoming call to accept");
            return;
        }

        Log.d(TAG, "Accepting call — callSid: " + invite.getCallSid());

        // Dismiss the notification
        IncomingCallNotificationService.dismiss(getContext());

        activeCall = invite.accept(getContext(), createCallListener());
        activeCallInvite = null;

        JSObject result = new JSObject();
        result.put("callSid", invite.getCallSid());
        call.resolve(result);
    }

    /**
     * Reject the pending call invite.
     */
    @PluginMethod
    public void rejectCall(PluginCall call) {
        CallInvite invite = activeCallInvite;
        if (invite == null) {
            call.reject("No incoming call to reject");
            return;
        }

        Log.d(TAG, "Rejecting call — callSid: " + invite.getCallSid());
        invite.reject(getContext());
        activeCallInvite = null;

        IncomingCallNotificationService.dismiss(getContext());
        call.resolve(new JSObject());
    }

    /**
     * Hang up the active native call.
     */
    @PluginMethod
    public void hangup(PluginCall call) {
        if (activeCall != null) {
            Log.d(TAG, "Hanging up active call");
            activeCall.disconnect();
            activeCall = null;
        }
        call.resolve(new JSObject());
    }

    /**
     * Called by MainActivity when it receives an ACTION_ACCEPT intent
     * (user tapped Accept on the notification). We fire the event to JS.
     */
    public void handleAcceptFromIntent(CallInvite invite) {
        if (invite == null) return;

        Log.d(TAG, "handleAcceptFromIntent — callSid: " + invite.getCallSid());
        IncomingCallNotificationService.dismiss(getContext());

        activeCall = invite.accept(getContext(), createCallListener());
        activeCallInvite = null;

        JSObject data = new JSObject();
        data.put("callSid", invite.getCallSid());
        data.put("from", invite.getFrom());
        populateCallerInfo(data, invite);
        notifyListeners("callAccepted", data);
    }

    /**
     * Notify JS about a pending incoming call (used when app is foregrounded
     * and a call invite arrives).
     */
    public void notifyIncomingCall(CallInvite invite) {
        JSObject data = new JSObject();
        data.put("from", invite.getFrom());
        data.put("callSid", invite.getCallSid());
        populateCallerInfo(data, invite);
        notifyListeners("incomingCall", data);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  Internal helpers
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    private Call.Listener createCallListener() {
        return new Call.Listener() {
            @Override
            public void onConnectFailure(@NonNull Call call, @NonNull CallException error) {
                Log.e(TAG, "Native call connect failure: " + error.getMessage());
                activeCall = null;
                JSObject data = new JSObject();
                data.put("error", error.getMessage());
                data.put("callSid", call.getSid());
                notifyListeners("callFailed", data);
            }

            @Override
            public void onRinging(@NonNull Call call) {
                Log.d(TAG, "Native call ringing");
            }

            @Override
            public void onConnected(@NonNull Call call) {
                Log.d(TAG, "Native call connected — sid: " + call.getSid());
                // Set audio to speaker route
                AudioManager audioManager = (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
                if (audioManager != null) {
                    audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                }
                JSObject data = new JSObject();
                data.put("callSid", call.getSid());
                notifyListeners("callAccepted", data);
            }

            @Override
            public void onReconnecting(@NonNull Call call, @NonNull CallException error) {
                Log.w(TAG, "Native call reconnecting: " + error.getMessage());
            }

            @Override
            public void onReconnected(@NonNull Call call) {
                Log.d(TAG, "Native call reconnected");
            }

            @Override
            public void onDisconnected(@NonNull Call call, @Nullable CallException error) {
                Log.d(TAG, "Native call disconnected — sid: " + call.getSid());
                activeCall = null;
                AudioManager audioManager = (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
                if (audioManager != null) {
                    audioManager.setMode(AudioManager.MODE_NORMAL);
                }
                JSObject data = new JSObject();
                data.put("callSid", call.getSid());
                if (error != null) {
                    data.put("error", error.getMessage());
                }
                notifyListeners("callDisconnected", data);
            }
        };
    }

    /** Extract callerName/callerUid/listenerUid from CallInvite custom parameters. */
    private void populateCallerInfo(JSObject obj, CallInvite invite) {
        Map<String, String> params = invite.getCustomParameters();
        if (params != null) {
            obj.put("callerName", params.getOrDefault("callerName", ""));
            obj.put("callerUid", params.getOrDefault("callerUid", ""));
            obj.put("listenerUid", params.getOrDefault("listenerUid", ""));
            obj.put("listenerName", params.getOrDefault("listenerName", ""));
        }
    }
}
