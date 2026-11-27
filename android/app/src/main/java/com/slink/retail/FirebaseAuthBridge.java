package com.slink.retail;

import android.app.Activity;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import androidx.webkit.JavaScriptReplyProxy;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.GoogleAuthProvider;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

final class FirebaseAuthBridge {
    private final Activity activity;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final CancellationSignal activeCancellation = new CancellationSignal();
    private final AtomicBoolean signInInFlight = new AtomicBoolean(false);

    FirebaseAuthBridge(Activity activity) {
        this.activity = activity;
    }

    void handleMessage(JSONObject data, JavaScriptReplyProxy reply) {
        String id = data.optString("id");
        String action = data.optString("action");
        if ("googleSignIn".equals(action)) {
            startGoogleSignIn(id, reply);
        } else if ("signOut".equals(action)) {
            try {
                FirebaseAuth.getInstance().signOut();
            } catch (Exception ignored) {
                // Ignore if FirebaseAuth wasn't initialized yet.
            }
            sendSuccess(reply, id, new JSONObject());
        } else {
            sendError(reply, id, "Thao tác xác thực không được hỗ trợ.");
        }
    }

    void destroy() {
        signInInFlight.set(false);
        try {
            activeCancellation.cancel();
        } catch (Exception ignored) {}
        executor.shutdownNow();
    }

    private void startGoogleSignIn(String id, JavaScriptReplyProxy reply) {
        if (!signInInFlight.compareAndSet(false, true)) {
            try {
                reply.postMessage(new JSONObject().put("id", id).put("status", "error")
                        .put("message", "Đang xử lý đăng nhập Google. Vui lòng hoàn tất cửa sổ hiện tại.").toString());
            } catch (Exception ignored) {}
            return;
        }
        int resId = activity.getResources().getIdentifier("default_web_client_id", "string", activity.getPackageName());
        if (resId == 0) {
            sendError(reply, id, "Ứng dụng chưa cấu hình Google OAuth (thiếu default_web_client_id).");
            return;
        }
        String webClientId = activity.getString(resId).trim();
        if (webClientId.isEmpty()) {
            sendError(reply, id, "Mã máy khách Google OAuth đang trống.");
            return;
        }
        try {
            CredentialManager manager = CredentialManager.create(activity);
            GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false)
                    .setServerClientId(webClientId)
                    .setAutoSelectEnabled(false)
                    .build();
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(googleIdOption)
                    .build();
            manager.getCredentialAsync(activity, request, activeCancellation, executor,
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse response) {
                            try {
                                Credential credential = response.getCredential();
                                GoogleIdTokenCredential googleCred = GoogleIdTokenCredential.createFrom(credential.getData());
                                String googleIdToken = googleCred.getIdToken();
                                signInFirebaseWithCredential(id, GoogleAuthProvider.getCredential(googleIdToken, null), reply);
                            } catch (Exception error) {
                                sendError(reply, id, "Không đọc được thông tin tài khoản Google.");
                            }
                        }

                        @Override
                        public void onError(@NonNull GetCredentialException error) {
                            if (error instanceof GetCredentialCancellationException) {
                                sendError(reply, id, "Bạn đã hủy đăng nhập Google.");
                            } else if (error instanceof NoCredentialException) {
                                sendError(reply, id, "Không tìm thấy tài khoản Google trên thiết bị này.");
                            } else {
                                sendError(reply, id, "Chưa đăng nhập được bằng Google.");
                            }
                        }
                    });
        } catch (Exception error) {
            sendError(reply, id, "Thiết bị chưa hỗ trợ đăng nhập Google Credential Manager.");
        }
    }

    private void signInFirebaseWithCredential(String id, AuthCredential credential, JavaScriptReplyProxy reply) {
        try {
            FirebaseAuth.getInstance().signInWithCredential(credential).addOnCompleteListener(executor, task -> {
                if (!task.isSuccessful() || task.getResult() == null || task.getResult().getUser() == null) {
                    sendError(reply, id, "Xác thực tài khoản Google với Firebase thất bại.");
                    return;
                }
                FirebaseUser user = task.getResult().getUser();
                user.getIdToken(true).addOnCompleteListener(executor, tokenTask -> {
                    if (!tokenTask.isSuccessful() || tokenTask.getResult() == null || tokenTask.getResult().getToken() == null) {
                        sendError(reply, id, "Không lấy được mã phiên từ Firebase.");
                        return;
                    }
                    try {
                        JSONObject payload = new JSONObject();
                        payload.put("idToken", tokenTask.getResult().getToken());
                        sendSuccess(reply, id, payload);
                    } catch (Exception e) {
                        sendError(reply, id, "Lỗi đóng gói phiên Firebase.");
                    }
                });
            });
        } catch (Exception error) {
            sendError(reply, id, "Không kết nối được Firebase Auth.");
        }
    }

    private void sendSuccess(JavaScriptReplyProxy reply, String id, JSONObject extra) {
        signInInFlight.set(false);
        activity.runOnUiThread(() -> {
            try {
                extra.put("id", id);
                extra.put("status", "ok");
                reply.postMessage(extra.toString());
            } catch (Exception ignored) {}
        });
    }

    private void sendError(JavaScriptReplyProxy reply, String id, String message) {
        signInInFlight.set(false);
        activity.runOnUiThread(() -> {
            try {
                reply.postMessage(new JSONObject()
                        .put("id", id)
                        .put("status", "error")
                        .put("message", message)
                        .toString());
            } catch (Exception ignored) {}
        });
    }
}
