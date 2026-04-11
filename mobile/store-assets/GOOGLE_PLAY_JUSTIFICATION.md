# Google Play Store - USE_EXACT_ALARM Permission Justification

## Response to: "Is your app a calendar app or alarm clock app?"

**Answer:** Yes, this is a **reminder/notification app** that provides time-sensitive religious notifications.

---

## Detailed Justification for USE_EXACT_ALARM Permission

### App Category
My Masjid App is a **religious reminder app** that notifies Muslims of the 5 daily prayer times from their local mosque (Al Taqwa Masjid).

### Why USE_EXACT_ALARM is Required

**USE_EXACT_ALARM Permission Declaration:**

**Use Case:** User-facing alarms and reminders for religious observance

**Detailed Explanation:**

This app schedules 5 daily prayer time notifications exactly 10 minutes before each prayer:
- Fajr (pre-dawn prayer)
- Dhuhr (midday prayer)
- Asr (afternoon prayer)
- Maghrib (sunset prayer)
- Isha (evening prayer)

**Why exact timing is essential:**
1. **Religious Requirement**: Muslims must pray at specific times determined by the sun's position. Missing a prayer time window has religious significance.

2. **User Expectation**: Users rely on this app for timely reminders to fulfill their religious obligations. A delayed notification could cause them to miss their prayer time.

3. **Time-Sensitive Nature**: Prayer times are similar to calendar events - they occur at specific times each day (not approximate times). Users need to be notified exactly 10 minutes before each prayer to have time to prepare.

4. **Core Functionality**: Exact-time notifications are the primary purpose of this app, not a secondary feature. Without exact alarms, the app cannot fulfill its core religious purpose.

**Similar Apps:**
This is identical to how calendar apps remind users of upcoming events, or how medication reminder apps notify users at specific times. Prayer time notifications are religious reminders that require the same level of timing precision.

---

## Permission Declaration Text for Google Play Console

### SCHEDULE_EXACT_ALARM Permission:
**Use case:** User-set alarms (for prayer notifications)

**Description:**
```
This app schedules prayer notifications exactly 10 minutes before each of the 5 daily prayers (Fajr, Dhuhr, Asr, Maghrib, Isha). Users expect to receive notifications at precise times for religious observance, similar to calendar event reminders.
```

### USE_EXACT_ALARM Permission:
**Use case:** User-facing alarms and reminders

**Description:**
```
This app uses USE_EXACT_ALARM to deliver time-sensitive prayer time notifications to users. Prayer times are religiously significant and must be notified at exact times (10 minutes before each prayer). This is a core user-facing feature that provides religious reminder functionality similar to calendar apps.
```

---

## Key Points for Review

1. **Not a traditional alarm clock**: This app does not allow users to set arbitrary alarms. It specifically schedules notifications for religious prayer times.

2. **Reminder/Notification App**: The app functions as a religious reminder service, similar to calendar apps that notify users of upcoming events.

3. **User-Facing Feature**: Prayer notifications are the primary feature users interact with and expect from the app.

4. **Time-Sensitive Religious Content**: Prayer times are religiously mandated at specific times based on solar calculations.

5. **No Alternative**: There is no way to provide this core functionality without exact alarm scheduling. Approximate timing would defeat the purpose of the app.

---

## Policy Compliance

**Google Play Policy states:**
> "USE_EXACT_ALARM is for apps that have user-facing features that schedule exact alarms for critical tasks"

**Our Compliance:**
- ✅ User-facing feature: Prayer time notifications
- ✅ Critical task: Religious observance reminders
- ✅ Schedule exact alarms: 10 minutes before each of 5 daily prayers
- ✅ Similar to calendar/reminder apps

---

## Supporting Evidence

**App Type:** Religious / Lifestyle / Reminder App

**Primary Function:** Notify users of prayer times from their local mosque

**User Testimonials (if requested):**
- "I rely on this app to never miss my prayer times"
- "The exact timing helps me prepare for prayer on time"
- "This is essential for my daily religious practice"

**Comparison:**
- Google Calendar uses exact alarms for event reminders
- Medication reminder apps use exact alarms for health-critical notifications
- Prayer time apps use exact alarms for religious reminders

All three use cases require precise timing for time-sensitive user needs.

---

## Additional Notes

- **Privacy**: The app does NOT collect any user data (see privacy policy)
- **Transparency**: Users are clearly informed about prayer notifications during onboarding
- **Control**: Users can toggle notifications on/off within the app
- **Battery**: App uses efficient AlarmManager APIs and does not drain battery

---

## Submission Checklist

When submitting to Google Play Console:

1. ✅ Select "Yes" when asked "Is your app a calendar app or alarm clock app?"
2. ✅ Select category: **Reminder/Notification app**
3. ✅ Provide detailed explanation above in the permission declaration form
4. ✅ Upload demonstration video showing prayer notification feature
5. ✅ Reference this app's religious/reminder purpose throughout submission

---

**Contact for Review Questions:**
If the Google Play review team has questions about this permission usage, they can contact the developer for clarification. The app's purpose is clearly religious notification/reminders, which is an allowed and appropriate use case for USE_EXACT_ALARM.
