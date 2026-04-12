package com.teknlgy.happyga;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.webkit.PermissionRequest;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.PluginHandle;
import com.twilio.voice.CallInvite;

/**
 * Main activity — registers the TwilioVoicePlugin with Capacitor and
 * handles incoming call intents from the notification Accept action.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "HappyGA:Main";
    private static final int AUDIO_PERMISSION_REQUEST_CODE = 1001;
    private PermissionRequest pendingPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the native Twilio Voice plugin before super.onCreate
        // so Capacitor picks it up during bridge initialization
        registerPlugin(TwilioVoicePlugin.class);

        super.onCreate(savedInstanceState);

        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (containsAudioCapture(request)) {
                    if (hasAudioPermission()) {
                        request.grant(request.getResources());
                        return;
                    }

                    pendingPermissionRequest = request;
                    ActivityCompat.requestPermissions(
                        MainActivity.this,
                        new String[]{Manifest.permission.RECORD_AUDIO},
                        AUDIO_PERMISSION_REQUEST_CODE
                    );
                    return;
                }

                request.grant(request.getResources());
            }
        });

        // Handle intent if the activity was launched from an incoming call notification
        handleIncomingCallIntent(getIntent());
    }

    /**
     * Called when a new intent is delivered to an already-running activity
     * (launchMode="singleTask"). Handles the Accept action from the notification.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingCallIntent(intent);
    }

    /**
     * If the intent has ACTION_ACCEPT, extract the CallInvite and pass it
     * to the TwilioVoicePlugin so it can accept the call and notify JS.
     */
    private void handleIncomingCallIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        Log.d(TAG, "handleIncomingCallIntent — action: " + action);

        if (IncomingCallNotificationService.ACTION_ACCEPT.equals(action)) {
            CallInvite callInvite = intent.getParcelableExtra(
                    IncomingCallNotificationService.EXTRA_CALL_INVITE);
            if (callInvite != null) {
                // Wait for the bridge to be ready, then accept the call
                getBridge().getWebView().post(() -> {
                    PluginHandle handle = getBridge().getPlugin("TwilioVoice");
                    if (handle != null) {
                        TwilioVoicePlugin plugin = (TwilioVoicePlugin) handle.getInstance();
                        plugin.handleAcceptFromIntent(callInvite);
                    } else {
                        Log.e(TAG, "TwilioVoicePlugin not found in bridge");
                    }
                });
            }
            // Clear the action so we don't re-process on config change
            intent.setAction(null);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != AUDIO_PERMISSION_REQUEST_CODE || pendingPermissionRequest == null) {
            return;
        }

        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
        } else {
            pendingPermissionRequest.deny();
        }

        pendingPermissionRequest = null;
    }

    private boolean hasAudioPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
    }

    private boolean containsAudioCapture(PermissionRequest request) {
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                return true;
            }
        }
        return false;
    }
}
