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

/** Local asset shell only. OAuth/App Links will get a separate Phase 2 adapter. */
public class MainActivity extends BridgeActivity {
    private boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && "localhost".equals(uri.getHost())
            && uri.getPort() == -1 && !uri.getPath().startsWith("/api/");
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Never launch Chrome, Samsung Internet, Custom Tabs or another external activity.
                return !isLocal(request.getUrl());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!isLocal(request.getUrl())) {
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Phase 1 local assets only",
                        Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
    }
}
