# Google Play Data Safety Declaration

## How to Fill Out Data Safety Section in Google Play Console

Go to: **App content** → **Data safety**

---

## Section 1: Does your app collect or share any of the required user data types?

**Answer: NO**

*Since the app does not collect personal information, location data, or any user identifiable data.*

---

## If you accidentally select YES, here's how to fill it out:

### Section 2: Data Collection and Security

#### Does your app collect or share any of the required user data types?
**Answer: YES** (only if using analytics in future)

---

### Section 3: Select the data types your app collects or shares

**Data Types to Declare:**

#### Device or other IDs
- [x] Device or other IDs
  - **Examples**: Device ID (for push notifications via Expo)
  - **Is this data collected or shared?**: Collected
  - **Is this data processed ephemerally?**: No
  - **Is data collection required or optional?**: Required
  - **Why is this data collected?**: App functionality (push notifications)
  - **Is data encrypted in transit?**: Yes
  - **Can users request data deletion?**: Yes (uninstall app)

---

### Section 4: All Other Data Types

Mark **NO** for:
- [ ] Location
- [ ] Personal info (name, email, etc.)
- [ ] Financial info
- [ ] Health and fitness
- [ ] Messages
- [ ] Photos and videos
- [ ] Audio files
- [ ] Files and docs
- [ ] Calendar
- [ ] Contacts
- [ ] App activity
- [ ] Web browsing
- [ ] App info and performance
- [ ] Other data types

---

### Section 5: Data Usage and Handling

For **Device or other IDs**:

**Is this data collected, shared, or both?**
- [x] Collected
- [ ] Shared

**Is this data processed ephemerally?**
- [ ] Yes
- [x] No

**Is this data required for your app, or can users choose whether it's collected?**
- [x] Required (for push notifications)
- [ ] Optional

**Why is this user data collected?**
- [x] App functionality (push notifications)
- [ ] Analytics
- [ ] Developer communications
- [ ] Advertising or marketing
- [ ] Fraud prevention, security, and compliance
- [ ] Personalization
- [ ] Account management

**Is all of the user data collected by your app encrypted in transit?**
- [x] Yes

**Do you provide a way for users to request that their data is deleted?**
- [x] Yes (by uninstalling the app - data is stored locally only)

---

# Apple App Store Privacy Declarations

## How to Fill Out App Privacy Section in App Store Connect

Go to: **App Privacy** in App Store Connect

---

## Section 1: Does your app collect data?

**Answer: NO** (if not using analytics)

**OR**

**Answer: YES** (if you want to declare notification token)

---

## If YES, Data Types to Declare:

### Device ID
- **Data Type**: Device ID
- **How is this data used?**
  - [x] App Functionality (push notifications)
- **Is this data linked to the user's identity?**
  - [ ] No, this data is not linked to the user's identity
  - [x] Yes, this data is linked to the user's identity (via device)

  **Actually, select NO** - The device ID for notifications is not linked to user identity (anonymous)

- **Do you or your third-party partners use this data for tracking purposes?**
  - [x] No

---

## All Other Data Categories: Select "No" for:
- [ ] Contact Info
- [ ] Health & Fitness
- [ ] Financial Info
- [ ] Location
- [ ] Sensitive Info
- [ ] Contacts
- [ ] User Content
- [ ] Browsing History
- [ ] Search History
- [ ] Identifiers (other than Device ID)
- [ ] Purchases
- [ ] Usage Data
- [ ] Diagnostics
- [ ] Other Data

---

# Summary for Both Stores

## Recommended Approach: MINIMAL DATA DECLARATION

### Google Play Data Safety:
**Answer: NO to data collection**

Reasoning:
- Device notification tokens are handled by Expo/Firebase Cloud Messaging
- No personal data is collected by YOUR app code
- All data (masjid selection, prayer times) is stored locally
- No data is sent to your servers

### Apple App Store Privacy:
**Answer: NO to data collection**

Reasoning:
- Same as Google Play
- Push notification tokens are handled by Apple/Expo infrastructure
- Your app doesn't collect user data

---

# If You Add Analytics (Firebase) Later

When you add Firebase Analytics, you'll need to update these declarations:

## Google Play Data Safety:

**Change to: YES** for data collection

**Add these data types:**
1. **Device or other IDs**
   - Purpose: Analytics, App functionality
   - Encrypted: Yes
   - Deletable: Yes

2. **App info and performance**
   - Purpose: Analytics
   - Examples: Crash logs, diagnostics
   - Encrypted: Yes
   - Deletable: Yes

## Apple App Store Privacy:

**Add these data types:**
1. **Identifiers** → Device ID
   - Purpose: Analytics
   - Linked to user: No
   - Used for tracking: No

2. **Diagnostics**
   - Purpose: App functionality (crash logs)
   - Linked to user: No
   - Used for tracking: No

---

# Quick Reference: What to Select

## For Current Version (No Analytics):

| Question | Google Play | Apple App Store |
|----------|-------------|-----------------|
| Does app collect data? | **NO** | **NO** |
| Location tracking? | NO | NO |
| Personal info? | NO | NO |
| Device ID? | NO* | NO* |
| Analytics? | NO | NO |

*Device ID for push notifications is handled by platform, not collected by your app*

## After Adding Firebase Analytics:

| Question | Google Play | Apple App Store |
|----------|-------------|-----------------|
| Does app collect data? | **YES** | **YES** |
| Device ID? | YES (Analytics) | YES (Analytics) |
| Diagnostics? | YES (Crashes) | YES (Crashes) |
| Linked to user? | NO | NO |
| Used for tracking? | NO | NO |

---

**Save this file for reference when filling out the store forms!**
