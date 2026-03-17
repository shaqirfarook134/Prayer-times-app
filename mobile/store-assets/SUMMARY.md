# Google Play Store & App Store Publishing - Complete Package

## 📦 Package Contents

All required content for publishing **My Masjid App v1.2.0** to Google Play Store and Apple App Store.

**Created:** March 17, 2026
**App Version:** 1.2.0
**Build Number:** 3
**Package ID:** com.shaqirfarook.mymasjid

---

## 📁 Files Created

1. **PRIVACY_POLICY.md** - Complete privacy policy (host on a public URL)
2. **STORE_LISTING.md** - App descriptions, release notes, keywords
3. **DATA_SAFETY.md** - Google Play Data Safety & Apple Privacy declarations
4. **CONTENT_RATING.md** - Content rating questionnaire answers
5. **SUMMARY.md** (this file) - Quick reference guide

---

## ✅ Pre-Publishing Checklist

### Build Files Ready
- [x] Android AAB: `/Users/shaqirfarook/prayer-times-app/mobile/android/app/build/outputs/bundle/release/app-release.aab` (46MB)
- [x] iOS Archive: `/Users/shaqirfarook/prayer-times-app/mobile/ios/build/MyMasjidApp.xcarchive` (uploaded to App Store Connect)
- [x] Version: 1.2.0 (build 3) on both platforms
- [x] App tested on physical devices (Android & iPhone)

### Content Ready
- [x] Privacy Policy written
- [x] Store descriptions written
- [x] Release notes prepared
- [x] Data safety declarations documented
- [x] Content rating answers documented

### Still Needed
- [ ] Privacy Policy hosted at public URL
- [ ] App icon 512x512 PNG (for Google Play)
- [ ] Feature graphic 1024x500 PNG (for Google Play)
- [ ] Screenshots (minimum 2 for each platform)
- [ ] Developer email address (for contact)
- [ ] Support URL or email (optional but recommended)

---

## 🚀 Google Play Store Publishing Steps

### 1. Upload AAB
- Go to **Production** → **Releases** → **Create new release**
- Upload: `app-release.aab`
- Release name: `1.2.0 (3)`
- Add release notes from `STORE_LISTING.md`

### 2. Complete App Content (Required)

#### A. Privacy Policy
- **App content** → **Privacy policy**
- Add URL where you hosted `PRIVACY_POLICY.md`
- **Quick hosting options:**
  - GitHub Pages (free)
  - Google Sites (free)
  - Netlify/Vercel (free)

#### B. Data Safety
- **App content** → **Data safety**
- Answer: **NO** to "Does your app collect or share any of the required user data types?"
- See `DATA_SAFETY.md` for detailed guidance

#### C. App Content Rating
- **App content** → **App content rating**
- Fill questionnaire using answers in `CONTENT_RATING.md`
- Expected rating: **Everyone**

#### D. Target Audience
- **App content** → **Target audience**
- Select: **Ages 13 and up**
- Not designed for children: **NO**

### 3. Store Listing
- **Store presence** → **Main store listing**
- Copy content from `STORE_LISTING.md`:
  - App name: **My Masjid App**
  - Short description (80 chars)
  - Full description
  - App icon: 512x512 PNG
  - Feature graphic: 1024x500 PNG
  - Screenshots: Minimum 2
- **Category:** Lifestyle
- **Tags:** prayer times, muslim, mosque, salah, etc.

### 4. Review & Publish
- Review all sections (green checkmarks)
- **Production** → **Review release**
- Choose rollout: 100% or staged (20%, 50%)
- Click **Start rollout to Production**
- Wait 1-3 days for Google review

---

## 🍎 Apple App Store Publishing Steps

### 1. Upload Build (Already Done ✅)
- iOS archive v1.2.0 (build 3) uploaded to App Store Connect
- Build status: **Complete**

### 2. Create App Store Listing
- Go to **App Store** tab in App Store Connect
- Add version: **1.2.0**
- Copy content from `STORE_LISTING.md`:
  - **What's New:** Release notes
  - **Description:** Full description
  - **Promotional Text:** 170 chars
  - **Keywords:** 100 chars comma-separated
  - **Support URL:** Your support email/website
  - **Marketing URL:** Optional

### 3. App Privacy (Required)
- **App Privacy** section
- Answer: **NO** to data collection (see `DATA_SAFETY.md`)
- Or declare minimal data if needed

### 4. App Information
- **Age Rating:** Fill questionnaire from `CONTENT_RATING.md`
  - Expected rating: **4+**
- **Category:** Lifestyle
- **Secondary Category:** Reference

### 5. Screenshots & Media
- Upload screenshots (minimum 1 per device size)
- App icon is already configured via Xcode

### 6. TestFlight (Optional - Already Set Up)
- Add internal/external testers
- Get feedback before public release

### 7. Submit for Review
- Select build: 1.2.0 (3)
- Answer export compliance: **NO** (already in app.json)
- Click **Submit for Review**
- Wait 1-3 days for Apple review

---

## 📋 Quick Copy-Paste Content

### Privacy Policy URL
**Once hosted, use this format:**
```
https://[YOUR-DOMAIN]/privacy-policy
```

### Short Description (80 chars)
```
Real-time prayer times and notifications for Al Taqwa Masjid
```

### Developer Email
```
[YOUR_EMAIL_ADDRESS]
```

