package nl.vuurpijl.game;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The game's reminders: the game plans them (at most one a day), this posts them at
 * those times, and plans them again after the phone restarts or the app is updated.
 */
public class ReminderReceiver extends BroadcastReceiver {

    static final String CHANNEL = "reminders";
    private static final String PREFS = "reminders";
    private static final int MAX = 5;

    /** Replaces every planned reminder with these: a JSON list of {at, title, text}. */
    static void schedule(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("plan", json).apply();
        plan(ctx, json);
    }

    private static void plan(Context ctx, String json) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int i = 0; i < MAX; i++) {
            PendingIntent old = pending(ctx, i, null, null, PendingIntent.FLAG_NO_CREATE);
            if (old != null) {
                am.cancel(old);
                old.cancel();
            }
        }
        try {
            JSONArray list = new JSONArray(json);
            long now = System.currentTimeMillis();
            for (int i = 0; i < Math.min(list.length(), MAX); i++) {
                JSONObject r = list.getJSONObject(i);
                long at = r.getLong("at");
                if (at <= now) continue;
                // inexact on purpose: Android may move it a little to save battery
                am.set(AlarmManager.RTC_WAKEUP, at,
                        pending(ctx, i, r.optString("title"), r.optString("text"), PendingIntent.FLAG_UPDATE_CURRENT));
            }
        } catch (Exception e) {
            // a broken plan means no reminders
        }
    }

    private static PendingIntent pending(Context ctx, int i, String title, String text, int flags) {
        Intent it = new Intent(ctx, ReminderReceiver.class).setAction("nl.vuurpijl.game.REMIND." + i);
        if (title != null) it.putExtra("title", title).putExtra("text", text);
        return PendingIntent.getBroadcast(ctx, i, it, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static void createChannel(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Coins from your fans, your daily streak and events. At most one a day.");
        nm.createNotificationChannel(ch);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            plan(ctx, ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("plan", "[]"));
            return;
        }
        if (MainActivity.inFront) return; // playing right now
        if (Build.VERSION.SDK_INT >= 33
                && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        String title = intent.getStringExtra("title");
        String text = intent.getStringExtra("text");
        if (title == null) return;
        createChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_rocket)
                .setColor(0xFFFF8C1A)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build();
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(1, n);
    }
}
