package com.addi.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Bundled UI only; OAuth always uses the system browser through its plugin. */
public class MainActivity extends BridgeActivity {
    private boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && "localhost".equals(uri.getHost())
            && uri.getPort() == -1 && !uri.getPath().startsWith("/api/");
    }

    private boolean isDevApi(Uri uri) {
        return "https".equals(uri.getScheme()) && "ohobxicxchkaisxxswkk.supabase.co".equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null
            && (uri.getPath().startsWith("/auth/v1/") || uri.getPath().startsWith("/rest/v1/") || uri.getPath().matches("/functions/v1/native-push/(register|status|test|revoke|rotate)"));
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AddiSecureStoragePlugin.class);
        registerPlugin(NativePushPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Never embed OAuth or navigate the shell to any remote website.
                return !isLocal(request.getUrl());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!isLocal(request.getUrl()) && !isDevApi(request.getUrl())) {
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Native transport denied",
                        Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
    }
}
