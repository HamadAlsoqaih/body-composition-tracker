export const css = `
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.app {
  --bg:#0b0e14; --panel:#141922; --line:#1c2230; --txt:#e8ecf2; --dim:#6b7480;
  background: var(--bg); color: var(--txt); min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
  padding: max(env(safe-area-inset-top), 16px) 16px calc(150px + env(safe-area-inset-bottom)) 16px;
  max-width: 640px; margin: 0 auto;
}
.top { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-end; gap:10px 8px; margin-bottom:22px; }
.headright { display:flex; align-items:center; gap:10px; margin-left:auto; }
.gear { border:1px solid var(--line); background:var(--panel); color:var(--dim); width:38px; height:38px; border-radius:12px; font-size:17px; }
.gear:active { transform:scale(.95); }
.eyebrow { font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--dim); margin-bottom:4px; }
h1 { margin:0; font-size:30px; font-weight:650; letter-spacing:-.02em; }
.basetoggle { display:flex; background:var(--panel); border:1px solid var(--line); border-radius:999px; padding:3px; }
.basetoggle button { border:0; background:transparent; color:var(--dim); font-size:12px; font-weight:600; padding:6px 12px; border-radius:999px; }
.basetoggle button.on { background:#26303f; color:#fff; }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-bottom:8px; }
.grid.tape { grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.sectlabel { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--dim); margin:26px 4px 12px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:16px 8px 14px; display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; transition:transform .12s, border-color .12s; min-width:0; }
.card:active { transform:scale(.97); border-color:#2e3a4d; }
.ringwrap { position:relative; display:flex; align-items:center; justify-content:center; width:100%; aspect-ratio:1 / 1; }
@supports not (aspect-ratio: 1 / 1) { .ringwrap { width:var(--ring-size); height:var(--ring-size); max-width:100%; } }
.ringtrack { width:100%; height:100%; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background .7s cubic-bezier(.4,0,.2,1); }
.ringhole { width:100%; height:100%; border-radius:50%; background:var(--panel); display:flex; flex-direction:column; align-items:center; justify-content:center; }
.ringinner { text-align:center; line-height:1; }
.val { font-size:24px; font-weight:680; letter-spacing:-.02em; }
.val.sm { font-size:18px; }
.u { font-size:10px; color:var(--dim); margin-top:3px; }
.clabel { font-size:13px; font-weight:600; margin-top:2px; }
.clabel.sm { font-size:11px; }
.clabel, .cdelta { max-width:100%; text-align:center; overflow-wrap:anywhere; }
.cdelta { font-size:12px; font-weight:600; }
.cdelta.sm { font-size:10px; }
.empty { text-align:center; color:var(--dim); padding:80px 20px; font-size:15px; }
.bottombar { position:fixed; bottom:0; left:0; right:0; display:flex; flex-direction:column; gap:10px; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:linear-gradient(to top, var(--bg) 78%, transparent); max-width:640px; margin:0 auto; }
.actions { display:flex; gap:12px; }
.actions button { flex:1; border:0; border-radius:16px; padding:15px; font-size:15px; font-weight:650; color:#fff; background:#26303f; }
.actions button.primary { background:#5aa9e6; color:#06121e; }
.actions button:active { transform:scale(.98); }
.tabswitch { display:flex; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:4px; }
.tabswitch button { flex:1; border:0; background:transparent; color:var(--dim); font-size:14px; font-weight:650; padding:10px 0; border-radius:10px; }
.tabswitch button.on { background:#26303f; color:#fff; }
/* nutrition */
.reccard { border-radius:20px; padding:18px; margin-bottom:14px; border:1px solid var(--line); background:var(--panel); }
.reccard[data-tone="cut"] { border-color:#7a3b46; background:linear-gradient(180deg,#241820,#141922); }
.reccard[data-tone="add"] { border-color:#2c5a3f; background:linear-gradient(180deg,#16241d,#141922); }
.reccard[data-tone="hold"] { border-color:#2a4258; background:linear-gradient(180deg,#141f28,#141922); }
.reclabel { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--dim); margin-bottom:8px; }
.rectext { font-size:16px; font-weight:550; line-height:1.4; }
.explainbtn { margin-top:12px; border:0; background:rgba(255,255,255,.06); color:var(--txt); font-size:13px; font-weight:600; padding:9px 14px; border-radius:10px; }
.explainbtn:active { transform:scale(.98); }
.detblock { margin-bottom:16px; }
.detlabel { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); margin-bottom:6px; }
.detbody { font-size:14px; line-height:1.55; color:var(--txt); }
.detbody b { font-weight:680; }
.mono { display:inline-block; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:3px 8px; margin-top:4px; color:#9fb4c8; }
.detnote { font-size:12.5px; line-height:1.5; color:var(--dim); background:var(--bg); border:1px dashed var(--line); border-radius:14px; padding:13px 15px; margin-top:4px; }
.statgrid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:14px; }
.stat { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:14px; }
.statnum { font-size:26px; font-weight:680; letter-spacing:-.02em; }
.statlab { font-size:12px; color:var(--dim); margin-top:4px; line-height:1.3; }
.statlab small { color:#4a525e; }
.protcard { border-radius:16px; padding:14px 16px; margin-bottom:14px; border:1px solid var(--line); background:var(--panel); }
.protcard.low { border-color:#7a5a2b; }
.protrow { display:flex; justify-content:space-between; align-items:center; font-size:15px; }
.protrow strong { font-weight:680; }
.protrow small { color:var(--dim); font-weight:500; }
.protnote { font-size:12.5px; color:var(--dim); margin-top:8px; line-height:1.4; }
.macrogrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
.macro { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:14px 16px; }
.macro.low { border-color:#7a5a2b; }
.macronum { font-size:24px; font-weight:680; letter-spacing:-.02em; }
.macronum span { font-size:14px; color:var(--dim); font-weight:500; margin-left:2px; }
.macrolab { font-size:12.5px; color:var(--dim); margin-top:2px; }
.macrolab small { color:#4a525e; }
.macronote { font-size:12.5px; line-height:1.45; color:var(--dim); border-radius:12px; padding:11px 14px; margin-bottom:10px; border:1px solid var(--line); background:var(--panel); }
.macronote.low { border-color:#5a4a2b; }
.notecard { font-size:12.5px; color:var(--dim); line-height:1.5; background:var(--panel); border:1px dashed var(--line); border-radius:14px; padding:12px 14px; margin-bottom:14px; }
.foodlist { display:flex; flex-direction:column; gap:6px; }
.foodrow { display:flex; justify-content:space-between; align-items:center; gap:10px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 14px; font-size:14px; }
.fdate { color:var(--dim); font-weight:600; flex:none; }
.fcal { font-weight:650; margin-left:auto; }
.fmacros { color:var(--dim); font-size:12.5px; flex:none; font-variant-numeric:tabular-nums; }
.segrow { display:flex; gap:6px; }
.seg { flex:1; border:1px solid var(--line); background:var(--bg); color:var(--dim); font-size:13px; font-weight:600; padding:11px 0; border-radius:11px; }
.seg.on { background:#5aa9e6; color:#06121e; border-color:#5aa9e6; }
.insights { margin-bottom:16px; }.insight { display:flex; gap:11px; align-items:flex-start; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:13px 15px; margin-bottom:8px; font-size:13.5px; line-height:1.45; }
.insight .idot { flex:none; width:8px; height:8px; border-radius:50%; margin-top:6px; }
.insight.warn .idot { background:#ffb020; }
.insight.warn { border-color:#5a4a2b; }
.insight.good .idot { background:#3ddc84; }
.insight.good { border-color:#2c5a3f; }
.insight.info .idot { background:#5aa9e6; }
.insight.info { border-color:#2a4258; }
.analysiscard { width:100%; text-align:left; border-radius:20px; padding:16px 18px; margin-bottom:14px; border:1px solid var(--line); background:var(--panel); }
.analysiscard[data-tone="good"] { border-color:#2c5a3f; background:linear-gradient(180deg,#16241d,#141922); }
.analysiscard[data-tone="warn"] { border-color:#5a4a2b; background:linear-gradient(180deg,#241f16,#141922); }
.analysiscard[data-tone="info"] { border-color:#2a4258; background:linear-gradient(180deg,#141f28,#141922); }
.analysiscard:active { transform:scale(.99); }
.anrow { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.anlabel { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--dim); }
.anconf { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:3px 8px; border-radius:999px; }
.anconf.high { background:rgba(61,220,132,.16); color:#3ddc84; }
.anconf.medium { background:rgba(90,169,230,.16); color:#5aa9e6; }
.anconf.low { background:rgba(255,176,32,.16); color:#ffb020; }
.anhead { font-size:17px; font-weight:640; line-height:1.3; }
.anhint { font-size:12px; color:var(--dim); margin-top:6px; }
.movegrid { display:flex; flex-direction:column; gap:6px; }
.moverow { display:flex; justify-content:space-between; align-items:center; background:var(--bg); border:1px solid var(--line); border-radius:11px; padding:11px 14px; font-size:14px; }
.moverow span { color:var(--dim); }
.moverow b { font-weight:680; }
.mv-good { color:#3ddc84; }
.mv-bad { color:#ff5c72; }
.mv-flat { color:#8a94a2; }
.sheet { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:flex-end; justify-content:center; z-index:50; backdrop-filter:blur(4px); }
.sheetinner { background:var(--panel); width:100%; max-width:480px; margin:0 auto; border-radius:24px 24px 0 0; padding:20px 18px calc(24px + env(safe-area-inset-bottom)); max-height:90vh; overflow-y:auto; overflow-x:hidden; border-top:1px solid var(--line); animation:up .28s cubic-bezier(.4,0,.2,1); }
@keyframes up { from { transform:translateY(100%); } }
.sheettop { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
.sheettop h2 { margin:0; font-size:19px; font-weight:640; }
.rangebar { display:flex; gap:6px; margin-bottom:14px; background:var(--bg); padding:4px; border-radius:12px; }
.rangebar button { flex:1; border:0; background:transparent; color:var(--dim); font-size:13px; font-weight:600; padding:8px 0; border-radius:9px; }
.rangebar button.on { background:#26303f; color:#fff; }
.x { border:0; background:#26303f; color:#fff; width:34px; height:34px; border-radius:50%; font-size:15px; }
.fld { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; min-width:0; }
.fld span { font-size:13px; color:var(--dim); font-weight:500; }
.fld span em { color:#ff5c72; font-style:normal; }
.fld span small { color:#4a525e; }
.fld input { width:100%; max-width:100%; min-width:0; -webkit-appearance:none; appearance:none; background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:13px 14px; color:var(--txt); font-size:16px; }
.fld input[type="date"] { display:block; text-align:left; }
.fld input:focus { outline:none; border-color:#5aa9e6; }
.tapegrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%; }
.hint { font-size:12px; color:var(--dim); margin:4px 0 0; line-height:1.4; }
.save { width:100%; border:0; border-radius:16px; padding:16px; font-size:16px; font-weight:650; background:#5aa9e6; color:#06121e; margin-top:8px; }
.save:active { transform:scale(.99); }
@media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
.welcome { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(5,7,11,.82); backdrop-filter:blur(8px); }
.welcomecard { background:var(--panel); border:1px solid var(--line); border-radius:26px; max-width:440px; width:100%; max-height:90vh; overflow-y:auto; padding:28px 22px calc(24px + env(safe-area-inset-bottom)); animation:pop .34s cubic-bezier(.2,.8,.2,1); }
@keyframes pop { from { opacity:0; transform:translateY(16px) scale(.97); } }
.wlogo { font-size:44px; line-height:1; color:#5aa9e6; text-align:center; margin-bottom:12px; }
.wtitle { margin:0 0 8px; font-size:26px; font-weight:680; letter-spacing:-.02em; text-align:center; }
.wlead { margin:0 0 22px; font-size:14.5px; line-height:1.5; color:var(--dim); text-align:center; }
.wfeatures { display:flex; flex-direction:column; gap:14px; margin-bottom:20px; }
.wfeat { display:flex; flex-direction:column; gap:3px; padding-left:14px; border-left:2px solid #26303f; }
.wfeat b { font-size:14.5px; font-weight:640; }
.wfeat span { font-size:13px; line-height:1.45; color:var(--dim); }
.wnote { font-size:12.5px; line-height:1.5; color:var(--dim); background:var(--bg); border:1px dashed var(--line); border-radius:14px; padding:12px 14px; margin:0 0 20px; }
.wbtn { width:100%; border:0; border-radius:16px; padding:16px; font-size:16px; font-weight:680; background:#5aa9e6; color:#06121e; }
.wbtn:active { transform:scale(.99); }

.sheetinner.wide { max-width:560px; }
.seg:disabled { opacity:.35; }
.fldhint { font-size:11.5px !important; color:#4a525e !important; line-height:1.35; }
.fld select { width:100%; background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:13px 14px; color:var(--txt); font-size:16px; -webkit-appearance:none; appearance:none; }
.fld input[type="time"] { display:block; text-align:left; }
.footer { text-align:center; font-size:11.5px; color:#4a525e; margin:28px 0 8px; line-height:1.5; }
.footer button { background:none; border:0; color:#5aa9e6; font-size:11.5px; padding:0 4px; }
.banner { display:flex; flex-direction:column; gap:8px; background:var(--panel); border:1px solid #2a4258; border-radius:14px; padding:12px 14px; margin-bottom:12px; font-size:13px; line-height:1.45; }
.banner.warn { border-color:#5a4a2b; }
.banner .brow { display:flex; gap:8px; flex-wrap:wrap; }
.btnsm { border:0; background:#26303f; color:#fff; font-size:12.5px; font-weight:650; padding:8px 12px; border-radius:10px; }
.btnsm.primary { background:#5aa9e6; color:#06121e; }
.btnsm.danger { background:#4a2530; color:#ffb3bf; }
.btnsm:disabled { opacity:.4; }
.bigstat { font-size:30px; font-weight:700; letter-spacing:-.02em; }
.pill { display:inline-block; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:3px 8px; border-radius:999px; margin-left:6px; vertical-align:middle; }
.pill.measured { background:rgba(61,220,132,.16); color:#3ddc84; }
.pill.estimated { background:rgba(255,176,32,.16); color:#ffb020; }
.subtle { font-size:12px; color:var(--dim); line-height:1.45; }
.dayrow { display:flex; align-items:center; gap:10px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:11px 12px; font-size:14px; width:100%; text-align:left; color:var(--txt); }
.dayrow .fdate { min-width:56px; }
.dayrow .dstat { font-size:11px; font-weight:700; padding:3px 7px; border-radius:999px; }
.dstat.done { background:rgba(61,220,132,.14); color:#3ddc84; }
.dstat.open { background:rgba(255,176,32,.14); color:#ffb020; }
.chips { display:flex; flex-wrap:wrap; gap:6px; margin:4px 0 12px; }
.chip { border:1px solid var(--line); background:var(--bg); color:var(--dim); font-size:12px; font-weight:600; padding:7px 10px; border-radius:999px; }
.chip.on { background:#26303f; color:#fff; border-color:#3a4a60; }
.entryrow { display:flex; align-items:center; gap:8px; background:var(--bg); border:1px solid var(--line); border-radius:11px; padding:10px 12px; margin-bottom:6px; font-size:13.5px; }
.entryrow .grow { flex:1; min-width:0; }
.entryrow .lbl { color:var(--dim); font-size:12px; }
.toggle { display:flex; align-items:center; justify-content:space-between; gap:12px; background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-bottom:12px; font-size:14px; }
.toggle input { width:22px; height:22px; accent-color:#5aa9e6; }
.kv { display:grid; grid-template-columns:1fr auto; gap:4px 12px; font-size:13px; margin-top:6px; }
.kv span:nth-child(odd) { color:var(--dim); }
.kv span:nth-child(even) { text-align:right; font-variant-numeric:tabular-nums; }
.tbl { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:6px; }
.tbl th, .tbl td { text-align:right; padding:6px 4px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; }
.tbl th:first-child, .tbl td:first-child { text-align:left; }
.tbl th { color:var(--dim); font-weight:600; }
.flagtxt { color:#ffb020; }
.oktxt { color:#3ddc84; }
.measure { color:#5aa9e6; }
.actlist { display:flex; flex-direction:column; gap:8px; margin:6px 0 14px; }
.activity { text-align:left; border:1px solid var(--line); background:var(--bg); color:var(--txt); border-radius:12px; padding:11px 13px; }
.activity b { font-size:14px; }
.activity small { display:block; color:var(--dim); font-size:12px; margin-top:3px; line-height:1.4; }
.activity.on { border-color:#5aa9e6; background:#12202c; }
.activity .fac { float:right; color:var(--dim); font-size:12px; }
.ignoredlist { margin-top:10px; }

.wn-card { position:relative; padding-top:22px; color:var(--txt); outline:none; }
.wn-close { position:absolute; top:14px; right:14px; }
.wn-card .wtitle { margin-right:36px; text-align:left; font-size:23px; }
.wn-card .wlead { text-align:left; margin-bottom:16px; color:#aab3bf; }
.wn-list { list-style:none; padding:0; margin:0 0 16px; }
.wn-list .wfeat span { color:#aab3bf; }
.wn-box { background:var(--bg); border:1px solid var(--line); border-radius:14px; padding:12px 14px; margin-bottom:12px; font-size:13.5px; line-height:1.5; }
.wn-box b { font-size:14.5px; }
.wn-box p { margin:4px 0 0; color:#aab3bf; }
.wn-secondary { margin-top:10px; background:#26303f; color:#fff; font-size:15px; padding:13px; }
.wn-next { font-size:13.5px; line-height:1.5; color:#aab3bf; margin:4px 0 10px; }
.wbtn:focus-visible, .wn-close:focus-visible { outline:2px solid #fff; outline-offset:2px; }
@media (max-width: 360px) {
  .welcome { padding:10px; }
  .welcomecard { padding:18px 14px calc(18px + env(safe-area-inset-bottom)); border-radius:20px; }
  .wn-card .wtitle { font-size:20px; }
  .wn-list .wfeat span, .wn-box { font-size:13px; }
}

@media (max-width: 400px) {
  .eyebrow { letter-spacing:.1em; }
  h1 { font-size:27px; }
  .headright { gap:6px; }
  .gear { width:34px; height:34px; }
  .basetoggle button { padding:6px 8px; }
}
`;
