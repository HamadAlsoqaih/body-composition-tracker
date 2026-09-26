import React from "react";

const ITEMS = [
  { title: "A more accurate maintenance estimate", text: "Your weigh-ins and food log are combined day by day to learn your real maintenance calories. It's shown with a range (for example 2,950 ± 180 kcal) and how much of it comes from your own data, and it updates once a week on a day you choose, so it doesn't jump around." },
  { title: "Water weight and typos handled", text: "Normal day-to-day water swings no longer throw off your numbers. Obvious entry errors are set aside (greyed out on the chart, and you can restore them). You can tag days like a salty meal, travel, illness or your cycle." },
  { title: "Log food the way you eat", text: "Add several entries per day (meals or snacks), and edit or delete each one. Mark a day complete when it's fully logged — days you didn't log no longer count as zero calories." },
  { title: "Dates fixed", text: "Entries made late at night or just after midnight are now saved on the correct day." },
  { title: "Targets that fit you", text: "Set your goal pace as a % of body weight per week. Protein, fat and carb targets are tailored to your body, and the on-track check looks at your trend over two weeks, not a single weigh-in. Your goal date is shown as a realistic range." },
  { title: "Fairer body composition readings", text: "Changes are judged from averages of readings from the same method (smart scale, DEXA or calipers) and only reported when they're bigger than that method's measurement noise. Waist can take 2–3 readings that are averaged." },
  { title: "Built-in safety", text: "Sensible minimum calorie targets, and extra care for under-18s, pregnancy or breastfeeding, and low body weight." },
  { title: "Your data, safer", text: "Everything you logged was carried over. You can now back up and restore, export spreadsheets (CSV) or a day-by-day file, and you'll get a reminder to back up every 30 days. kg/lb and cm/in are both supported." },
];

/** One-time notice for people who used an earlier version. */
export default function WhatsNew({ needsProfile, onClose, onReviewProfile }) {
  return (
    <div className="welcome" onClick={onClose}>
      <div className="welcomecard" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="What's new">
        <div className="wlogo">◐</div>
        <h2 className="wtitle">What's new in BodyTracker</h2>
        <p className="wlead">A big update to how your numbers are calculated. All your existing data is still here.</p>
        <div className="wfeatures">
          {ITEMS.map((it) => (
            <div key={it.title} className="wfeat"><b>{it.title}</b><span>{it.text}</span></div>
          ))}
        </div>
        {needsProfile && (
          <p className="wnote">One thing to check: earlier versions filled in height 175 cm, age 25 and a default activity level if you never changed them. Please confirm your profile so your estimates are right for you.</p>
        )}
        {needsProfile ? (
          <>
            <button className="wbtn" onClick={onReviewProfile}>Review my profile</button>
            <button className="wbtn" style={{ marginTop: 10, background: "#26303f", color: "#fff" }} onClick={onClose}>Later</button>
          </>
        ) : (
          <button className="wbtn" onClick={onClose}>Got it</button>
        )}
      </div>
    </div>
  );
}
