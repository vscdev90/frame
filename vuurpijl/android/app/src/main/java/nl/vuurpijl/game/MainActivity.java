package nl.vuurpijl.game;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** Full-screen WebView that runs the game from the app's assets. */
public class MainActivity extends Activity {

    private static final String START_URL = "https://appassets.androidplatform.net/assets/index.html";

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady;

    // rewarded videos (AdMob), only after the player answered the consent form
    private ConsentInformation consent;
    private final AtomicBoolean adsStarted = new AtomicBoolean(false);
    private volatile RewardedAd rewarded;
    private boolean loadingAd;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0B1230);
        setContentView(web);
        hideSystemBars();

        // Serve the assets from a proper https origin so localStorage (the save
        // game) and audio behave exactly as in a browser.
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                sendInsets();
            }
        });
        // also lets standard JavaScript dialogs show, should the page ever use one
        web.setWebChromeClient(new WebChromeClient());

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        // the game keeps its HUD out of the camera cut-out
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            sendInsets();
            return insets;
        });

        // a voice for the countdown
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.US);
                tts.setSpeechRate(0.95f);
                ttsReady = true;
            }
        });

        // Android 13+ (and always from Android 16): back goes through this callback.
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.loadUrl(START_URL);

        setUpAds();
    }

    // ---------- ads: consent first (required in the EU), then load a rewarded video ----------

    private void setUpAds() {
        consent = UserMessagingPlatform.getConsentInformation(this);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consent.requestConsentInfoUpdate(this, params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(this, formError -> startAds()),
                requestError -> startAds());
        // consent from an earlier session: no need to wait for the update
        if (consent.canRequestAds()) startAds();
    }

    private void startAds() {
        if (!consent.canRequestAds() || adsStarted.getAndSet(true)) return;
        new Thread(() -> MobileAds.initialize(this, status -> runOnUiThread(this::loadRewarded))).start();
    }

    private void loadRewarded() {
        if (loadingAd || rewarded != null || isFinishing()) return;
        loadingAd = true;
        RewardedAd.load(this, BuildConfig.REWARDED_ID, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) {
                loadingAd = false;
                rewarded = ad;
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                loadingAd = false;
                rewarded = null;
                web.postDelayed(MainActivity.this::loadRewarded, 60_000); // no fill: try again later
            }
        });
    }

    private void showRewarded(String tag) {
        RewardedAd ad = rewarded;
        if (ad == null) {
            adDone(tag, false);
            loadRewarded();
            return;
        }
        rewarded = null;
        final boolean[] earned = {false};
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                adDone(tag, earned[0]);
                loadRewarded();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                adDone(tag, false);
                loadRewarded();
            }
        });
        ad.show(this, reward -> earned[0] = true);
    }

    private void adDone(String tag, boolean rewardEarned) {
        web.evaluateJavascript("window.vpAdDone && window.vpAdDone(" + JSONObject.quote(tag) + "," + rewardEarned + ")", null);
        hideSystemBars();
    }

    // ---------- what the game can ask of the phone ----------

    private class Bridge {
        /** Haptic feedback. */
        @JavascriptInterface
        public void vibrate(long ms) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            v.vibrate(VibrationEffect.createOneShot(Math.max(1, Math.min(ms, 500)), VibrationEffect.DEFAULT_AMPLITUDE));
        }

        /** Says a line out loud (the countdown). */
        @JavascriptInterface
        public void speak(String text) {
            if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "rocket");
        }

        /** Shares the score picture (base64 PNG) and a line of text with any app. */
        @JavascriptInterface
        public void shareImage(String base64Png, String text) {
            try {
                File dir = new File(getCacheDir(), "share");
                if (!dir.exists() && !dir.mkdirs()) return;
                File file = new File(dir, "rocket.png");
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(Base64.decode(base64Png, Base64.DEFAULT));
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, BuildConfig.APPLICATION_ID + ".files", file);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_TEXT, text);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, null)));
            } catch (Exception e) {
                // nothing to share then; the game carries on
            }
        }

        /** Cheat mode only exists in the hobby build, never in the Play Store one. */
        @JavascriptInterface
        public boolean cheatsAllowed() {
            return BuildConfig.CHEATS;
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME + (BuildConfig.CHEATS ? " (hobby)" : "");
        }

        /** Is a rewarded video loaded and ready to show? */
        @JavascriptInterface
        public boolean adReady() {
            return rewarded != null;
        }

        /** Shows the rewarded video; the answer comes back through window.vpAdDone(tag, earned). */
        @JavascriptInterface
        public void showRewarded(String tag) {
            runOnUiThread(() -> MainActivity.this.showRewarded(tag));
        }

        /** In the EU players must be able to change their ad choices later. */
        @JavascriptInterface
        public boolean privacyOptionsRequired() {
            return consent != null && consent.getPrivacyOptionsRequirementStatus()
                    == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
        }

        @JavascriptInterface
        public void showPrivacyOptions() {
            runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(MainActivity.this, formError -> {
                hideSystemBars();
                startAds();
            }));
        }
    }

    /** Tells the page how tall the camera cut-out is, in CSS pixels. */
    private void sendInsets() {
        if (web == null) return;
        int top = 0;
        WindowInsets insets = web.getRootWindowInsets();
        if (insets != null) {
            DisplayCutout cut = insets.getDisplayCutout();
            if (cut != null) top = cut.getSafeInsetTop();
        }
        float dp = top / getResources().getDisplayMetrics().density;
        web.evaluateJavascript("document.documentElement.style.setProperty('--inset-top','" + Math.round(dp) + "px')", null);
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // The game decides what back means (leave a screen, or quit from the shop).
    private void handleBack() {
        web.evaluateJavascript("window.vpBack ? window.vpBack() : 'exit'", value -> {
            if (value == null || value.contains("exit")) finish();
        });
    }

    // Android 12 and older still call this.
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