### Support URL
```
[YOUR_SUPPORT_EMAIL_OR_WEBSITE]
```

### Keywords (Google Play Tags)
```
prayer times, salah times, muslim prayer, masjid app, mosque app, adhan notification, islamic app, namaz time, fajr dhuhr asr maghrib isha, al taqwa masjid, prayer reminder, muslim app
```

### Keywords (Apple - 100 chars)
```
prayer times,muslim,mosque,masjid,salah,adhan,islamic,namaz,notifications,al taqwa
```

---

## 🎨 Graphics Needed

### Google Play
1. **App Icon:** 512x512 PNG (high-res version of your icon)
2. **Feature Graphic:** 1024x500 PNG (banner for store page)
3. **Screenshots:**
   - Phone: Minimum 2 (recommended 4-8)
   - Tablet (optional): Minimum 2
   - Sizes: 16:9 or 9:16 aspect ratio

### Apple App Store
1. **App Icon:** Already configured via Xcode ✅
2. **Screenshots:**
   - iPhone 6.7": 1290x2796 or 1284x2778 (minimum 1)
   - iPhone 6.5": 1284x2778 or 1242x2688 (minimum 1)
   - iPhone 5.5": 1242x2208 (optional)
   - iPad Pro 12.9": 2048x2732 (optional)

**How to capture screenshots:**
- Use your physical device
- Open the app to prayer times screen
- Press Power + Volume Up (Android) or Power + Volume Up (iPhone)
- Transfer screenshots to computer

---

## 📊 Expected Ratings

| Store | Rating | Age Group |
|-------|--------|-----------|
| Google Play (IARC) | Everyone | All ages |
| Google Play (PEGI) | PEGI 3 | 3+ |
| Google Play (ESRB) | Everyone | All ages |
| Apple App Store | 4+ | 4 and up |

---

## ⏱️ Timeline

| Step | Time |
|------|------|
| Host privacy policy | 5-15 minutes |
| Create graphics (icon, banner) | 30-60 minutes |
| Take screenshots | 10-15 minutes |
| Fill Google Play forms | 30-45 minutes |
| Fill Apple App Store forms | 30-45 minutes |
| **Total Setup Time** | **2-3 hours** |
| **Google Review** | **1-3 days** |
| **Apple Review** | **1-3 days** |
| **Total to Live** | **1-3 days after submission** |

---

## 🔄 Next Steps

1. **Host Privacy Policy**
   - Choose hosting option (GitHub Pages recommended)
   - Upload `PRIVACY_POLICY.md` as HTML
   - Get public URL

2. **Create Graphics**
   - 512x512 app icon (high-res)
   - 1024x500 feature graphic (Google Play banner)
   - Use your existing mosque icon as base

3. **Take Screenshots**
   - Open app on your device
   - Capture prayer times screen
   - Minimum 2 screenshots

4. **Fill Google Play Console**
   - Upload AAB
   - Complete all App Content sections
   - Add store listing content
   - Submit for review

5. **Fill App Store Connect**
   - Add version 1.2.0 info
   - Upload screenshots
   - Complete App Privacy
   - Submit for review

6. **Monitor Reviews**
   - Check email for approval/rejection
   - Respond to any issues quickly
   - Typically approved within 1-3 days

---

## 📧 Contact Information Needed

Before publishing, prepare:

- **Developer Email:** [YOUR_EMAIL_ADDRESS]
- **Support Email/URL:** [YOUR_SUPPORT_CONTACT]
- **Website (optional):** [MASJID_OR_DEV_WEBSITE]
- **Privacy Policy URL:** [URL_WHERE_HOSTED]

---

## 🎯 Final Checklist Before Submitting

- [ ] Privacy policy hosted and URL obtained
- [ ] App icon 512x512 created
- [ ] Feature graphic 1024x500 created
- [ ] Screenshots captured (minimum 2)
- [ ] Google Play: All app content sections completed (green checkmarks)
- [ ] Google Play: Store listing filled out
- [ ] Apple: App privacy completed
- [ ] Apple: Version info filled out
- [ ] Apple: Screenshots uploaded
- [ ] Apple: Age rating completed
- [ ] Both: Release notes added
- [ ] Both: Contact information added
- [ ] Final app test on physical device ✅ (Already done)

---

## 🚨 Common Issues & Solutions

### Issue: Privacy Policy URL Required
**Solution:** Use GitHub Pages or Google Sites (free, takes 5 minutes)

### Issue: Screenshots Wrong Size
**Solution:** Use online tools like [Screenshot Resizer](https://www.photopea.com/) to resize

### Issue: Feature Graphic Needed
**Solution:** Create simple banner with mosque icon + app name + tagline using Canva (free)

### Issue: Content Rating Takes Too Long
**Solution:** Use answers from `CONTENT_RATING.md` - should take 5 minutes

### Issue: Data Safety Confusing
**Solution:** Just answer **NO** to all data collection (see `DATA_SAFETY.md`)

---

## 📚 Resources

- **Google Play Console:** https://play.google.com/console
- **App Store Connect:** https://appstoreconnect.apple.com
- **GitHub Pages Guide:** https://pages.github.com
- **Google Sites:** https://sites.google.com
- **Canva (Graphics):** https://www.canva.com
- **Screenshot Maker:** https://www.photopea.com

---

**You're ready to publish! All content is prepared. Just host the privacy policy, create graphics, and fill out the store forms using the provided content. Good luck! 🎉**
